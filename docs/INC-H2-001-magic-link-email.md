# INC-H2-001 — Validación de correo en Magic Link

Fecha: 1 de noviembre de 2026. Rama de trabajo: `desarrollo-Andrew`, base `680d15f`.

## Causa y reproducción anterior a la corrección

`MagicLinkRequest.email` era un `str`, y `request_magic_link` únicamente recortaba espacios y convertía a minúsculas antes de buscar/crear el usuario. No llamaba a `is_valid_email`, a diferencia del registro y la creación de invitaciones/delegaciones. Además, el helper compartido utilizaba una expresión regular que permitía formatos defectuosos como puntos consecutivos en el local-part.

Se añadió primero una regresión ejecutada contra rutas FastAPI reales, con una SQLite temporal persistida y el envío de correo simulado. Con `identificador-sin-correo`, antes del fix, una lectura independiente y posterior al commit observó **HTTP 202, un usuario y un MagicLinkToken nuevos**. La prueba falló esperando HTTP 400 y cero registros. No se utilizó ni modificó `local-test.db` para esa reproducción.

## Corrección

- `app/core/emailrules.py`: conserva los helpers y la lista de proveedores gratuitos, reemplazando la regex por `email-validator==2.2.0`, dependencia que ya estaba declarada. La comprobación es exclusivamente sintáctica: no consulta DNS, MX ni confirma que exista un buzón. Se permiten dominios reservados `.test` para los escenarios aislados; se conserva el requisito anterior de dominio con sufijo, por lo que `persona@test` tampoco se admite.
- `app/services/auth_service.py`: valida después de normalizar y antes de cualquier consulta, creación de usuario, token o envío. La ruta y su rate limiting permanecen sin cambios: el limitador se ejecuta antes del servicio y los intentos de formato inválido siguen contando.
- `app/services/credential_service.py`: el buscador compartido devuelve ausencia de coincidencia para una identidad malformada. Recuperación mantiene su respuesta genérica y no emite enlaces para una cuenta histórica inválida; login mantiene su error genérico y el coste de comprobación de contraseña. No modifica registros existentes.
- `tests/test_magic_link_validation.py`: 13 casos con rutas reales, SQLite temporal, FK activas y consultas independientes tras completar las peticiones. Los envíos están simulados y nunca se contacta a Azure.

No cambian los modelos ni migraciones, no se añade una dependencia y no se modifica el frontend. Su código `VALIDATION_ERROR` ya se traduce mediante `accountAuth.invalidFields` en ES/EN/DE/PT. Registro conserva sus códigos `LEAD_EMAIL_INVALID` / `LEAD_EMAIL_FREE_PROVIDER`; invitaciones conservan `INVITE_EMAIL_INVALID`. Los helpers de esos flujos reciben la misma validación sintáctica reforzada sin cambiar la política comercial de proveedores.

## Contrato HTTP

| Solicitud | Respuesta |
|---|---|
| Magic Link con correo malformado | HTTP **400**, `error.code=VALIDATION_ERROR`, `error.field=email`. Sin eco de la dirección y sin registros nuevos. |
| Magic Link con correo válido, conocido o nuevo | HTTP **202**, misma respuesta genérica existente. No revela existencia de cuenta ni garantiza entrega. |
| Sexta solicitud de Magic Link para la misma identidad dentro de la ventana | HTTP **429**, `RATE_LIMITED`, sin registros adicionales. |
| Recuperación para correo malformado que supera las validaciones estructurales existentes | HTTP **202** genérico, igual que una cuenta desconocida; sin enlaces ni registros nuevos. |
| Login para identidad malformada que supera las validaciones estructurales existentes | HTTP **401**, `AUTH_LOGIN_FAILED`, sin indicar si hay un registro histórico. |

Se usa 400 porque el manejador actual de errores de validación de esta API ya devuelve ese código, no el 422 predeterminado de FastAPI. El cambio intencional es dejar de responder 202 a un formato malformado. La validación de formato no consulta la existencia del usuario y no debilita la protección frente a enumeración. Se conserva el acceso por correos personales válidos en Magic Link; la exigencia de correo corporativo sigue limitada al registro donde ya existía.

## Evidencia automatizada

