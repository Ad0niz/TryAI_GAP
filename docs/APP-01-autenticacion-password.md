# TryAI Gap — Autenticación con contraseñas

Fecha de validación: 29 de octubre de 2026. Rama: `desarrollo-Andrew`.

## Alcance y estado

Se incorporan registro con correo verificado, acceso con contraseña y recuperación/establecimiento de contraseña. Se conserva el acceso por enlace mágico y la aceptación de invitaciones de APP-11. No se implementa 2FA. El cierre funcional requiere validar la entrega real de correo y el recorrido de usuario en un entorno de integración.

No se modifican modelos, migraciones ni datos reales en esta tarea. Los cambios de modelos, APP-06, APP-11, APP-14 y APP-17 que ya aparecían en Git se conservaron; no deben atribuirse íntegramente a esta implementación.

## Qué existía

- Solicitud y consumo de magic links; JWT de acceso, refresh tokens y cierre de sesión.
- `users.password_hash`, `users.two_factor_enabled` y la tabla `magic_link_tokens` con usuario, digest, vencimiento y consumo.
- Hash PBKDF2-HMAC-SHA256 con sal aleatoria y 600.000 iteraciones; verificación mediante comparación constante. APP-11 ya utilizaba estos helpers al aceptar invitaciones.
- Alta pública mediante `POST /leads`, que creaba organización, usuario, lead, diagnóstico y sesión sin verificar primero el correo.
- No había login con contraseña ni recuperación conectados al frontend y backend.

## Flujos implementados

### Registro

1. `/start` solicita un correo corporativo y envía un enlace de verificación.
2. Se conserva una cuenta pendiente con `status=invited`, sin organización, contraseña ni sesión nueva. No se crea la organización al solicitar el enlace.
3. El enlace abre `/start?token=…`. La aplicación conserva temporalmente el token en memoria, lo retira de la dirección visible y obtiene el correo verificado mediante una petición POST. El correo del formulario queda bloqueado.
4. Al enviar datos de perfil, términos, contraseña y confirmación, el backend vuelve a validar el token y su identidad, consume el enlace y crea organización, lead, diagnóstico y sesión dentro de la transacción existente.
5. Se reutiliza el UUID de la cuenta pendiente o de una cuenta previa sin organización. Si esta última ya tiene contraseña, debe aportar su contraseña actual; el registro no la sobrescribe. Las cuentas ya asociadas con una organización no generan otra organización.

**Cambio de contrato intencional:** `POST /leads` requiere ahora `verification_token`, `password` y `password_confirmation`, además de los campos anteriores. Un cliente antiguo que envíe el alta sin estos campos recibe HTTP 400. Backend y frontend deben integrarse juntos. El cuerpo de la respuesta exitosa se conserva.

### Login y usuarios existentes

- `/login` ofrece contraseña y enlace mágico. Las cuentas sin contraseña reciben el mismo error de credenciales que una contraseña incorrecta y pueden seguir usando magic links o solicitar establecer su contraseña por correo.
- Se reutilizan los JWT y refresh tokens actuales. La contraseña no se guarda en localStorage, sessionStorage ni en el estado persistido de autenticación.
- La identidad, organización y rol provienen del servidor. El cambio de cuenta limpia los datos de sesión y el diagnóstico anterior.
- Usuarios cliente sin organización se dirigen a `/start` para completar el alta verificada; usuarios con organización, al dashboard; consultores, a su pantalla existente. No se modificó `Onboarding.tsx`.

### Recuperación

- `/password/reset` solicita un enlace con respuesta genérica, tanto para correos existentes como inexistentes o inactivos. El envío se difiere mediante BackgroundTasks para no esperar la latencia del proveedor antes de devolver la respuesta. No es una garantía de indistinguibilidad temporal absoluta.
- El enlace permite establecer o reemplazar una contraseña tras comprobar su propósito, vigencia, estado y usuario activo.
- Una actualización válida revoca todos los refresh tokens de esa cuenta e invalida sus magic links y enlaces de credenciales pendientes. No cambia rol, organización ni membresías, y no inicia sesión automáticamente.
- Un enlace inválido, vencido, consumido o perteneciente a otro propósito no cambia la contraseña. La frontera de vencimiento es `expires_at <= now`.
- Los JWT de acceso ya emitidos siguen siendo válidos hasta su vencimiento configurado (15 minutos por defecto). La revocación inmediata de estos JWT requeriría otro mecanismo; no se presenta como implementada.

