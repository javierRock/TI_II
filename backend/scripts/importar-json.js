import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { createPool } from '../src/db/pool.js';
import { readEnv } from '../src/config/env.js';
import { withTransaction } from '../src/db/transaction.js';
import { recordEvent } from '../src/modules/auditoria/auditoria.repository.js';

const tables = [
  'personas',
  'usuarios',
  'planes_estudio',
  'semestres_plan',
  'perfiles_academicos',
  'tipos_bien',
  'bienes',
  'unidades_inventario',
  'politicas_prestamo',
  'reservas',
  'prestamos',
];
export async function importData(pool, source) {
  if (source.origen !== 'postgresql' || source.version !== 1 || !source.tablas)
    throw new Error('Formato de exportación inválido');
  for (const table of [...tables, 'eventos_historial'])
    if (!Array.isArray(source.tablas[table] ?? []))
      throw new Error('Se requieren listas de registros');
  if (source.tablas.tipos_bien?.length !== 5)
    throw new Error('La exportación debe incluir los cinco tipos de bien');
  for (const rows of Object.values(source.tablas))
    for (const row of rows)
      for (const [key, value] of Object.entries(row))
        if (
          (key === 'id' || key.endsWith('_id') || key.endsWith('_por')) &&
          typeof value === 'number' &&
          !Number.isSafeInteger(value)
        )
          throw new Error('Exportar identificadores bigint como cadenas para no perder precisión');
  return withTransaction(pool, async (c) => {
    for (const table of tables.filter((x) => x !== 'tipos_bien'))
      if ((await c.query(`SELECT id FROM ${table} LIMIT 1`)).rowCount)
        throw new Error('La importación exige un destino vacío sin demo');
    await c.query("SET @actor_proceso='importacion:postgresql'");
    await c.query('DELETE FROM tipos_bien');
    async function insert(table, row) {
      const columns = (await c.query(`SHOW COLUMNS FROM ${table}`)).rows.filter(
        (x) => !x.Extra.includes('GENERATED'),
      );
      const names = columns
        .filter((x) => Object.hasOwn(row, x.Field) && row[x.Field] !== undefined)
        .map((x) => x.Field);
      const values = names.map((name) => {
        const column = columns.find((x) => x.Field === name),
          value = row[name];
        if (value == null) return null;
        if (column.Type === 'json')
          return typeof value === 'string' ? value : JSON.stringify(value);
        if (column.Type.startsWith('datetime')) return new Date(value);
        return value;
      });
      await c.query(
        `INSERT INTO ${table} (${names.map((x) => '`' + x + '`').join(',')}) VALUES (${names.map(() => '?').join(',')})`,
        values,
      );
    }
    for (const table of tables) {
      for (const row of source.tablas[table] ?? []) {
        if (table === 'usuarios')
          await insert(table, {
            ...row,
            atribucion_admin: false,
            atribucion_otorgada_por: null,
          });
        else await insert(table, row);
      }
      if (table === 'usuarios')
        for (const row of source.tablas.usuarios ?? [])
          if (row.atribucion_admin)
            await c.query(
              'UPDATE usuarios SET atribucion_admin=TRUE,atribucion_otorgada_por=?,atribucion_otorgada_en=? WHERE id=?',
              [row.atribucion_otorgada_por, new Date(row.atribucion_otorgada_en), row.id],
            );
    }
    // Se conserva la auditoría de importación y se añade el historial original.
    // Sus identificadores previos se guardan como referencias, sin colisionar con los nuevos.
    for (const event of source.tablas.eventos_historial ?? [])
      await insert('eventos_historial', {
        ...event,
        id: undefined,
        detalle: {
          ...event.detalle,
          importacion: {
            id_original: event.id,
            corrige_evento_original: event.corrige_evento_id ?? null,
          },
        },
      });
    await recordEvent(c, {
      proceso: 'importacion:postgresql',
      entidad: 'importacion',
      entidadId: '1',
      accion: 'importacion.completada',
      detalle: {
        recuentos: Object.fromEntries(tables.map((x) => [x, (source.tablas[x] ?? []).length])),
        sesiones_importadas: false,
      },
    });
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({
    options: { archivo: { type: 'string' }, confirmar: { type: 'boolean' } },
  });
  if (!values.archivo || !values.confirmar)
    throw new Error('Usar --archivo exportacion.export.json --confirmar sobre un destino vacío');
  const pool = createPool(readEnv());
  try {
    await importData(pool, JSON.parse(await readFile(values.archivo, 'utf8')));
    console.log('Importación confirmada; verificar recuentos y login antes de retirar PostgreSQL.');
  } catch (error) {
    console.error('Importación revertida:', error.code ?? error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
