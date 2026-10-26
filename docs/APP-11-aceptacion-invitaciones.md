# APP-11 · Aceptación de invitaciones

Responsable: Adoniss. Planificación: S5, 19–25 de octubre. Implementación: 22 de octubre de 2026.

## Alcance entregado

| Tarea | Implementación |
| --- | --- |
| T41 | Token opaco aleatorio de 32 bytes, codificado como 43 caracteres URL-safe. Se almacena únicamente SHA-256 del token, con `expires_at` y `accepted_at`. Caducidad predeterminada: 72 horas, configurable mediante `INVITATION_TTL_HOURS`. |
| T42 | Consulta pública de invitación y endpoint de aceptación, con validación, errores diferenciados y una transacción para todos los cambios. |
| T43 | Ruta pública `/invite/:token`, datos reales de la organización/área, definición y confirmación de contraseña, estados de carga, error y éxito. Textos en español, inglés, portugués y alemán. |
| T44 | Creación o reutilización del usuario, activación y asociación mediante `users.organization_id` y `org_members`. Apertura de sesión con JWT/refresh y carga del diagnóstico de la organización. |
| T45 | Pruebas de token inválido, usado, vencido y válido; además de reenvío, validación de contraseña, aislamiento entre organizaciones, rollback y migración. |

## Contrato HTTP

Todas las rutas usan el prefijo `/api/v1`.

### Consultar invitación

`GET /invitations/{token}` — público, sin consumir el token.

Devuelve `organization_name`, `full_name`, `email`, `area_key`, `expires_at` y `password_is_set`. La respuesta usa `Cache-Control: no-store`. La pantalla no almacena el token en localStorage.

### Aceptar invitación

`POST /invitations/accept` — público.

```json
{
  "token": "TOKEN_RECIBIDO_POR_CORREO",
  "password": "UNA_CONTRASENA_DE_PRUEBA"
}
```

Solo se admiten esos dos campos. La organización, el área, el correo y el rol se obtienen del servidor; el cliente no puede elegirlos. La confirmación de contraseña se valida en la página.

Respuesta exitosa: `status: "accepted"`, `area_key`, `user` con `organization_id`, `access_token`, `refresh_token`, `token_type` y `expires_in`.

| HTTP | Código | Significado |
| --- | --- | --- |
| 400 | `INVITE_TOKEN_INVALID` | Token mal formado, inexistente, revocado o sustituido por un reenvío. |
| 409 | `INVITE_ALREADY_ACCEPTED` | El enlace ya se utilizó. |
| 410 | `INVITE_TOKEN_EXPIRED` | Venció o procede del esquema antiguo sin caducidad. |
| 409 | `INVITE_ACCOUNT_CONFLICT` | La cuenta pertenece a otra organización o tiene un rol global incompatible. |
| 403 | `INVITE_ACCOUNT_DISABLED` | La cuenta está deshabilitada. |
| 400 | `INVITE_PASSWORD_INCORRECT` | Una cuenta que ya tiene contraseña debe introducir su contraseña actual. |
| 400 / 422 | `VALIDATION_ERROR` / `INVITE_PASSWORD_INVALID` | Contraseña fuera de límites, campos extra o solo espacios. |
| 409 | `INVITE_CHANGED` | La cuenta o invitación cambió durante la operación; recargar antes de reintentar. |

## Reglas de aceptación

