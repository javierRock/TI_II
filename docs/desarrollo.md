# Continuar el desarrollo de TI_II

## Entorno

Node.js 22+ (la versión de referencia está en `.nvmrc`), npm y PostgreSQL 18.
Desde `backend/`, instalar con `npm ci`, iniciar la base y aplicar las migraciones
como indica el README. `package-lock.json` fija la resolución de dependencias de npm.

El gestor de paquetes de referencia para el desarrollo y la CI es npm, con su
archivo de bloqueo versionado.

## Antes de cerrar un cambio

```sh
cd backend
npm run check
npm test
npm run test:integration
npm run test:demo
npm run test:browser
# O todos los pasos secuenciales:
npm run verify
```

`check` comprueba sintaxis de backend, frontend, scripts, pruebas y migraciones;
no realiza análisis de tipos ni sustituye un linter. Las suites de integración/navegador
deben ejecutarse secuencialmente sobre una base exclusiva con sufijo `_test`.
La suite de demostración requiere `ADMIN_DATABASE_URL` para crear y retirar solo
sus bases temporales. Playwright requiere Chromium (`npx playwright install chromium`) o un ejecutable
compatible por `BROWSER_EXECUTABLE_PATH`. No requiere desactivar el sandbox por defecto.

El workflow `.github/workflows/ci.yml` crea PostgreSQL 18 descartable, roles separados,
instala dependencias/navegador y ejecuta `verify`. Sus contraseñas solo pertenecen al
servicio temporal de CI. La presencia del workflow no confirma una ejecución remota.

## Añadir un caso de uso

1. Ubicarlo en el módulo de negocio correspondiente. Crear módulos cuando tengan
   comportamiento; no simular funciones pendientes mediante endpoints vacíos.
2. Validar el contrato con Zod y mantener los `bigint` como cadenas.
3. Mantener rutas pequeñas, reglas en servicio/funciones y SQL en repositorios.
4. Revalidar sesión y atribución con `actorTransaction` para cada escritura.
5. Coordinar operaciones dependientes en una sola transacción/conexión; conservar
   orden de bloqueo y responder a conflictos sin confirmar cambios parciales.
6. Añadir migraciones aditivas; no cambiar revisiones ya aplicadas.
7. Cubrir permisos, invariantes y rollback con pruebas; usar PostgreSQL para concurrencia.
8. Actualizar contrato, modelo y matriz de alcance según el comportamiento entregado.

## Seguridad y operación

No versionar `.env`, datos locales, cookies ni contraseñas. La API solo usa el rol
restringido; las credenciales de propietario/administración se reservan a herramientas.
La interfaz se sirve desde el mismo origen y no persiste secretos en el almacenamiento
del navegador. Los procesos institucionales y parámetros se cargan con autorización
real; las fixtures de prueba nunca se cargan en la base principal.
