import { hashPassword } from '../src/core/seguridad.js';
import { withTransaction } from '../src/db/transaction.js';
import * as people from '../src/modules/personas/personas.repository.js';
import * as inventory from '../src/modules/inventario/inventario.repository.js';
import * as policies from '../src/modules/politicas/politicas.repository.js';
import { recordEvent } from '../src/modules/auditoria/auditoria.repository.js';
export async function seedDemo(pool, env) {
  for (const key of ['DEMO_ADMIN_PASSWORD', 'DEMO_USER_PASSWORD'])
    if (
      !env[key] ||
      env[key].length < 12 ||
      env[key].length > 128 ||
      env[key].startsWith('reemplazar')
    )
      throw new Error(`Configurar ${key}`);
  if (env.DEMO_ADMIN_PASSWORD === env.DEMO_USER_PASSWORD)
    throw new Error('Las contraseñas demo deben ser distintas');
  return withTransaction(pool, async (c) => {
    await policies.lockScopes(c, [null]);
    if (
      (await c.query("SELECT id FROM eventos_historial WHERE accion='demo.inicializada' LIMIT 1"))
        .rowCount
    )
      return { creada: false };
    for (const table of [
      'personas',
      'usuarios',
      'bienes',
      'prestamos',
      'reservas',
      'planes_estudio',
      'politicas_prestamo',
    ])
      if ((await c.query(`SELECT id FROM ${table} LIMIT 1`)).rowCount)
        throw new Error('La demo exige una base vacía; no se sobrescriben datos existentes');
    await c.query("SET @actor_proceso='seed:demo'");
    const school = 'Escuela Profesional de Ciencias de la Computación — UNSA';
    const plan = await people.insertPlan(c, {
      codigo: 'DEMO-PLAN',
      programa: school,
      nombre: 'Plan de demostración, no institucional',
      semestres: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    });
    const users = {};
    for (const [key, name, role, doc] of [
      ['admin', 'Patricia Valdivia Torres', 'personal_administrativo', 'DEMO-ADMIN-01'],
      ['estudiante1', 'Diego Quispe Salazar', 'estudiante', 'DEMO-EST-01'],
      ['estudiante2', 'Lucía Mamani Flores', 'estudiante', 'DEMO-EST-02'],
      ['docente', 'Andrés Cáceres Medina', 'docente', 'DEMO-DOC-01'],
    ]) {
      const person = await people.insertPerson(c, {
        documento: doc,
        nombre_completo: name,
        correo: `demo.${key}@example.test`,
      });
      const account = await people.insertAccount(
        c,
        person.id,
        { nombre_usuario: `demo.${key}`, rol: role },
        await hashPassword(key === 'admin' ? env.DEMO_ADMIN_PASSWORD : env.DEMO_USER_PASSWORD),
      );
      users[key] = account;
      if (key === 'admin')
        await c.query(
          'UPDATE usuarios SET atribucion_admin=TRUE,atribucion_otorgada_en=UTC_TIMESTAMP(6),atribucion_otorgada_por=id WHERE id=?',
          [account.id],
        );
      else
        await people.upsertProfile(
          c,
          account.id,
          role === 'estudiante'
            ? {
                tipo: role,
                codigo: doc,
                habilitado: true,
                plan_id: plan.id,
                semestre: 3,
              }
            : {
                tipo: role,
                codigo: doc,
                habilitado: true,
                especialidad: 'Algoritmos e ingeniería de software',
                vinculacion: `${school} — persona ficticia`,
              },
        );
    }
    const books = [
      [
        'Introduction to Algorithms',
        'Thomas H. Cormen; Charles E. Leiserson; Ronald L. Rivest; Clifford Stein',
        '4.ª (2022)',
        '9780262046305',
      ],
      [
        'Database System Concepts',
        'Abraham Silberschatz; Henry F. Korth; S. Sudarshan',
        '7.ª (2019)',
        '9780078022159',
      ],
      [
        'Operating System Concepts',
        'Abraham Silberschatz; Peter Baer Galvin; Greg Gagne',
        '10.ª',
        null,
      ],
      ['Computer Networking: A Top-Down Approach', 'James F. Kurose; Keith W. Ross', '8.ª', null],
      [
        'Artificial Intelligence: A Modern Approach',
        'Stuart Russell; Peter Norvig',
        '4.ª',
        '9780134610993',
      ],
      [
        'Clean Code: A Handbook of Agile Software Craftsmanship',
        'Robert C. Martin',
        '1.ª (2008)',
        '9780132350884',
      ],
    ];
    const types = await inventory.listTypes(c);
    for (const [i, [title, author, edition, isbn]] of books.entries()) {
      const good = await inventory.insertGood(c, {
        tipo_id: types.find((x) => x.codigo === 'libro').id,
        nombre: title,
        autor: author,
        edicion: edition,
        isbn,
        descripcion:
          'Referencia bibliográfica real; ejemplares simulados, no inventario institucional.',
      });
      for (let j = 1; j <= 2; j++)
        await inventory.insertUnit(c, {
          bien_id: good.id,
          codigo_inventario: `DEMO-LIB-${i + 1}-${j}`,
          custodia: 'escuela',
          adscrito_laboratorio: false,
          ubicacion: `${school} — biblioteca simulada`,
          condicion_fisica: 'Apto (inspección simulada)',
          accesorios: [],
          estado: 'disponible',
        });
    }
    for (const t of types.filter((x) => x.codigo !== 'libro')) {
      const g = await inventory.insertGood(c, {
        tipo_id: t.id,
        nombre: `${t.nombre} de demostración`,
        marca: 'Marca simulada',
        modelo: 'DEMO',
      });
      await inventory.insertUnit(c, {
        bien_id: g.id,
        codigo_inventario: `DEMO-${t.codigo.toUpperCase()}`,
        custodia: 'escuela',
        adscrito_laboratorio: false,
        ubicacion: `${school} — espacio simulado`,
        condicion_fisica: 'Apto (simulado)',
        accesorios: [],
        estado: 'disponible',
      });
    }
    const p = await policies.insertPolicy(c, {
      rol: null,
      nombre: 'Política de demostración sin validez institucional',
      vigencia_inicio: new Date(Date.now() - 60000),
      cupo_total: 2,
      duracion_cantidad: 7,
      duracion_unidad: 'dias',
      modalidades: ['retiro', 'en_sitio'],
      tolerancia_horas: 0,
    });
    await policies.approvePolicy(c, p.id, users.admin.id);
    await recordEvent(c, {
      proceso: 'seed:demo',
      entidad: 'demo',
      entidadId: '1',
      accion: 'demo.inicializada',
      detalle: {
        personas_ficticias: true,
        libros_reales: true,
        politica_simulada: true,
      },
    });
    console.log('Demo creada: 4 cuentas, 6 títulos reales, 16 unidades simuladas.');
    return { creada: true, users };
  });
}