- Contraseña de 12 a 128 caracteres; no se recorta ni se guarda en texto plano. Se utiliza PBKDF2-HMAC-SHA256 con 600.000 iteraciones y salt aleatorio individual. El formato identifica algoritmo e iteraciones para integrar posteriormente el login de TRV-04. Referencia: [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
- Si la cuenta ya tiene contraseña, se verifica y se conserva. La invitación no funciona como recuperación de contraseña.
- Las cuentas existentes sin organización se vinculan; las pertenecientes a otra organización se rechazan. No se reactivan usuarios deshabilitados ni se otorgan roles globales elevados.
- Se reutiliza una membresía del usuario en la misma área, o un puesto pendiente sin usuario. Nunca se sustituye al usuario de una membresía ocupada. Si hace falta, se crea otra membresía con rol `leader`.
- PostgreSQL bloquea las filas de invitación, organización y usuario durante la aceptación. Además, la actualización del token exige que siga enviado, sin usar y vigente. Un error revierte la aceptación, la cuenta, la membresía y la sesión.
- Reenviar genera un token nuevo y renueva el plazo. El anterior deja de funcionar. Las invitaciones aceptadas no se pueden reenviar.
- La página limpia la caché anterior al cambiar de sesión. Las respuestas pendientes de perfil/diagnóstico no deben restaurar la organización anterior.

## Relación con TRV-04

TRV-04 permanece pendiente según lo confirmado por el equipo. APP-11 permite definir una contraseña y abre la sesión al aceptar; **no agrega una pantalla de login por contraseña, recuperación ni 2FA**. Para volver a entrar se conserva el magic link actual. La página informa de ello tras la aceptación. Los helpers `hash_password` y `verify_password` quedan disponibles para integrar el futuro login.

## Migración obligatoria

Archivo: `backend/migrations/versions/20261022_app11_invitations.py`.

Añade tres columnas opcionales: `users.password_hash`, `invitations.expires_at` e `invitations.accepted_at`. Conserva usuarios, organizaciones y membresías. Las invitaciones antiguas permanecen con caducidad nula y se consideran vencidas: reenviarlas desde Equipo.

Desde la carpeta `backend`, usando el entorno Python de la aplicación y su `DATABASE_URL`:

```powershell
python -m alembic upgrade head
```

En Render, ejecutar esa migración con el código de esta versión **antes de poner el backend actualizado en servicio**. El comando debe formar parte del paso de migración del despliegue; una alternativa es ejecutarlo al inicio del servicio, antes del comando actual que arranca la API. No reemplazar el comando de inicio sin conservar su configuración.

La revisión parte del esquema existente: este repositorio no tenía una migración base. Para una base vacía local, crear primero las tablas con la utilidad existente y luego registrar la revisión:

```powershell
python -c "import asyncio; from app.db.session import init_models; asyncio.run(init_models())"
python -m alembic upgrade head
```

`create_all` por sí solo no agrega columnas a tablas ya existentes. La migración admite bases nuevas creadas con los modelos actuales sin intentar duplicar las columnas. Un downgrade elimina los campos añadidos y perdería sus valores; no forma parte del despliegue normal.

Configuración de producción para este flujo:

```dotenv
INVITATION_TTL_HOURS=72
WEB_APP_URL=https://tryai-gap.vercel.app
```

Conservar la conexión de base de datos, JWT y el proveedor de correo configurados en Render. Los enlaces públicos requieren el proveedor de correo operativo; no se envió ningún correo real durante las pruebas de esta entrega.

## Verificación local

Backend, con las dependencias instaladas:

```powershell
cd backend
python -m unittest discover -s tests -v
```

Frontend:

```powershell
cd web
npm test
npm run lint
npm run build
```

Prueba manual funcional:

1. Iniciar sesión con un usuario que pertenezca a una organización y abrir Equipo.
2. Enviar una invitación a una cuenta de prueba y escoger el área.
3. Abrir el enlace del correo en otra sesión del navegador. Confirmar organización, correo y área.
4. Definir y confirmar la contraseña; aceptar. Debe aparecer el éxito y el acceso al dashboard.
5. Confirmar en Equipo que el miembro está activo y la invitación aceptada. En `/auth/me`, `organization_id` debe corresponder a la organización invitante.
6. Volver a abrir el mismo enlace: debe informar que ya fue aceptado. Un enlace inventado debe mostrar que es inválido.
7. En una base local de prueba, usar un enlace vencido: debe pedir reenvío. Reenviarlo y comprobar que únicamente funciona el enlace nuevo.

Las pruebas automatizadas usan SQLite aislado, rutas/servicios reales y mocks de correo. Cubren migración desde tablas antiguas y desde `create_all`, preservación de datos, los cuatro estados del token, rollback, contraseñas, cuentas existentes y cachés de sesión. La concurrencia de PostgreSQL y la entrega real de correo deben validarse en el entorno de integración antes de producción.

Resultado local: 19 pruebas de backend y 95 de frontend aprobadas; TypeScript, ESLint y compilación Vite correctos. También se revisó visualmente la pantalla con una API y una base local desechable, y se comprobó el SQL de migración generado para PostgreSQL. Vite mantiene avisos sobre tamaño de bundles y antigüedad de Browserslist; no bloquean la compilación.

## Entrega

Cambios preparados para revisar en la rama `Desarrollo`. No se realiza commit, push, merge ni despliegue automático. Tras revisar y probar, publicar la rama y abrir el PR hacia `main`, coordinando la migración del backend y el despliegue del frontend.
