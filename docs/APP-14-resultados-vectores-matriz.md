# APP-14: vectores de valor y matriz por área

Fecha: 26-10-2026. Rama de trabajo: `desarrollo-Andrew`.

## Fuentes y alcance

- `Dudas APP.pdf`, Administración, páginas 1–2: fórmula promedio / 5 × 100, cinco categorías semánticas, futura entrega de la clasificación de las 132 preguntas y del esquema. No contiene la asignación de preguntas concretas.
- `DiagramaDB_TryAIGap.pdf`: propone `questions.vector_type`, `weight_pain` y `weight_readiness`. No define el vocabulario exacto almacenado en `vector_type`.
- Solicitud de desarrollo del usuario: Pain = promedio A; Readiness = promedio conjunto B/C/D; escala 1–5, sin inversión; umbral 3,0; Quick Win únicamente con ambas coordenadas estrictamente mayores que 3,0. Estas reglas no están detalladas en los PDF y no se atribuyen a ellos.

No se modifican modelos SQLAlchemy, migraciones, esquema, datos persistidos, límites Free ni cálculos del radar/heatmap. Se conserva el PDF ejecutivo; únicamente se actualiza su mensaje de ausencia de iniciativas para que no afirme que Pain no se recoge.

## Implementación

`result_metrics_service.py` agrega cálculos separados a la respuesta Pro de resultados:

- `value_vectors`: estado de la integración, cinco categorías estables, porcentaje nullable y cantidad de respuestas por categoría; cobertura del mapeo y respuestas numéricas excluidas por etiqueta ausente/desconocida.
- `pain_readiness`: umbral, regla de cobertura, puntos reales y áreas pendientes con cantidad de respuestas numéricas y total de preguntas.

Los campos nuevos son opcionales en los tipos de respuesta para mantener compatibilidad. La vista Free sigue usando exclusivamente la lista permitida del endpoint `/preview`; las métricas nuevas se sirven bajo la misma autorización Pro y comprobación de organización del endpoint completo. No se crean endpoints alternativos.

Solo participan respuestas guardadas con `state == answered` y valor numérico 1–5 de la evaluación solicitada. `idk`, `delegated`, `pending` y valores ausentes no se convierten en cero.

### Vectores

Cada respuesta se agrupa exclusivamente por la etiqueta explícita de su pregunta. No se deduce el vector desde el área, bloque, dimensión, texto ni código. Promedio simple por respuesta; no se usan los pesos. Sin respuestas: `percentage: null`.

Los identificadores internos son `eficiencia`, `ingresos`, `experiencia`, `riesgo`, `talento`. Se reconocen esas denominaciones explícitas con normalización de espacios, mayúsculas y acentos. Si Administración utiliza otro vocabulario, se deberá acordar y adaptar expresamente antes de habilitarlo; las etiquetas desconocidas se informan como no mapeadas.

El modelo compartido actual no tiene `Question.vector_type`. En ese caso se devuelve `schema_pending` y cinco valores ausentes, sin consultar una columna inexistente. Agregar solo una columna física no activa esta integración: deben integrarse conjuntamente el modelo oficial y su migración, por Administración. Con el modelo disponible, se lee la clasificación real; si está incompleta o contiene valores desconocidos, el estado es `mapping_pending`. Los porcentajes que sí se pueden calcular se presentan como parciales.

El estado `ready` indica cobertura del catálogo clasificado, no cuestionario completo. Cada vector muestra la cantidad de respuestas; un vector sin respuestas sigue sin datos incluso con catálogo completo.

### Matriz

Por área funcional conocida, usando el catálogo real del módulo `area`:

- Pain: media de las respuestas del Bloque A.
- Readiness: media de todas las respuestas de B, C y D juntas. No es la media de tres medias de bloque.
- Clasificación con valores exactos antes del redondeo de presentación; ambos valores > 3: `high_high` y `quick_win: true`; cualquier coordenada == 3: `boundary`; restantes combinaciones: `high_low`, `low_high`, `low_low`.
- El gráfico usa Readiness en X y Pain en Y, ambos de 1 a 5, con líneas de referencia en 3. La tabla accesible muestra área, coordenadas y clasificación. La clasificación no crea iniciativas ni calcula un ranking entre áreas.

**Decisión conservadora pendiente de validación funcional:** los PDF no definen la cobertura mínima para publicar un punto. Se exige que existan los cuatro bloques y que todas las preguntas actuales de cada bloque tengan respuestas numéricas. Áreas incompletas muestran cobertura, sin coordenadas ni Quick Wins. Esta regla está explicitada en la interfaz; no se presenta como decisión oficial de Administración. Si Administración autoriza un mínimo distinto, deberá ajustarse el guardado de publicación y sus pruebas, sin cambiar las fórmulas.

