import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { testPool } from '../helpers/database.js';
import { migrateDatabase } from '../../scripts/migrate.js';
import { seedDemo } from '../../scripts/seed-demo-data.js';
import { createApp } from '../../src/app.js';
import { withTransaction } from '../../src/db/transaction.js';

test('Segundo examen: cuatro módulos sobre MySQL real', async (t) => {
  const pool = testPool();
  let server;
  try {
    await migrateDatabase(pool);
    await seedDemo(pool, process.env);
    server = createApp(pool, { loginLimit: 1000 }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const origin = `http://127.0.0.1:${server.address().port}`,
      suffix = randomUUID().slice(0, 8);
    async function req(path, auth, body, method = body ? 'POST' : 'GET') {
      const r = await fetch(origin + '/api/v1' + path, {
        method,
        headers: {
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(auth ? { Cookie: auth.cookie, 'X-CSRF-Token': auth.csrf } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return {
        status: r.status,
        body: r.status === 204 ? null : await r.json(),
        r,
      };
    }
    async function login(name, password) {
      const x = await req('/auth/login', null, {
        nombre_usuario: name,
        password,
      });
      assert.equal(x.status, 200, JSON.stringify(x.body));
      return {
        id: x.body.usuario.id,
        cookie: x.r.headers.getSetCookie()[0].split(';')[0],
        csrf: x.body.csrf_token,
      };
    }
    const admin = await login('demo.admin', process.env.DEMO_ADMIN_PASSWORD);
    const plan = (await req('/planes-estudio', admin)).body.datos[0];
    async function borrower(n) {
      const person = (
        await req('/personas', admin, {
          documento: `TEST-${suffix}-${n}`,
          nombre_completo: `Persona ${n} de prueba`,
          correo: `${n}@example.test`,
        })
      ).body;
      const input = {
        nombre_usuario: `test.${suffix}.${n}`,
        password: process.env.DEMO_USER_PASSWORD,
        rol: 'estudiante',
        perfil: {
          tipo: 'estudiante',
          codigo: `${suffix}-${n}`,
          habilitado: true,
          plan_id: plan.id,
          semestre: 3,
        },
      };
      const result = await req(`/personas/${person.id}/cuenta`, admin, input);
      assert.equal(result.status, 201, JSON.stringify(result.body));
      return {
        ...(await login(input.nombre_usuario, input.password)),
        person: person.id,
      };
    }
    const a = await borrower('a'),
      b = await borrower('b'),
      c = await borrower('c');
    const types = (await req('/catalogo/tipos', a)).body.datos;
    const type = types.find((x) => x.codigo === 'libro');
    const good = (
      await req('/inventario/bienes', admin, {
        tipo_id: type.id,
        nombre: `Algoritmos prueba ${suffix}`,
        autor: 'Autor prueba',
        isbn: '9780262046305',
      })
    ).body;
    const device = (
      await req('/inventario/bienes', admin, {
        tipo_id: types.find((x) => x.codigo === 'visor_3d').id,
        nombre: `Visor prueba ${suffix}`,
        marca: 'Marca simulada',
        modelo: 'Prueba',
      })
    ).body;
    async function unit(n) {
      const x = await req('/inventario/unidades', admin, {
        bien_id: n === 1 ? device.id : good.id,
        codigo_inventario: `TEST-${suffix}-${n}`,
        ubicacion: 'Escuela',
        condicion_fisica: 'Apto',
        accesorios: [],
      });
      assert.equal(x.status, 201, JSON.stringify(x.body));
      return x.body;
    }
    const units = await Promise.all(Array.from({ length: 9 }, (_, i) => unit(i)));
    const start = new Date(Date.now() + 3600000),
      end = new Date(+start + 3600000);
    const reserve = (user, u, s = start, f = end) =>
      req('/reservas', user, {
        unidad_id: u.id,
        inicio: s.toISOString(),
        fin: f.toISOString(),
        uso_previsto: 'Evaluación de prueba',
      });
    const confirm = (id) => req(`/reservas/${id}/confirmar`, admin, {});
    const delivery = (user, u, venc = new Date(Date.now() + 3600000)) =>
      req('/prestamos', admin, {
        solicitante_id: user.id,
        unidad_id: u.id,
        vencimiento: venc.toISOString(),
        modalidad: 'retiro',
        condicion_entrega: 'Apto',
        accesorios_entrega: [],
        confirmar: true,
      });
    const receive = (id) =>
      req(`/prestamos/${id}/devolucion`, admin, {
        condicion_devolucion: 'Apto',
        accesorios_devolucion: [],
        apta: true,
        estado_unidad: 'disponible',
        confirmar: true,
      });
    await t.test('permisos, duplicados y credenciales', async () => {
      assert.equal((await req('/personas')).status, 401);
      assert.equal((await req('/personas', a)).status, 403);
      assert.equal(
        (
          await req('/auth/login', null, {
            nombre_usuario: 'demo.admin',
            password: 'incorrecta',
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await req('/inventario/unidades', admin, {
            bien_id: good.id,
            codigo_inventario: units[0].codigo_inventario,
            ubicacion: 'Escuela',
            condicion_fisica: 'Apto',
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await req('/inventario/bienes', admin, {
            tipo_id: type.id,
            nombre: 'Otro título, mismo ISBN',
            isbn: '9780262046305',
          })
        ).status,
        201,
      );
    });
    await t.test('reserva inválida, acceso ajeno y solicitud pendiente no bloqueante', async () => {
      assert.equal((await reserve(a, units[0], end, start)).status, 400);
      assert.equal((await reserve(a, units[0], new Date(Date.now() - 60000), end)).status, 400);
      const r = (await reserve(a, units[0])).body;
      assert.equal(
        (
          await req(`/reservas/${r.id}/cancelar`, b, {
            motivo: 'Intento ajeno',
          })
        ).status,
        403,
      );
      assert.equal((await req(`/reservas/${r.id}/confirmar`, a, {})).status, 403);
      assert.equal(
        (
          await req(`/reservas/${r.id}/cancelar`, a, {
            motivo: 'Cancelación propia',
          })
        ).status,
        200,
      );
      assert.equal((await confirm(r.id)).status, 409);
    });
    await t.test('dos confirmaciones simultáneas de la misma unidad: exactamente una', async () => {
      const r1 = (await reserve(a, units[0])).body,
        r2 = (await reserve(b, units[0])).body;
      const results = await Promise.all([confirm(r1.id), confirm(r2.id)]);
      assert.deepEqual(results.map((x) => x.status).sort(), [200, 409]);
      const next = (await reserve(c, units[0], end, new Date(+end + 3600000))).body;
      assert.equal((await confirm(next.id)).status, 200);
      assert.equal((await delivery(a, units[0], end)).status, 409);
    });
    await t.test(
      'cupo simultáneo entre tipos/unidades y disponibilidad por intervalo',
      async () => {
        const r1 = (
          await reserve(b, units[1], new Date(+start + 7200000), new Date(+end + 7200000))
        ).body;
        const r2 = (
          await reserve(b, units[2], new Date(+start + 7200000), new Date(+end + 7200000))
        ).body;
        const r3 = (
          await reserve(b, units[3], new Date(+start + 7200000), new Date(+end + 7200000))
        ).body;
        const results = await Promise.all([confirm(r1.id), confirm(r2.id), confirm(r3.id)]);
        assert.equal(results.filter((x) => x.status === 200).length, 2);
        assert.equal(results.filter((x) => x.status === 409).length, 1);
        const found = await req(
          `/catalogo/unidades?inicio=${encodeURIComponent(start.toISOString())}&fin=${encodeURIComponent(end.toISOString())}&disponible=true&q=TEST-${suffix}&limite=100`,
          a,
        );
        assert.equal(found.status, 200);
        assert.equal(
          found.body.datos.some((x) => x.unidad_id === units[0].id),
          false,
        );
        assert.ok(found.body.datos.every((x) => x.disponible === true));
        const interval = `inicio=${encodeURIComponent(start.toISOString())}&fin=${encodeURIComponent(end.toISOString())}&q=TEST-${suffix}&limite=100`;
        const busy = await req(`/catalogo/unidades?${interval}&disponible=false`, a);
        assert.equal(busy.status, 200);
        assert.ok(busy.body.datos.some((x) => x.unidad_id === units[0].id));
        assert.ok(busy.body.datos.every((x) => x.disponible === false));
        const all = await req(`/catalogo/unidades?${interval}`, a);
        assert.equal(all.body.total, units.length);
        assert.equal(all.body.total, found.body.total + busy.body.total);
        assert.ok(all.body.datos.every((x) => !('solicitante_id' in x)));
      },
    );
    await t.test('conversión concurrente, devolución y no reutilización de reserva', async () => {
      const s = new Date(Date.now() + 1200),
        f = new Date(+s + 60000),
        r = (await reserve(c, units[4], s, f)).body;
      assert.equal((await confirm(r.id)).status, 200);
      await delay(Math.max(0, +s - Date.now() + 30));
      const input = {
        vencimiento: f.toISOString(),
        modalidad: 'retiro',
        condicion_entrega: 'Apto',
        accesorios_entrega: [],
        confirmar: true,
      };
      const results = await Promise.all([
        req(`/reservas/${r.id}/prestamo`, admin, input),
        req(`/reservas/${r.id}/prestamo`, admin, input),
      ]);
      assert.deepEqual(results.map((x) => x.status).sort(), [201, 409]);
      const loan = results.find((x) => x.status === 201).body;
      assert.equal((await req(`/prestamos/${loan.id}`, a)).status, 404);
      assert.equal((await receive(loan.id)).status, 200);
      assert.equal((await receive(loan.id)).status, 200);
      assert.equal((await confirm(r.id)).status, 409);
    });
    await t.test('doble entrega concurrente y cuenta desactivada admite devolución', async () => {
      const results = await Promise.all([delivery(a, units[5]), delivery(b, units[5])]);
      assert.deepEqual(results.map((x) => x.status).sort(), [201, 409]);
      const loan = results.find((x) => x.status === 201).body,
        person = loan.solicitante_id === a.id ? a.person : b.person;
      assert.equal(
        (await req(`/personas/${person}/estado`, admin, { activo: false }, 'PATCH')).status,
        200,
      );
      assert.equal((await receive(loan.id)).status, 200);
      assert.equal((await req('/auth/me', loan.solicitante_id === a.id ? a : b)).status, 401);
    });
    await t.test('rollback de negocio y auditoría; historial protegido', async () => {
      const before = (await pool.query('SELECT COUNT(*) AS total FROM eventos_historial')).rows[0]
        .total;
      await assert.rejects(
        withTransaction(pool, async (connection) => {
          await connection.query(
            "INSERT INTO personas(documento,nombre_completo,correo) VALUES (?,'Rollback','r@example.test')",
            [`ROLL-${suffix}`],
          );
          throw new Error('simulado');
        }),
        /simulado/,
      );
      assert.equal(
        (await pool.query('SELECT COUNT(*) AS total FROM eventos_historial')).rows[0].total,
        before,
      );
      await assert.rejects(pool.query("UPDATE eventos_historial SET accion='alterada' LIMIT 1"));
      const events = JSON.stringify((await req('/auditoria?limite=100', admin)).body);
      assert.equal(events.includes('$argon2id$'), false);
      assert.equal(events.includes(process.env.DEMO_ADMIN_PASSWORD), false);
    });
    await t.test('vencido sigue ocupado, bloquea reservas y permite devolución', async () => {
      const x = await delivery(c, units[6], new Date(Date.now() + 1000));
      assert.equal(x.status, 201, JSON.stringify(x.body));
      await delay(1100);
      assert.equal((await req(`/prestamos/${x.body.id}`, admin)).body.estado, 'vencido');
      assert.equal((await reserve(c, units[6])).status, 409);
      assert.equal((await receive(x.body.id)).status, 200);
    });
    await t.test(
      'inspección no apta cancela reservas afectadas y nunca deja disponible',
      async () => {
        const r = (await reserve(c, units[7])).body;
        assert.equal((await confirm(r.id)).status, 200);
        const x = await delivery(c, units[7], new Date(Date.now() + 60000));
        assert.equal(x.status, 201, JSON.stringify(x.body));
        const invalid = {
          condicion_devolucion: 'Dañado',
          accesorios_devolucion: [],
          apta: false,
          estado_unidad: 'disponible',
          confirmar: true,
        };
        assert.equal((await req(`/prestamos/${x.body.id}/devolucion`, admin, invalid)).status, 400);
        assert.equal(
          (
            await req(`/prestamos/${x.body.id}/devolucion`, admin, {
              ...invalid,
              estado_unidad: 'mantenimiento',
            })
          ).status,
          200,
        );
        assert.equal(
          (await pool.query('SELECT estado FROM reservas WHERE id=?', [r.id])).rows[0].estado,
          'cancelada',
        );
        assert.equal((await reserve(c, units[7])).status, 409);
      },
    );
    await t.test(
      'políticas aprobadas no se editan y la cuenta API no altera esquema ni historial',
      async () => {
        const p = (await req('/politicas', admin)).body.datos.find((x) => x.aprobada_en);
        assert.equal(
          (await req(`/politicas/${p.id}`, admin, { cupo_total: 99 }, 'PATCH')).status,
          409,
        );
        const { createPool } = await import('../../src/db/pool.js');
        const { readEnv } = await import('../../src/config/env.js');
        const api = createPool(
          readEnv({
            ...process.env,
            DB_NAME: 'DBsistema_prestamos_test',
            DB_USER: 'prestamos_app',
          }),
        );
        try {
          await assert.rejects(api.query('DELETE FROM eventos_historial WHERE id=-1'));
          await assert.rejects(api.query('CREATE TABLE prueba_no_autorizada(id INT)'));
        } finally {
          await api.end();
        }
        const editor = createPool(readEnv({ ...process.env, DB_USER: 'prestamos_editor' }));
        try {
          assert.ok(
            (await editor.query('SELECT id,nombre_usuario FROM usuarios LIMIT 1')).rows.length,
          );
          await assert.rejects(editor.query('SELECT password_hash FROM usuarios LIMIT 1'));
          await assert.rejects(editor.query('SELECT * FROM sesiones LIMIT 1'));
          await editor.query('UPDATE personas SET contacto=contacto WHERE id=?', [c.person]);
          await assert.rejects(
            editor.query('UPDATE personas SET activo=FALSE WHERE id=?', [c.person]),
          );
          await assert.rejects(editor.query("UPDATE reservas SET estado='cancelada' WHERE id=-1"));
          await assert.rejects(
            editor.query("UPDATE prestamos SET estado_cierre='devuelto' WHERE id=-1"),
          );
        } finally {
          await editor.end();
        }
      },
    );
    await t.test('perfil deshabilitado impide solicitud y confirmación', async () => {
      const d = await borrower('perfil');
      const r = (await reserve(d, units[8])).body;
      await pool.query('UPDATE perfiles_academicos SET habilitado=FALSE WHERE usuario_id=?', [
        d.id,
      ]);
      assert.equal((await reserve(d, units[8])).status, 409);
      assert.equal((await confirm(r.id)).status, 409);
      assert.equal(
        (await pool.query('SELECT estado FROM reservas WHERE id=?', [r.id])).rows[0].estado,
        'pendiente',
      );
    });
    await t.test(
      'serie única hereda marca/modelo y bibliografía no corresponde a equipos',
      async () => {
        const branded = (
          await req('/inventario/bienes', admin, {
            tipo_id: types.find((x) => x.codigo === 'parlante').id,
            nombre: `Parlante ${suffix}`,
            marca: 'Marca simulada',
            modelo: 'Modelo de prueba',
          })
        ).body;
        const input = {
          bien_id: branded.id,
          codigo_inventario: `SERIE-${suffix}`,
          ubicacion: 'Escuela',
          condicion_fisica: 'Apto',
          serie: `SER-${suffix}`,
        };
        const first = await req('/inventario/unidades', admin, input);
        assert.equal(first.status, 201, JSON.stringify(first.body));
        assert.equal(first.body.marca, 'Marca simulada');
        assert.equal(
          (
            await req('/inventario/unidades', admin, {
              ...input,
              codigo_inventario: `SERIE2-${suffix}`,
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await req('/inventario/bienes', admin, {
              tipo_id: branded.tipo_id,
              nombre: 'Equipo con bibliografía inválida',
              isbn: '9780262046305',
            })
          ).status,
          400,
        );
      },
    );
    await t.test('fallo de auditoría de inventario revierte toda la conversión', async () => {
      const borrowerRollback = await borrower('rollback'),
        u = await unit('rollback');
      const s = new Date(Date.now() + 1200),
        f = new Date(+s + 60000);
      const r = (await reserve(borrowerRollback, u, s, f)).body;
      assert.equal((await confirm(r.id)).status, 200);
      await delay(Math.max(0, +s - Date.now() + 30));
      const before = (await pool.query('SELECT COUNT(*) AS total FROM eventos_historial')).rows[0]
        .total;
      const trigger = `prueba_auditoria_${suffix}`;
      await pool.query(`CREATE TRIGGER ${trigger} BEFORE INSERT ON eventos_historial FOR EACH ROW
        BEGIN IF NEW.entidad='unidades_inventario' AND NEW.entidad_id='${u.id}' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Fallo de auditoría simulado'; END IF; END`);
      const input = {
        vencimiento: f.toISOString(),
        modalidad: 'retiro',
        condicion_entrega: 'Apto',
        accesorios_entrega: [],
        confirmar: true,
      };
      try {
        assert.equal((await req(`/reservas/${r.id}/prestamo`, admin, input)).status, 409);
        assert.equal(
          (await pool.query('SELECT COUNT(*) AS total FROM prestamos WHERE reserva_id=?', [r.id]))
            .rows[0].total,
          0,
        );
        assert.equal(
          (await pool.query('SELECT estado FROM unidades_inventario WHERE id=?', [u.id])).rows[0]
            .estado,
          'disponible',
        );
        assert.equal(
          (await pool.query('SELECT estado FROM reservas WHERE id=?', [r.id])).rows[0].estado,
          'confirmada',
        );
        assert.equal(
          (await pool.query('SELECT COUNT(*) AS total FROM eventos_historial')).rows[0].total,
          before,
        );
      } finally {
        await pool.query(`DROP TRIGGER ${trigger}`);
      }
      const success = await req(`/reservas/${r.id}/prestamo`, admin, input);
      assert.equal(success.status, 201);
      assert.equal((await receive(success.body.id)).status, 200);
    });
    await t.test('mantenimiento con motivo cancela reservas y baja es terminal', async () => {
      const r = (await reserve(c, units[8])).body;
      assert.equal((await confirm(r.id)).status, 200);
      const path = `/inventario/unidades/${units[8].id}/estado`;
      assert.equal((await req(path, admin, { estado: 'mantenimiento' }, 'PATCH')).status, 400);
      assert.equal(
        (
          await req(
            path,
            admin,
            { estado: 'mantenimiento', motivo: 'Inspección preventiva' },
            'PATCH',
          )
        ).status,
        200,
      );
      assert.equal(
        (await pool.query('SELECT estado FROM reservas WHERE id=?', [r.id])).rows[0].estado,
        'cancelada',
      );
      assert.ok(
        (
          await pool.query(
            "SELECT id FROM eventos_historial WHERE entidad_id=? AND accion='unidad.estado' AND JSON_UNQUOTE(JSON_EXTRACT(detalle,'$.motivo'))='Inspección preventiva'",
            [units[8].id],
          )
        ).rows.length,
      );
      assert.equal(
        (
          await req(
            path,
            admin,
            { estado: 'baja', motivo: 'Desgaste irreversible', confirmar: true },
            'PATCH',
          )
        ).status,
        200,
      );
      assert.equal((await req(path, admin, { estado: 'disponible' }, 'PATCH')).status, 409);
      assert.equal(
        (
          await req('/inventario/unidades', admin, {
            bien_id: good.id,
            codigo_inventario: `EXCL-${suffix}`,
            ubicacion: 'Laboratorio',
            condicion_fisica: 'Apto',
            adscrito_laboratorio: true,
          })
        ).status,
        400,
      );
    });
    await t.test('expiración visible sin tarea periódica y persistida con auditoría', async () => {
      const expiryUnit = await unit('expiracion');
      const s = new Date(Date.now() + 1200),
        f = new Date(+s + 500);
      const r = (await reserve(c, expiryUnit, s, f)).body;
      assert.equal((await confirm(r.id)).status, 200);
      await delay(Math.max(0, +f - Date.now() + 30));
      const list = await req('/reservas/mias?estado=vencida&limite=100', c);
      assert.ok(list.body.datos.some((x) => x.id === r.id && x.estado === 'vencida'));
      assert.equal((await confirm(r.id)).status, 409);
      const { expire } = await import('../../src/modules/reservas/reservas.repository.js');
      await withTransaction(pool, expire);
      assert.equal(
        (await pool.query('SELECT estado FROM reservas WHERE id=?', [r.id])).rows[0].estado,
        'vencida',
      );
      assert.ok(
        (
          await pool.query(
            "SELECT id FROM eventos_historial WHERE entidad='reservas' AND entidad_id=? AND accion='update'",
            [r.id],
          )
        ).rows.length,
      );
    });
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
});
