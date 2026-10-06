import { parseArgs } from 'node:util';
import pg from 'pg';
import { databaseUrls } from '../src/config/env.js';
import { hashPassword } from '../src/core/seguridad.js';
import { personSchema, accountSchema } from '../src/modules/personas/personas.schemas.js';
import { withTransaction } from '../src/db/transaction.js';
import { insertPerson } from '../src/modules/personas/personas.repository.js';
import { recordEvent } from '../src/modules/auditoria/auditoria.repository.js';

try {
  const { values } = parseArgs({ options: {
    documento: { type: 'string' }, nombre: { type: 'string' }, correo: { type: 'string' }, usuario: { type: 'string' },
    'password-stdin': { type: 'boolean' }, 'confirmar-autorizacion': { type: 'boolean' },
  } });
  if (!values['password-stdin'] || !values['confirmar-autorizacion'] || process.stdin.isTTY) {
    throw new Error('Requiere --password-stdin, --confirmar-autorizacion y una contraseña por entrada estándar (no argumentos)');
  }
  let secret = '';
  for await (const chunk of process.stdin) {
    secret += chunk;
    if (Buffer.byteLength(secret) > 1024) throw new Error('Entrada de contraseña demasiado grande');
  }
  secret = secret.replace(/\r?\n$/, '');
  const personInput = personSchema.safeParse({ documento: values.documento, nombre_completo: values.nombre, correo: values.correo });
  const accountInput = accountSchema.safeParse({ nombre_usuario: values.usuario, password: secret, rol: 'personal_administrativo' });
  if (!personInput.success || !accountInput.success) throw new Error('Datos inválidos; revisar documento, nombre, correo, usuario y contraseña de 12–128 caracteres');
  const hash = await hashPassword(secret);
  secret = '';
  const pool = new pg.Pool({ connectionString: databaseUrls().migration });
  try {
    const admin = await withTransaction(pool, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('prestamos.bootstrap_admin', 0))");
      if ((await client.query('SELECT id FROM prestamos.usuarios WHERE atribucion_admin LIMIT 1')).rowCount) {
        throw new Error('Ya existe un administrador: este comando solo crea el primero y no modifica cuentas existentes');
      }
      await client.query("SELECT set_config('app.actor_proceso', 'bootstrap:crear_admin', true)");
      const person = await insertPerson(client, personInput.data);
      const id = (await client.query("SELECT nextval(pg_get_serial_sequence('prestamos.usuarios', 'id')) AS id")).rows[0].id;
      await client.query(`INSERT INTO prestamos.usuarios
        (id, persona_id, nombre_usuario, password_hash, rol, atribucion_admin, atribucion_otorgada_en, atribucion_otorgada_por)
        OVERRIDING SYSTEM VALUE VALUES ($1, $2, $3, $4, 'personal_administrativo', true, clock_timestamp(), $1)`,
      [id, person.id, accountInput.data.nombre_usuario, hash]);
      await recordEvent(client, { proceso: 'bootstrap:crear_admin', entidad: 'usuarios', entidadId: id,
        accion: 'atribucion_inicial', detalle: { autorizacion_institucional_confirmada: true } });
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