## Endpoints

Todos llevan el prefijo `/api/v1`.

| Endpoint | Estado | Comportamiento |
| --- | --- | --- |
| `POST /auth/register/request` | Nuevo | Solicitar verificación; HTTP 202 genérico para correos corporativos válidos. |
| `POST /auth/register/preview` | Nuevo | Verificar enlace sin consumirlo; devuelve únicamente el correo autorizado. |
| `POST /leads` | Modificado | Finalizar alta con contraseña y enlace verificado; HTTP 201, respuesta anterior conservada. |
| `POST /auth/login` | Nuevo | Login con correo y contraseña; devuelve perfil y pareja de tokens. |
| `POST /auth/password/reset/request` | Nuevo | Solicitar recuperación/establecimiento; HTTP 202 genérico. |
| `POST /auth/password/reset` | Nuevo | Consumir enlace y actualizar contraseña; HTTP 204. |
| `POST /auth/magic-link` | Conservado con límite de solicitudes | Mantiene acceso alternativo. |
| `POST /auth/verify` | Reforzado | Comprueba usuario activo y consumo condicional para evitar reutilización. |
| `POST /auth/refresh` | Reforzado | Mantiene UTC y expiración; serializa rotación con cambios de credenciales. |
| `POST /auth/logout`, `GET /auth/me` | Conservados | Sesión y perfil actuales. |

Los errores mantienen el formato `error.code/message/field/request_id`. Los errores de contraseña no distinguen usuario inexistente, inactivo, sin contraseña o contraseña incorrecta. La interfaz traduce códigos conocidos y no muestra mensajes arbitrarios del servidor.

## Almacenamiento y seguridad

- Se reutiliza `magic_link_tokens.token_hash` (128 caracteres) con `register:<sha256>` y `password_reset:<sha256>`. Los magic links existentes conservan su digest sin prefijo. Los consumidores validan exclusivamente su propósito; no se requiere migración.
- Tokens opacos aleatorios, con duración configurable reutilizando `magic_link_ttl_min`; uso único mediante actualización condicional. Las fechas se emiten en UTC y se normalizan al leer valores SQLite sin zona horaria.
- Se serializan cambios de credenciales y emisión/rotación de sesión por usuario: bloqueo de fila en PostgreSQL y escritura sin cambios efectivos en SQLite. No se altera el timestamp de usuario para adquirir el bloqueo.
- Limitador acotado por proceso: cinco intentos/solicitudes por identidad en 15 minutos para login y solicitudes de correo; 30 para comprobación/consumo de enlaces nuevos; 60 por IP y acción en un minuto. El login válido limpia el contador de fallos de identidad. Solo se conservan identificadores derivados por hash.
- No se añade un proveedor de correo ni dependencias. Se reutiliza Azure Communication Services; su cliente síncrono se ejecuta fuera del bucle de peticiones.
- Los mensajes nuevos de verificación/recuperación no se imprimen en consola, tampoco en desarrollo. Sin proveedor disponible se registra únicamente un aviso genérico y la respuesta pública se mantiene genérica. En producción se evita el fallback que imprimía el contenido de cualquier correo. El fallback previo de magic links/invitaciones continúa únicamente en desarrollo.
- Respuestas de autenticación y alta con `Cache-Control: no-store`. Los tokens nuevos se envían al backend en el cuerpo, no en rutas de consulta.

## Archivos de esta tarea

