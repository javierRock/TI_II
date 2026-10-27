import { parseArgs } from 'node:util';
import { createPool } from '../src/db/pool.js';
import { readEnv } from '../src/config/env.js';
import { hashPassword } from '../src/core/seguridad.js';
import { personSchema, accountSchema } from '../src/modules/personas/personas.schemas.js';
import { withTransaction } from '../src/db/transaction.js';
import { insertPerson } from '../src/modules/personas/personas.repository.js';
import { recordEvent } from '../src/modules/auditoria/auditoria.repository.js';

try {
  const { values } = parseArgs({
    options: {
      documento: { type: 'string' },
      nombre: { type: 'string' },
      correo: { type: 'string' },
      usuario: { type: 'string' },
      'password-stdin': { type: 'boolean' },
      'confirmar-autorizacion': { type: 'boolean' },
    },
  });
  if (!values['password-stdin'] || !values['confirmar-autorizacion'] || process.stdin.isTTY) {
    throw new Error(
      'Requiere --password-stdin, --confirmar-autorizacion y una contraseña por entrada estándar (no argumentos)',
    );
  }
  let secret = '';
  for await (const chunk of process.stdin) {
    secret += chunk;
    if (Buffer.byteLength(secret) > 1024) throw new Error('Entrada de contraseña demasiado grande');
  }
  secret = secret.replace(/\r?\n$/, '');
  const personInput = personSchema.safeParse({
    documento: values.documento,
    nombre_completo: values.nombre,
    correo: values.correo,
  });
  const accountInput = accountSchema.safeParse({
    nombre_usuario: values.usuario,
    password: secret,
    rol: 'personal_administrativo',
  });
  if (!personInput.success || !accountInput.success)
    throw new Error(
      'Datos inválidos; revisar documento, nombre, correo, usuario y contraseña de 12–128 caracteres',
    );
  const hash = await hashPassword(secret);
  secret = '';
  const pool = createPool(readEnv());
  try {
    const admin = await withTransaction(pool, async (client) => {
      await client.query("SELECT nombre FROM alcances_politica WHERE nombre='general' FOR UPDATE");
      if ((await client.query('SELECT id FROM usuarios WHERE atribucion_admin LIMIT 1')).rowCount) {
        throw new Error(
          'Ya existe un administrador: este comando solo crea el primero y no modifica cuentas existentes',
        );
      }
      await client.query("SET @actor_proceso='bootstrap:crear_admin'");
      const person = await insertPerson(client, personInput.data);
      const result = await client.query(
        "INSERT INTO usuarios(persona_id,nombre_usuario,password_hash,rol) VALUES (?,?,?,'personal_administrativo')",
        [person.id, accountInput.data.nombre_usuario, hash],
      );
      const id = result.insertId;
      await client.query(
        'UPDATE usuarios SET atribucion_admin=TRUE,atribucion_otorgada_en=UTC_TIMESTAMP(6),atribucion_otorgada_por=id WHERE id=?',
        [id],
      );
      await recordEvent(client, {
        proceso: 'bootstrap:crear_admin',
        entidad: 'usuarios',
        entidadId: id,
        accion: 'atribucion_inicial',
        detalle: { autorizacion_institucional_confirmada: true },
      });
      return { id, nombre_usuario: accountInput.data.nombre_usuario };
    });
    console.log('Administrador inicial creado:', admin);
  } finally {
    await pool.end();
  }
} catch (error) {
  console.error('No se pudo crear el administrador:', error.code ?? error.message);
  process.exitCode = 1;
}