Para mantener coherencia con el heatmap existente, se consideran las respuestas guardadas por área independientemente del indicador `AreaState.active`. Falta confirmar si desactivar un área debe excluir sus respuestas históricas de ambas visualizaciones.

La interfaz utiliza i18next y los recursos ES/EN/DE/PT existentes: reutiliza nombres de los cinco vectores, áreas y mensajes compartidos. Las cifras usan el idioma activo de la interfaz. No hay nuevas dependencias.

## Dependencias de Administración e incompatibilidades por revisar

1. Entrega e integración del modelo y migración oficial de `vector_type`.
2. Clasificación real de las 132 preguntas, valores exactos de la etiqueta y confirmación del alcance maturity/area.
3. Validación del criterio conservador de cobertura y del tratamiento de áreas desactivadas.
4. El diagrama no representa `answers.state`, `updated_by`, `updated_at` ni `users.organization_id` como el modelo actual. No eliminar esos campos al integrar el esquema: los estados son esenciales para cálculos, delegación y límites Free; la relación con organización interviene en autorización. Resolver las diferencias con Administración, no mediante migraciones locales improvisadas.
5. Modelo y columna deben llegar sincronizados; una versión de ORM que declare una columna ausente en la base seguirá siendo un despliegue incompatible y requiere la migración oficial.

No se generan asignaciones, porcentajes, iniciativas o puntos simulados en la aplicación real. Los datos sintéticos se limitan a las pruebas. La fixture de futura columna se crea solo en metadatos de SQLite en memoria y no modifica el modelo de la aplicación.

## Validación y límites

Las pruebas nuevas cubren fórmulas, agrupación, falta de datos, estados no numéricos, frontera exacta, clasificación antes de redondear, aislamiento entre evaluaciones/organizaciones, API Pro y ausencia de métricas en Free. El frontend verifica cuatro idiomas, datos pasados al gráfico, escala y referencias, ausencia de barras cero/puntos sin datos, y autorización Free/Pro. Las pruebas del gráfico sustituyen Recharts para inspeccionar los datos y configuración: no equivalen a una revisión visual en un navegador real.

Para cumplir la prohibición de ejecutar migraciones, se excluyen las dos pruebas existentes de `test_invitation_migration.py`, que invocan `upgrade()` aunque sea en memoria. El resto de pruebas usa bases aisladas.

Antes de cerrar APP-14: validar visualmente el gráfico con un área real completa, las cuatro traducciones en pantallas estrechas, datos que compartan coordenadas y el PDF existente; integrar y probar el mapeo real en PostgreSQL cuando Administración lo entregue. Las nuevas métricas se muestran en la página de resultados; no se añadieron páginas o gráficos al PDF ejecutivo.

Los resultados verificables de las ejecuciones actuales se registran en la entrega y en los logs del directorio externo `APP14_avance_2026-10-26`. APP-14 no se declara completo mientras falten las dependencias oficiales y la validación funcional.

## Resultados de ejecución del 26-10-2026

- Backend: **78 pruebas aprobadas**, sin fallos ni errores (129,544 s). Incluye 17 pruebas nuevas de métricas y las regresiones APP-06, APP-11, organizaciones, progreso y resultados. Excluidas las 2 pruebas de migraciones mencionadas arriba.
- Frontend: **122 pruebas aprobadas en 19 archivos** (86,06 s), incluidas 9 nuevas de métricas, comprobaciones ES/EN/DE/PT y regresiones PDF/paywall/invitaciones.
- `npm run build`: **aprobado**, TypeScript y Vite. Se corrigió una comprobación de nulidad señalada por la primera ejecución de TypeScript antes del build final. Avisos no bloqueantes: datos Browserslist antiguos y bundles mayores de 500 kB. Sin actualización de dependencias por esta tarea.
- `git diff --check`: aprobado. Los cuatro recursos JSON se validaron además sin claves duplicadas.
- `dev.db` conserva su SHA-256 antes/después de ejecutar las suites: `4244a0eb3912f267b20e549713110affd4a104879804391d484c13dc100212d6`.
- No se hicieron commits, push, cambios de rama, migraciones ni modificaciones de modelos SQLAlchemy o credenciales. `aplicar_app14.py` ya estaba sin seguimiento antes de comenzar y no se modificó.

Evidencia externa: `backend-tests.log`, `frontend-tests.log` y `frontend-build.log` en `C:/Users/andre/Documents/ChatGPT/CAPSTONE/APP14_avance_2026-10-26`. El script `run_backend_tests.py` de ese directorio documenta la exclusión de pruebas que ejecutan migraciones.
