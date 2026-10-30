# TryAI Gap — Permisos APP-11 y ciclo de áreas APP-14

Rama de trabajo: `desarrollo-Andrew`. Se preservaron los cambios locales previos de autenticación, APP-06, APP-11, APP-14 y APP-17. No se modificaron modelos, migraciones, credenciales, bases reales ni el índice de Git. No se hicieron commits, merges ni push.

## Diagnóstico y autorización

El alta creaba una cuenta `users.role=client` y una organización, pero no una membresía administrativa. Las rutas de invitaciones, organización, áreas y respuestas verificaban principalmente la pertenencia a la organización: un líder podía ejecutar acciones globales o responder otras áreas.

Se centralizan las comprobaciones en `organization_access.py`. La autorización utiliza `OrgMember.organization_id`, `user_id`, `role` y `status=active`. El rol global no sustituye al organizacional. Un administrador global sin membresía ni evidencia de alta no obtiene permisos administrativos de la organización.

El registro verificado crea ahora una membresía `admin/active` del creador dentro de la misma transacción que el alta. Se conserva el rol global `client` y la integración con contraseña, magic links y onboarding.

### Propietarios anteriores

El esquema no tiene `organizations.created_by` ni un vínculo directo entre lead y organización. La compatibilidad heredada se acota a un único usuario vinculado a leads de alta dentro de la organización actual, sin ninguna membresía propia. Esta comprobación es de lectura: no inserta ni reactiva membresías.

Una membresía de líder o una membresía administrativa inactiva nunca se convierte automáticamente en administración. Esto evita promover a una cuenta que conserva un lead antiguo de otra organización y actualmente participa como líder. Si existen varios candidatos de alta, no se elige al primero ni al más antiguo.

**Límite pendiente:** un propietario histórico que solo tenga una membresía de líder, carezca de lead o tenga evidencia ambigua necesita conciliación administrativa. El lead no constituye una referencia formal de propiedad tras cambios manuales externos de organización. Antes de retirar la compatibilidad heredada o desplegarla sobre datos reconciliados, Administración debe confirmar los propietarios y sus membresías. No se ejecutó ese ajuste sobre datos reales ni se añadió un historial Alembic independiente.

## Reglas efectivas

| Operación | Administrador organizacional activo | Líder con membresía activa |
| --- | --- | --- |
| Crear, reenviar y eliminar invitaciones; consultar equipo global | Permitido | HTTP 403 |
| Modificar organización y logo | Permitido | HTTP 403 |
| Consultar ficha organizacional | Permitido | Permitido como miembro activo; edición protegida |
| Activar/desactivar áreas | Permitido, conservando la restricción Pro existente | HTTP 403, incluso en sus áreas propias; regla confirmada |
| Responder madurez o delegar una pregunta de madurez | Permitido, conservando APP-06 | HTTP 403 |
| Consultar cuestionario y respuestas de área | Cualquier área de su organización | Solo áreas asignadas; las lecturas históricas no activan el área |
| Responder/delegar preguntas de área | Área habilitada | Área asignada y habilitada |
| Respuestas por lote | Todas autorizadas antes de guardar | El lote completo se rechaza si incluye una pregunta fuera del alcance |
| Subir respaldo | Alcance válido de organización, diagnóstico y pregunta/área | Solo preguntas o áreas asignadas y habilitadas |
| Listar/descargar respaldos | Su organización | Solo sus áreas; se filtran también el total y la paginación |
| Eliminar respaldos | Permitido | Reservado al administrador; no se presupone permiso de eliminación |
| Resultados globales, vista previa y PDF global | Permitido según Free/Pro | HTTP 403; resultados globales exclusivos del administrador, regla confirmada |

Las membresías invitadas, pendientes o inactivas no conceden áreas. Varias membresías activas acumulan las áreas de un líder. Una membresía de otra organización no autoriza al usuario en la organización actual. Los controles vuelven a ejecutarse en backend en cada operación; la visibilidad del frontend no se usa como protección.

Los lotes se autorizan antes de aplicar cambios, incluyendo preguntas con un valor inválido o estados distintos de `answered`. Se conservan los contratos existentes de duplicados, actualizaciones y límite Free. Las respuestas de otra organización no se devuelven.

Los documentos vinculados a una pregunta obtienen su alcance de la pregunta real. No se permite etiquetar una pregunta de Marketing como Ventas para eludir el permiso. Los documentos generales sin área/pregunta requieren administración. La descarga verifica el alcance antes de resolver el archivo o emitir una URL firmada; no se llama al almacenamiento para una subida no autorizada.

Los enlaces públicos de delegación conservan su acceso de una sola pregunta. La emisión está protegida por rol/área y una delegación de área no puede responder mientras esa área esté inactiva. **Decisión pendiente:** el modelo no registra quién emitió la delegación; no puede atribuirse un enlace existente a una membresía concreta para revocarlo automáticamente cuando esa membresía cambia. No se inventó ese vínculo ni se modificó el modelo.

