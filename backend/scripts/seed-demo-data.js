import { hashPassword } from '../src/core/seguridad.js';
import { withTransaction } from '../src/db/transaction.js';
import { personSchema, accountSchema, profileSchema, planSchema } from '../src/modules/personas/personas.schemas.js';
import * as people from '../src/modules/personas/personas.repository.js';
import * as inventory from '../src/modules/inventario/inventario.repository.js';
import * as policies from '../src/modules/politicas/politicas.repository.js';
import * as loans from '../src/modules/prestamos/prestamos.repository.js';
import { recordEvent } from '../src/modules/auditoria/auditoria.repository.js';

const marker = { proceso: 'seed:demo', entidad: 'demo', entidadId: 'v1', accion: 'demo.inicializada' };
const emptyTables = ['personas', 'usuarios', 'planes_estudio', 'semestres_plan', 'perfiles_academicos',
  'sesiones', 'bienes', 'unidades_inventario', 'politicas_prestamo', 'prestamos'];

export async function seedDemo(pool, configuration) {
  return withTransaction(pool, async (client) => {
    const database = (await client.query('SELECT current_database() AS nombre')).rows[0].nombre;
    if (!/^[a-z][a-z0-9_]*_demo$/.test(database)) throw new Error('El seed solo puede escribir en una base _demo');
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('prestamos.seed.demo.v1', 0))");
    const previous = await client.query(`SELECT detalle FROM prestamos.eventos_historial
      WHERE actor_proceso = $1 AND entidad = $2 AND entidad_id = $3 AND accion = $4`,
    [marker.proceso, marker.entidad, marker.entidadId, marker.accion]);
    if (previous.rowCount) return { creada: false, ...previous.rows[0].detalle };

    // No mezclar la demostración con una base preexistente. Bloquear escrituras
    // durante la carga inicial; todo se confirma o revierte conjuntamente.
    await client.query(`LOCK TABLE ${emptyTables.map((name) => `prestamos.${name}`).join(', ')} IN SHARE ROW EXCLUSIVE MODE`);
    for (const table of emptyTables) {
      if ((await client.query(`SELECT 1 FROM prestamos.${table} LIMIT 1`)).rowCount) {
        throw new Error('La base demo contiene registros ajenos al seed; no se modificó ningún dato');
      }
    }
    await client.query("SELECT set_config('app.actor_proceso', 'seed:demo', true)");
    const plan = await people.insertPlan(client, planSchema.parse({ codigo: 'DEMO-PLAN-01',
      programa: 'Computación — DEMOSTRACIÓN', nombre: 'Plan ficticio, no institucional',
      semestres: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }));
    const users = {};
    for (const definition of [
      { key: 'admin', username: 'demo.admin', role: 'personal_administrativo', name: 'Administrador DEMO', document: 'DEMO-ADMIN-01' },
      { key: 'student1', username: 'demo.estudiante1', role: 'estudiante', name: 'Estudiante Uno DEMO', document: 'DEMO-EST-01' },
      { key: 'student2', username: 'demo.estudiante2', role: 'estudiante', name: 'Estudiante Dos DEMO', document: 'DEMO-EST-02' },
      { key: 'teacher', username: 'demo.docente', role: 'docente', name: 'Docente DEMO', document: 'DEMO-DOC-01' },
    ]) {
      const person = await people.insertPerson(client, personSchema.parse({ documento: definition.document,
        nombre_completo: definition.name, correo: `${definition.username}@example.test` }));
      const profile = definition.role === 'estudiante'
        ? { tipo: 'estudiante', codigo: definition.document, habilitado: true, plan_id: plan.id, semestre: 3 }
        : definition.role === 'docente'
          ? { tipo: 'docente', codigo: definition.document, habilitado: true,
            especialidad: 'Especialidad ficticia', vinculacion: 'Escuela — DEMOSTRACIÓN' } : undefined;
      const input = accountSchema.parse({ nombre_usuario: definition.username, rol: definition.role,
        password: definition.key === 'admin' ? configuration.adminPassword : configuration.userPassword,
        ...(profile ? { perfil: profile } : {}) });
      const hash = await hashPassword(input.password);
      let account;
      if (definition.key === 'admin') {
        const id = (await client.query("SELECT nextval(pg_get_serial_sequence('prestamos.usuarios', 'id')) AS id")).rows[0].id;
        account = (await client.query(`INSERT INTO prestamos.usuarios
          (id, persona_id, nombre_usuario, password_hash, rol, atribucion_admin, atribucion_otorgada_en, atribucion_otorgada_por)
          OVERRIDING SYSTEM VALUE VALUES ($1, $2, $3, $4, 'personal_administrativo', true, clock_timestamp(), $1)
          RETURNING id, nombre_usuario`, [id, person.id, input.nombre_usuario, hash])).rows[0];
        await recordEvent(client, { ...marker, entidad: 'usuarios', entidadId: account.id,
          accion: 'atribucion_demo', detalle: { solo_demostracion: true, autorizacion_institucional: false } });
      } else {
        account = await people.insertAccount(client, person.id, input, hash);
        await people.upsertProfile(client, account.id, profileSchema.parse(profile));
      }
      users[definition.key] = { id: account.id, usuario: account.nombre_usuario };
    }

    await client.query("SELECT set_config('app.actor_proceso', '', true), set_config('app.actor_usuario_id', $1, true)", [users.admin.id]);
    const units = {};
    for (const definition of [
      { key: 'book', type: 'libro', name: 'Libro de algoritmos DEMO', author: 'Autor ficticio', count: 2, accessories: [] },
      { key: 'table', type: 'mesa_ping_pong', name: 'Mesa de ping-pong DEMO', count: 1, accessories: ['Red', 'Paleta', 'Paleta', 'Pelota'] },
      { key: 'headset', type: 'visor_3d', name: 'Visor 3D DEMO', count: 1, accessories: ['Control', 'Control', 'Cable USB'] },
      { key: 'speaker', type: 'parlante', name: 'Parlante DEMO', count: 2, accessories: ['Cable de alimentación'] },
      { key: 'robot', type: 'carrito_robotica', name: 'Carrito de robótica DEMO', count: 1, accessories: ['Batería', 'Cable USB'] },
    ]) {
      const type = (await client.query('SELECT id FROM prestamos.tipos_bien WHERE codigo = $1 AND habilitado', [definition.type])).rows[0];
      if (!type) throw new Error('Faltan los tipos de bien habilitados; ejecutar migraciones');
      const good = await inventory.insertGood(client, { tipo_id: type.id, nombre: definition.name,
        descripcion: 'Registro ficticio para probar el sistema. No representa un bien institucional.',
        ...(definition.author ? { autor: definition.author, edicion: 'Edición DEMO' }
          : { marca: 'Marca DEMO', modelo: definition.key.toUpperCase() }) });
      units[definition.key] = [];
      for (let number = 1; number <= definition.count; number++) {
        const unit = await inventory.insertUnit(client, { bien_id: good.id,
          codigo_inventario: `DEMO-${definition.key.toUpperCase()}-${number.toString().padStart(2, '0')}`,
          custodia: 'escuela', adscrito_laboratorio: false, ubicacion: 'Escuela — ubicación ficticia DEMO',
          condicion_fisica: 'Apto, inspección ficticia de demostración', accesorios: definition.accessories,
          estado: 'disponible', observaciones: 'SOLO DEMOSTRACIÓN; no usar como registro real.' });
        units[definition.key].push(unit);
      }
    }

    await policies.lockScopes(client, [null]);
    const now = await policies.dbNow(client);
    const policy = await policies.insertPolicy(client, { rol: null, nombre: 'Política ficticia DEMO — sin validez institucional',
      vigencia_inicio: new Date(now.getTime() - 60000), cupo_total: 2,
      duracion_cantidad: 7, duracion_unidad: 'dias', modalidades: ['en_sitio', 'retiro'], tolerancia_horas: 0 });
    await policies.approvePolicy(client, policy.id, users.admin.id);
    await recordEvent(client, { actorId: users.admin.id, entidad: 'politicas_prestamo', entidadId: policy.id,
      accion: 'politica.aprobada', detalle: { solo_demostracion: true, referencia_aprobacion: 'SIMULACIÓN DEMO, no autorización institucional' } });

    const due = new Date((await policies.dbNow(client)).getTime() + 24 * 3600000).toISOString();
    const active = await loans.insertLoan(client, users.admin.id, { solicitante_id: users.student1.id,
      unidad_id: units.book[0].id, vencimiento: due,
      modalidad: 'retiro', condicion_entrega: units.book[0].condicion_fisica,
      accesorios_entrega: units.book[0].accesorios, observaciones_entrega: 'Préstamo ficticio DEMO para probar devolución.' });
    const returned = await loans.insertLoan(client, users.admin.id, { solicitante_id: users.teacher.id,
      unidad_id: units.speaker[0].id, vencimiento: due,
      modalidad: 'retiro', condicion_entrega: units.speaker[0].condicion_fisica,
      accesorios_entrega: units.speaker[0].accesorios, observaciones_entrega: 'Préstamo ficticio DEMO para mostrar historial.' });
    const inspection = { condicion_devolucion: 'Apto tras inspección ficticia DEMO',
      accesorios_devolucion: units.speaker[0].accesorios, apta: true, estado_unidad: 'disponible',
      observaciones_devolucion: 'Devolución ficticia de demostración.' };
    await loans.closeLoan(client, returned.id, users.admin.id, inspection);
    await loans.receiveUnit(client, returned.unidad_id, inspection);
    await recordEvent(client, { actorId: users.admin.id, entidad: 'prestamos', entidadId: returned.id,
      accion: 'prestamo.devuelto', detalle: { solo_demostracion: true, apta: true, destino: 'disponible' } });

    const manifest = { solo_demostracion: true, cuentas: users, plan_id: plan.id,
      politica_id: policy.id, fichas: 5, unidades: 7, prestamo_activo_id: active.id, prestamo_devuelto_id: returned.id };
    await client.query("SELECT set_config('app.actor_usuario_id', '', true), set_config('app.actor_proceso', 'seed:demo', true)");
    await recordEvent(client, { ...marker, detalle: manifest });
    return { creada: true, ...manifest };
  });
}
