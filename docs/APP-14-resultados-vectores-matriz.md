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

El modelo oficial integrado dispone de `Question.vector_type` y pesos oficiales; los cálculos mantienen el promedio simple sin ponderaciones. Las 112 preguntas funcionales tienen clasificación oficial. Las 20 de madurez siguen pendientes de clasificación y nunca se infieren por texto o bloque. La respuesta conserva compatibilidad `schema_pending` para integraciones anteriores y `mapping_pending` cuando la clasificación elegible es incompleta.

El estado `ready` indica cobertura del catálogo clasificado, no cuestionario completo. Cada vector muestra la cantidad de respuestas; un vector sin respuestas sigue sin datos incluso con catálogo completo.

### Matriz

Por área funcional conocida, usando el catálogo real del módulo `area`:

- Pain: media de las respuestas del Bloque A.
- Readiness: media de todas las respuestas de B, C y D juntas. No es la media de tres medias de bloque.
- Clasificación con valores exactos antes del redondeo de presentación; ambos valores > 3: `high_high` y `quick_win: true`; cualquier coordenada == 3: `boundary`; restantes combinaciones: `high_low`, `low_high`, `low_low`.
- El gráfico usa Readiness en X y Pain en Y, ambos de 1 a 5, con líneas de referencia en 3. La tabla accesible muestra área, coordenadas y clasificación. La clasificación no crea iniciativas ni calcula un ranking entre áreas.

**Regla confirmada por Administración:** un área solo publica un punto con exactamente 16 preguntas funcionales de A–D respondidas numéricamente y en estado `answered`. La cobertura parcial se muestra sin coordenadas ni Quick Wins. Esta condición sustituye la decisión conservadora inicial; las fórmulas no cambian.

**Áreas desactivadas:** se conservan sus respuestas, pero se excluyen de la matriz Pain × Readiness y de los cinco vectores mediante `AreaState.active`. Al reactivarse vuelven a contribuir con los mismos datos. El heatmap histórico por bloques conserva su comportamiento anterior.

La interfaz utiliza i18next y los recursos ES/EN/DE/PT existentes: reutiliza nombres de los cinco vectores, áreas y mensajes compartidos. Las cifras usan el idioma activo de la interfaz. No hay nuevas dependencias.

## Dependencias de Administración e incompatibilidades por revisar

1. Entrega e integración del modelo y migración oficial de `vector_type`.
2. Clasificación real de las 132 preguntas, valores exactos de la etiqueta y confirmación del alcance maturity/area.
3. Validación manual en integración de la cobertura de 16 respuestas y de desactivación/reactivación, ya confirmadas oficialmente.
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


## Presentación ejecutiva actualizada el 29 de octubre de 2026

Se mantienen las fórmulas y la clasificación previa al redondeo. Administración confirmó posteriormente la cobertura de 16 respuestas numéricas y la exclusión de áreas desactivadas de matriz y vectores. Las áreas activas incompletas muestran cantidad de respuestas y progreso, sin coordenadas inventadas.

La interfaz y el PDF omiten la sección de iniciativas cuando `priorities` está vacío. El contrato se conserva y ambos pueden mostrar iniciativas futuras proporcionadas por el backend. No existe generación automática de iniciativas.

El PDF se genera en el frontend con el mismo `@react-pdf/renderer` y el idioma activo de i18next. Añade páginas de vectores (porcentajes reales, cobertura de clasificación y ausencia de datos) y matriz (SVG con coordenadas reales, umbral recibido, clasificación del servidor, tabla y áreas pendientes). No utiliza los endpoints de trabajos PDF del backend ni recalcula métricas. Las pruebas usan datos sintéticos y renderizan PDFs reales en los cuatro idiomas.

+
+### Validación de esta presentación
+
+- Backend: 98 pruebas aprobadas de leads, autenticación, invitaciones, organizaciones, progreso, límites Free y resultados. Solo bases aisladas; se excluyen las suites de migraciones.
+- Frontend: `npm test -- --maxWorkers=1`, 21 archivos y 143 pruebas aprobadas. Incluye estados sin respuestas, parciales, completos, Free/Pro, iniciativas vacías y futuras, clasificación cerca de 3 y orden de dibujo de puntos superpuestos sin alterar datos.
+- Compilación: `npm run build` aprobado. Persisten advertencias de tamaño de chunks y antigüedad de Browserslist; no se cambian dependencias.
+- PDF: 12 muestras (tres estados en cada idioma ES/EN/DE/PT) y una muestra con iniciativa sintética. Se verificaron cinco páginas por muestra de estados, títulos traducidos, caracteres ñ/ü/ã, precisión 3,001, ausencia de secciones vacías de iniciativas y texto dentro de los límites de página. Revisión visual mediante Poppler; las muestras son exclusivamente sintéticas.
+- La primera ejecución paralela de Vitest agotó tiempos de arranque de trabajadores. La ejecución final con un trabajador pasó sin errores; no se cambió la configuración global de Vitest.
+- No se modificaron backend, modelos, migraciones ni bases reales en esta etapa. Administración confirmó posteriormente la cobertura de 16 respuestas numéricas y la exclusión de áreas desactivadas de matriz y vectores; el cierre de esas reglas se documenta en APP-11-APP-14-cierre-funcional.md.