APP-17 conserva sus reglas previas de organización y plan. Se evitó introducir una nueva restricción de membresía dentro del helper de pertenencia que reutilizan sus listados y detalles. La política específica de líderes sobre contenido de revisiones no se redefinió en esta tarea.

## APP-14

- La matriz consulta únicamente áreas con `AreaState.active=True` para el diagnóstico correspondiente.
- Un área necesita un catálogo de exactamente 16 preguntas funcionales de bloques A–D y 16 respuestas numéricas en estado `answered` para publicar su punto. `idk`, `pending`, `delegated`, respuestas nulas o cobertura parcial no producen coordenadas.
- Pain mantiene el promedio del bloque A; Readiness agrupa B, C y D. Se conserva la escala 1–5 y la clasificación previa al redondeo. Exactamente 3,0 continúa en frontera; Quick Win requiere ambos valores estrictamente mayores que 3,0.
- Los cinco vectores excluyen preguntas de áreas inactivas. Las preguntas de madurez conservan su tratamiento existente y no reciben clasificaciones inventadas. La cobertura de mapeo se calcula sobre el catálogo elegible.
- Desactivar no borra ni modifica respuestas, UUID ni traducciones. Reactivar recupera su contribución a matriz y vectores con las mismas respuestas.
- Se conserva el heatmap histórico por bloques A–D; la exclusión oficial solicitada se aplica a matriz y vectores. No se modifica su fórmula.
- `priorities: []` permanece válido y la sección vacía continúa oculta. No se implementa generación de iniciativas.
- No fue necesario modificar el generador PDF: consume las métricas filtradas del mismo resultado que usa la aplicación. Se conserva ES/EN/DE/PT y el paywall de APP-06.

## Frontend

`GET /api/v1/auth/permissions` devuelve únicamente `organization_admin` y `area_keys` de la sesión. El hook de permisos utiliza usuario y organización en la clave de consulta y no autoriza contenido mientras carga o falla la comprobación.

Los líderes no ven las acciones globales de equipo, madurez y resultados, ni los botones de activación/desactivación. Sus áreas asignadas siguen disponibles. Configuración mantiene preferencias personales y protege el formulario organizacional. Las peticiones rechazadas con HTTP 403 muestran mensajes traducidos. El autoguardado deja de reenviar el lote rechazado por permisos y oculta la edición al detectar esa denegación.

Las cachés de equipo/documentos se separan por usuario y organización. Activar o desactivar invalida las consultas de resultados para actualizar matriz, vectores y los datos que recibe el PDF.

## Archivos de esta tarea

| Grupo | Archivos y motivo |
| --- | --- |
| Autorización central | `backend/app/services/organization_access.py` (nuevo): membresías, compatibilidad heredada y alcance de preguntas/documentos. |
| Alta y sesión | `backend/app/services/lead_service.py`: membresía administrativa del creador; `backend/app/api/routes/auth.py`: endpoint de permisos, conservando la nueva autenticación. |
| Operaciones de dominio | `backend/app/services/team_service.py`, `organization_service.py`, `area_service.py`, `answer_service.py`, `document_service.py`: aplicar permisos y filtrar lecturas. `assessment_service.py`: comprobar membresía para descubrir el diagnóstico actual. |
| Rutas | `backend/app/api/routes/assessments.py`, `areas.py`, `questionnaires.py`: propagar identidad y aplicar controles por operación. |
| Resultados | `backend/app/services/result_metrics_service.py`: catálogo activo y cobertura de 16; `result_service.py`: protección del resultado global. |
| Pruebas nuevas | `backend/tests/test_organization_access.py`, `backend/tests/organization_fixture.py`, `web/src/components/OrganizationAccess.test.tsx`. |
| Pruebas adaptadas | `backend/tests/test_area_progress.py`, `test_free_answer_limit.py`, `test_invitations.py`, `test_organizations.py`, `test_result_area_scores.py`, `test_result_metrics.py`, `test_result_preview.py`, `test_admin_integration.py`, `test_password_auth.py`: fixtures explícitas de admin, áreas activas y expectativas oficiales; conservar regresiones anteriores. |
| UI compartida | `web/src/hooks/useOrganizationAccess.ts`, `web/src/components/OrganizationAccess.tsx` (nuevos), `web/src/api/index.ts`: obtener permisos y proteger contenido. |
| Edición y mensajes | `web/src/hooks/useQuestionnaireAnswers.ts`, `web/src/components/questionnaire/QuestionnaireEngine.tsx`: detener edición/autoguardado ante 403. |
| Páginas y navegación | `web/src/layouts/AppShell.tsx`; `web/src/pages/Team.tsx`, `Areas.tsx`, `AreaDetail.tsx`, `Maturity.tsx`, `Documents.tsx`, `Dashboard.tsx`, `Settings.tsx`, `Onboarding.tsx`, `Results.tsx`: acciones permitidas, cachés y mensajes. |
| Traducciones/pruebas UI | `web/src/i18n/locales/{es,en,de,pt}.json`: tres claves nuevas; `web/src/pages/{Team,Settings,Results}.test.tsx`: aislar la consulta de permisos y verificar mensajes traducidos. |
| Documentación | Este informe y `docs/APP-14-resultados-vectores-matriz.md`: registrar la confirmación oficial posterior. |