| Archivos | Motivo |
| --- | --- |
| `backend/app/core/auth_limits.py` (nuevo) | Límite de intentos y solicitudes de autenticación. |
| `backend/app/services/credential_service.py` (nuevo) | Registro verificado, login, recuperación y separación de propósitos. |
| `backend/app/services/auth_service.py` | Bloqueo por usuario, consumo/rotación condicional y registro seguro de fallos de correo. Conserva la corrección UTC previa. |
| `backend/app/services/lead_service.py` | Alta con identidad verificada y reutilización de cuenta; conserva el aislamiento de lectura de leads previo. |
| `backend/app/schemas/auth.py`, `backend/app/schemas/lead.py` | Contratos de credenciales, SecretStr y nuevos cuerpos de autenticación. |
| `backend/app/api/routes/auth.py`, `backend/app/api/routes/leads.py` | Endpoints, límites y respuestas sin caché. |
| `backend/app/integrations/email.py` | Protección del contenido sensible y envío del proveedor fuera del bucle de peticiones. |
| `backend/tests/test_password_auth.py` (nuevo) | Pruebas funcionales aisladas y pruebas de privacidad/límites. |
| `backend/tests/test_leads.py`, `backend/tests/test_auth_refresh.py` | Adaptar el alta a la verificación y los mocks de renovación al bloqueo/rotación; conservar casos previos. |
| `web/src/components/auth/AuthFrame.tsx`, `RegistrationEmail.tsx` (nuevos) | Presentación compartida y solicitud de correo verificado. |
| `web/src/pages/Login.tsx`, `LeadGate.tsx`, `AuthVerify.tsx` | Formularios, integración de alta y destinos de sesión; errores traducidos. |
| `web/src/pages/PasswordReset.tsx` (nuevo), `web/src/App.tsx` | Solicitud/consumo de recuperación y ruta pública. |
| `web/src/store/authStore.ts`, `web/src/api/index.ts`, `web/src/api/types.ts` | Login, limpieza de sesión y contratos del cliente. |
| `web/src/lib/accountAuth.ts` (nuevo) | Mapeo seguro de errores, validación y destinos. |
| `web/src/i18n/locales/{es,en,de,pt}.json` | 28 textos nuevos por idioma y mensaje de acceso futuro de invitaciones actualizado. Conserva las demás traducciones locales previas. |
| `web/src/pages/PasswordAuth.test.tsx` (nuevo) | Formularios, sesión, privacidad y cuatro idiomas. |
| `docs/APP-01-autenticacion-password.md` (nuevo) | Este informe y las validaciones pendientes. |

## Verificaciones automatizadas

| Verificación | Resultado observado |
| --- | --- |
| Backend: credenciales y regresiones | **136 pruebas aprobadas** en 215,236 s; 25 nuevas de contraseñas y 111 de regresión. |
| Frontend: suite completa | **188 pruebas aprobadas**, 23 archivos; 27 nuevas del flujo de contraseñas. |
| `npm run build` | **Aprobado**: TypeScript y Vite. Avisos de datos Browserslist antiguos y paquetes mayores de 500 kB; no impiden la compilación. |
| ESLint sobre archivos de autenticación nuevos/modificados | **Aprobado**, salida 0. No equivale a afirmar que todo el repositorio pasó lint. |
| Traducciones | JSON válidos sin duplicados y las mismas 28 claves nuevas en ES/EN/DE/PT. |
| Sintaxis Python y `git diff --check` | **Aprobados**. |

La suite backend se ejecutó con `DATABASE_URL=sqlite+aiosqlite:///:memory:` en el proceso de prueba y cargó explícitamente `test_password_auth`, `test_reviews`, `test_leads`, `test_auth_refresh`, `test_invitations`, `test_organizations`, `test_area_progress`, `test_free_answer_limit`, `test_result_area_scores`, `test_result_metrics` y `test_result_preview` mediante unittest. No se ejecutó el arranque de FastAPI ni sus scripts de inicialización.

Frontend: `npm.cmd test -- --maxWorkers=1 --pool=threads` y `npm.cmd run build`. Los errores iniciales del montaje de pruebas (ThemeProvider, ResizeObserver y un elemento de prueba con rol implícito de estado) se corrigieron antes de esta ejecución final.

