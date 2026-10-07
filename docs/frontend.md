# Interfaz web de préstamos directos

## Ejecutar

Desde `backend/`, iniciar PostgreSQL/migraciones y `npm run dev` como indica el
README. Abrir `http://127.0.0.1:3000`, usando exactamente el origen configurado
en `APP_ORIGIN`. No abrir `frontend/index.html` como archivo local ni usar un
servidor web en otro puerto: la sesión y los controles de origen necesitan el
mismo origen que la API.

El primer administrador sigue creándose por el comando autorizado; la web no
crea administradores, no admite auto-registro ni recupera contraseñas.

## Organización

```text
frontend/
├── index.html             acceso y estructura de navegación
├── styles.css             estilos y adaptación móvil
└── js/
    ├── app.js             recuperación de sesión y navegación por fragmentos
    ├── api.js             fetch JSON, CSRF en memoria y errores
    ├── format.js          fechas, etiquetas y conversiones explícitas
    ├── ui.js              DOM seguro, tablas, formularios y paginación
    ├── lookup.js          selectores con búsquedas paginadas
    └── views/             catálogo/inventario, préstamos, personas/planes,
                          políticas y auditoría
```

JavaScript nativo con módulos ES; no hay bundler, framework, CDN ni fuentes externas.
El `package.json` de frontend solo declara ES modules para probar sus helpers con Node.
Express sirve exclusivamente ese directorio, no la raíz del proyecto ni secretos.

## Flujo de trabajo administrativo

1. Registrar los planes y semestres institucionales autorizados si se crearán estudiantes.
2. Registrar persona, abrir **Gestionar**, crear cuenta y su perfil correspondiente.
   La casilla de habilitación se marca solo después de validar institucionalmente.
   Una cuenta administrativa no obtiene atribución administrativa por su rol.
3. Crear ficha bajo **Fichas de bienes** y después registrar su unidad en **Inventario**.
   Seleccionar estado inspeccionado, ubicación, condición y accesorios. La serie
   necesita marca/modelo: se heredan de la ficha si no se indican para la unidad.
4. Crear borrador en **Políticas** con valores autorizados. Revisar y aprobar
   aportando la referencia institucional. Para sustituir otra versión, indicar
   su ID y respetar la vigencia futura del nuevo borrador.
5. Entregar desde la unidad disponible o desde **Entregas y devoluciones**.
   Buscar la persona y verificar unidad, modalidad, vencimiento y accesorios.
   La API resuelve el ID de cuenta y valida de nuevo permiso, disponibilidad,
   perfil, política y cupo. El navegador no decide esas condiciones.
6. Recibir desde el préstamo abierto. Anotar condición, accesorios realmente
   recibidos, aptitud y destino. La baja exige motivo y confirmación.
7. Consultar eventos en **Auditoría**; los datos se muestran como texto, no como HTML.

Gestión de personas permite editar contacto, desactivar/reactivar persona, cambiar
estado/rol de cuenta y registrar/actualizar perfiles. Activar una persona no activa
su cuenta automáticamente. Cambiar rol exige perfil registrado y revoca sesiones.
Desactivar o cambiar la propia cuenta puede hacer perder acceso: se advierte antes.

Inventario permite editar unidades no prestadas y no dadas de baja, y cambiar su
estado por separado. Reponer accesorios o salir de mantenimiento no cambia la
inspección histórica de devoluciones. La baja es terminal. Para una unidad prestada,
primero registrar su devolución: no se evade mediante el editor de inventario.

## Seguridad y comportamiento

- Autenticación por cookie HttpOnly; no se persisten contraseñas, CSRF ni sesión en
  almacenamiento web. La contraseña del formulario se limpia al terminar el intento.
- Roles y atribución determinan la navegación. La API siempre aplica sus propios
  permisos y no expone préstamos ajenos a cuentas sin permiso administrativo.
- Si una petición devuelve 401, se cierran formularios, se cancelan lecturas y se
  retiran identidad y datos visibles. La recarga recupera sesión con `/auth/me`.
- CSP permite scripts/estilos/conexiones propios y no scripts ni estilos inline.
  Datos externos se insertan mediante `textContent`/nodos de texto; no `innerHTML`.
  La directiva de upgrade HTTPS permanece en producción, no en HTTP local.
- Lecturas antiguas se cancelan o descartan al cambiar sección/búsqueda. Escrituras
  no se reintentan automáticamente: una desconexión puede ocurrir después de guardar.
- Durante un envío se bloquean botones y cierre por Escape. El servidor conserva
  invariantes transaccionales aunque se cierre el navegador.
- Identificadores PostgreSQL bigint permanecen cadenas. Solo cantidades y semestres
  se convierten a números. Accesorios repetidos representan cantidades reales.
- Tablas y selectores usan paginación del servidor; no cargan bases completas.
- Formularios etiquetados, foco visible, diálogos nativos, mensajes accesibles y
  tablas desplazables en pantallas estrechas. Esto no equivale a certificación WCAG.

## Validación

Desde `backend/`:

```sh
npm test
npm run test:integration
npm run test:browser
```

Playwright lanza Chromium/Chrome contra la API real y `prestamos_test`; nunca contra
la base principal. Cubre acceso, cookie HttpOnly, CSRF, contenido HTML malicioso,
vista móvil, registro de plan/persona/cuenta, políticas, ficha/unidad, entrega con
plazo inválido, doble envío, devolución con faltantes, mantenimiento, préstamos
propios, restauración/revocación de sesión, auditoría, desconexión y logout.

Capturas: `.local/browser-tests/`. La dependencia de navegador es solo de desarrollo.
No ejecutar integración y navegador a la vez contra la misma base de pruebas;
comparten alcances de políticas. Las fixtures son ficticias e identificadas por UUID.

## Límites del avance

No hay reservas, renovaciones, garantías, incidencias formales, pérdidas, sanciones,
recuperación de contraseña ni delegación administrativa. Tampoco selección futura
de disponibilidad: el catálogo muestra únicamente disponibilidad física actual.
El backend rechaza obligaciones no soportadas; el frontend no las simula.

En esta interfaz los periodos históricos y algunos filtros avanzados de API todavía
no tienen controles específicos. Los ID de sustitución y de cuenta en el filtro
administrativo se introducen como cadenas; los detalles muestran cómo identificarlos.
Para otro flujo avanzado puede usarse el contrato de [api.md](api.md).

No se afirma que el sistema esté listo para producción: faltan revisión institucional,
pruebas con usuarios, evaluación de accesibilidad y endurecimiento operativo del despliegue.