Durante las pruebas se reprodujo `MissingGreenlet` al devolver `updated_at` después de actualizar una respuesta individual. Se carga explícitamente ese campo dentro de la sesión asíncrona; no se modifica el esquema ni el contrato de respuesta. Fue necesario para conservar la actualización legítima bajo los nuevos controles.

## Resultados verificables

| Verificación final | Resultado observado |
| --- | --- |
| Suite completa backend (`unittest discover -s tests`) | **166 pruebas aprobadas** en 345,261 s. Incluye 18 pruebas nuevas de permisos/ciclo de áreas y todas las regresiones de autenticación, APP-06, APP-11, APP-14, APP-17 y migraciones aisladas. |
| Suite completa frontend | **200 pruebas aprobadas**, 24 archivos; incluye 12 casos nuevos de permisos, carga, cambios de cuenta y errores en cuatro idiomas. |
| `npm run build` | **Aprobado**: TypeScript y Vite. Mantiene avisos anteriores de Browserslist antiguo y paquetes grandes. |
| ESLint de componentes/páginas/hooks de permisos | **Aprobado**, sin errores ni advertencias en la ejecución final seleccionada. No equivale a declarar un lint global del repositorio. |
| Sintaxis y traducciones | Python válido; ES/EN/DE/PT sin claves JSON duplicadas y con las mismas tres claves nuevas de permisos. |
| `git diff --check` y rama | **Aprobado**; permanece `desarrollo-Andrew`. |

Frontend se ejecutó con `npm.cmd test -- --maxWorkers=1 --pool=threads` y `npm.cmd run build`. Backend utilizó el entorno del proceso `DATABASE_URL=sqlite+aiosqlite:///:memory:` y el intérprete virtual existente, sin cambiar archivos de configuración.

Hubo fallos iniciales que se corrigieron antes de esta ejecución: fixtures sin membresía administrativa, expectativas antiguas de errores/áreas de seis preguntas, recuento de la membresía sintética del organizador y una restricción compartida que alcanzaba APP-17. Se preservó el contrato de revisiones y el 404 de reenvío para recursos ajenos; las pruebas finales pasaron.

Las bases de prueba son SQLite en memoria o archivos temporales con usuarios sintéticos. La suite completa incluye las pruebas de migraciones ya existentes sobre copias temporales; no se ejecutaron migraciones sobre `backend/dev.db`, Render ni otra base real. Las llamadas de correo y almacenamiento están simuladas en las pruebas de permisos. No se modificaron credenciales.

## Confirmaciones de alcance — 30 de octubre de 2026

El usuario confirmó expresamente las dos reglas que estaban pendientes:

- Los resultados globales (radar, matriz, vectores, vista previa y PDF de toda la organización) son exclusivos de administradores organizacionales, manteniendo las restricciones Free/Pro.
- Activar y desactivar áreas es exclusivo de administradores organizacionales, incluso cuando el líder tenga asignada el área; se conserva la restricción Pro existente.

Ambas reglas coinciden con los controles de backend y frontend ya implementados y probados. Esta confirmación requiere únicamente actualizar la documentación; no se modifica código ni se repiten las pruebas por este cambio documental. Los resultados automatizados anteriores permanecen como evidencia de aquella ejecución.

## Decisiones y validaciones pendientes

1. Conciliar propietarios históricos con membresías ambiguas o incompletas, usando una fuente oficial de propiedad. No se debe usar el primer usuario, el correo, el nombre de la empresa ni el rol global como prueba suficiente. No se ejecutó ningún backfill real.
2. Definir eliminación de documentos por líderes y revocación de enlaces de delegación al retirar una membresía. Se conserva la alternativa restrictiva para la eliminación y el contrato actual de enlaces públicos.
3. Validar manualmente administrador/líder en el navegador y el PDF con los datos de un entorno autorizado. Las pruebas automatizadas no equivalen a una validación visual de despliegue ni a pruebas concurrentes contra PostgreSQL.
4. El seed informa una limitación anterior: falta el kit inglés de Marketing y utiliza texto español como fallback. No se inventó una traducción del cuestionario ni se alteró el seed en esta tarea.

APP-14 incorpora las reglas oficiales confirmadas de cobertura y ciclo de áreas. Las reglas de lectura global y activación por rol quedan confirmadas. No se declara APP-11 cerrado definitivamente mientras sigan pendientes la conciliación de propietarios históricos, las decisiones restantes y la validación funcional.