Casos cubiertos: alta válida; ausencia de verificación; correo distinto; validaciones corporativas/términos; duplicados y múltiples enlaces; reutilización de cuenta previa sin organización; conservación de contraseña previa; login válido/incorrecto/deshabilitado/sin contraseña; magic link después del cambio; separación de propósitos; recuperación, caducidad y frontera exacta; consumo único; invalidación de enlaces y refresh tokens; preservación de organización/rol; contraseña de APP-11 utilizable para login; aislamiento; respuestas genéricas; límites; privacidad de correo; formularios y mensajes en cuatro idiomas.

Las pruebas funcionales usan rutas reales con HTTP simulado, SQLite en memoria, usuarios sintéticos y proveedor de correo simulado. Se ejecutan las regresiones de APP-06, APP-11, APP-14 y APP-17. Se excluyen las suites de migraciones porque este desarrollo no cambia el esquema y no requiere ejecutarlas. Las fechas de PostgreSQL se prueban mediante valores con zona horaria, sin conexión a un servidor PostgreSQL.

## Pendientes y límites para el cierre

1. **Correo real y recorrido en navegador:** con el proveedor existente configurado, validar entrega, URL correcta y cuatro idiomas en registro/recuperación. En desarrollo sin proveedor, los nuevos enlaces sensibles no aparecerán en la consola; por tanto, ese recorrido no podrá completarse solo con el fallback actual. No se modificaron credenciales.
2. **2FA:** el indicador existente no implementa el segundo factor. El nuevo login por contraseña rechaza una cuenta marcada con 2FA en lugar de omitirlo. Se conserva el comportamiento anterior de magic links/invitaciones; no se declara que estos flujos apliquen 2FA. Método, activación, recuperación y alcance deben definirse antes de implementar esa parte.
3. **Despliegue con varias instancias:** el límite es local al proceso y se reinicia con él. Debe validarse el control compartido de intentos y el reconocimiento de IP del proxy para producción. No se incorporó un servicio externo de rate limiting.
4. **PostgreSQL y concurrencia real:** falta ejecutar integración en un PostgreSQL aislado y pruebas simultáneas de recuperación/refresh/invitación. No se conectó a Render ni a otra base remota. SQLite serializa escrituras; esta prueba no garantiza comportamiento bajo carga.
5. **Entrega diferida:** BackgroundTasks no es una cola durable. Una interrupción del proceso puede perder un envío; se podrá volver a solicitar el enlace respetando el límite. No se inventa infraestructura de colas ni se modifica el esquema.
6. **Tokens de acceso:** no hay revocación instantánea de JWT ya emitidos. Las pruebas verifican revocación de refresh y enlaces; los JWT mantienen el TTL existente.

No se considera validada de extremo a extremo la autenticación en despliegue hasta comprobar correo y navegador. Registro, login y recuperación están implementados y probados automáticamente dentro del alcance anterior. 2FA permanece pendiente.

## Recorrido manual pendiente en entorno de integración

1. Con el proveedor de correo existente disponible y una cuenta de prueba autorizada, solicitar verificación desde `/start`. Confirmar que antes de abrir el enlace no se haya creado organización ni sesión.
2. Abrir el enlace, revisar que el correo quede bloqueado y la dirección visible deje de contener el token. Completar el perfil, términos, contraseña y confirmación; comprobar onboarding y una única organización.
3. Cerrar sesión e iniciar con contraseña. Repetir mediante enlace mágico y con una cuenta aceptada por APP-11.
4. Solicitar recuperación, abrir el correo, cambiar la contraseña y comprobar el rechazo del enlace reutilizado y de la contraseña anterior. Las sesiones renovables previas deben fallar; el JWT anterior puede seguir hasta su vencimiento.
5. Repetir presentación y errores relevantes en ES/EN/DE/PT. Comprobar contraste, navegación, autocompletado de gestores de contraseñas y ausencia de textos mezclados.
6. Repetir la recuperación con una cuenta previa sin contraseña, sin crear otra cuenta u organización. Verificar respuestas genéricas para correos inexistentes sin consultar ni exponer datos de terceros.

No se realizaron estas operaciones manuales sobre cuentas o bases reales durante esta implementación. No hubo commits, merges ni push.