La evidencia local de la ejecución está en `C:/Users/andre/Documents/ChatGPT/CAPSTONE/qa/inc-h2-001-20261101/`: `red.json` / `red.log` contienen el fallo previo; `targeted.json`, `validation.json` y `regression.json` contienen los resultados posteriores. El informe de ejecución de esa carpeta distingue casos y repeticiones; no se deben sumar como casos únicos.

Se prueban: identificador sin arroba; vacío y espacios; partes ausentes; varias arrobas; dominio sin sufijo o con etiquetas defectuosas; puntos consecutivos o extremos; espacios/control internos; nombre para mostrar; varias direcciones en un campo; límites del local-part y etiquetas; campos ausentes/no string; correos personales y corporativos; sufijo `.test`; trim/minúsculas y reutilización de usuario; respuestas genéricas idénticas; uso único; expiración; rate limiting de solicitudes válidas e inválidas; rechazo del servicio antes de tocar el repositorio de datos; recuperación y login seguros de una identidad histórica malformada.

## Repetición manual de AUTH-06 por Adoniss

1. Confirmar que frontend y backend utilizan el código corregido y que el backend apunta a la base QA autorizada. No usar `dev.db` ni producción. No ejecutar migraciones ni volver a inicializar la base para esta incidencia.
2. Con las otras pruebas pausadas, anotar solo las cantidades de filas en `users`, `magic_link_tokens` y `refresh_tokens` mediante consultas de lectura. No copiar emails, hashes, tokens ni cookies a la evidencia. Si ya hay usuarios inválidos, conservarlos y registrar la cantidad inicial: no deben desaparecer con el fix.
3. Desde Swagger (`/docs`) o un cliente API, llamar a `POST /api/v1/auth/magic-link` con:

   ```json
   { "email": "identificador-sin-correo", "locale": "es" }
   ```

   Esperado: HTTP 400, código `VALIDATION_ERROR`, campo `email`. Si responde 202, detener el escenario y comprobar la revisión/proceso realmente levantado antes de repetir.
4. Repetir con `persona@`, `@empresa.com`, `persona@empresa`, `per..sona@empresa.com` y `persona@empresa..com`. Se espera 400 en todos. Volver a consultar las cantidades: **cero filas adicionales** por estas solicitudes en las tres tablas; tampoco se envía correo.
5. Con una dirección de pruebas controlada y autorizada, solicitar Magic Link válido. Se espera 202 genérico tanto si la cuenta existía como si es nueva. En el entorno que tiene Azure configurado, comprobar la llegada, abrir el enlace, verificar acceso y después rechazo al reutilizarlo. No sustituir la entrega real por el fallback de consola ni darla por probada por estos tests simulados.
6. Para probar el límite sin enviar múltiples correos reales, utilizar un identificador malformado nuevo para ese escenario, por ejemplo `inc-h2-001-limite-fecha`. Primeras cinco solicitudes: 400; sexta dentro de la ventana: 429 `RATE_LIMITED`. Ninguna debe añadir usuarios, enlaces o sesiones. Si el identificador ya se usó, puede haber menos intentos disponibles. El límite por IP también permanece vigente.
7. En la interfaz, comprobar rechazo/mensaje comprensible y ausencia de error 500. Repetir la presentación en ES/EN/DE/PT cuando corresponda. El control de la interfaz no sustituye la solicitud directa a la API.
8. Guardar revisión exacta, ruta de entorno sin secretos, cuerpos sintéticos enviados, estados HTTP y cantidades antes/después. Marcar AUTH-06 según el resultado observado; no atribuir al fix una entrega de Azure no comprobada.

Consultas de lectura suficientes para el cotejo:

```sql
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM magic_link_tokens;
SELECT COUNT(*) FROM refresh_tokens;
```

## Alcance y límites

No se limpian usuarios inválidos históricos, no se cambian contraseñas ni se revocan masivamente tokens existentes. Los enlaces/sesiones anteriores mantienen sus contratos de uso/expiración; cualquier saneamiento de datos existentes requiere autorización independiente. La corrección evita nuevas escrituras por solicitudes malformadas y no certifica existencia ni entrega de buzones con sintaxis válida.

No se ejecutaron operaciones sobre Render/Vercel ni se modificaron Docker, SQLite locales, seguimiento Git, `aplicar_app14.py`, las dos fixtures previas o `update_area_vectors.py`. Los hashes protegidos se comparan en las evidencias. Sin staging, commits, push, merge, rebase ni cambio de rama.
