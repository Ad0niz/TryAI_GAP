# Correcciones de cierre del QA del Hito 2

Fecha: 2 de noviembre de 2026. Rama de trabajo: desarrollo-Andrew.

## Cambios

1. La página de resultados y el PDF comparten `localizeResultLabels`, extraída del mecanismo existente en `reportI18n.ts`. Los niveles, dimensiones, bloques y nombres de áreas siguen el idioma activo, aunque el payload de API esté en español o en caché. Se conservan los puntajes, datos de usuario y contrato API. El PDF sigue cargándose de forma diferida.
2. Se completaron los dos kits ingleses faltantes con las 32 preguntas y títulos ya presentes en `web/src/i18n/locales/qbank.en.json`. El kit de Marketing se conecta a `AREA_KITS`; el de Operaciones utiliza la ruta que el cargador ya esperaba. Se mantiene el arreglo DE/PT de Benjamín. No se modificaron sus archivos Docker: `COPY English` ya incorpora los dos kits.
3. `seed_area_questions` repara las traducciones inglesas de esas dos áreas solo cuando tanto la fila española como la inglesa coinciden exactamente con el respaldo español original, incluidos los títulos. La actualización mantiene el UUID de la traducción. Si falta EN y el ES es canónico, completa la fila. Las traducciones personalizadas o válidas quedan intactas. No modifica preguntas, respuestas, vectores ni ponderaciones.
4. Los textos visibles de revisión humana (`review.sub`, `evaluation.q3Desc`, `evaluation.successSub`) utilizan Klertech en ES/EN/DE/PT. Se corrigió además el artículo inglés de la introducción. El alcance no es una sustitución masiva de textos legales o marcas de otras pantallas.

Los kits son una reutilización documentada del recurso EN existente, no traducciones inventadas ni nuevos archivos oficiales recibidos de Administración. Su hoja Source identifica el recurso y su SHA-256. No se crea un segundo motor de internacionalización.

## Archivos para revisar

Modificados:

- backend/app/seed_area_questions.py
- web/src/pages/Results.tsx
- web/src/pdf/reportI18n.ts
- web/src/pages/Results.test.tsx
- web/src/pages/Review.test.tsx
- web/src/i18n/locales/es.json
- web/src/i18n/locales/en.json
- web/src/i18n/locales/de.json
- web/src/i18n/locales/pt.json

Nuevos:

- English/EN Marketing and Demand Generation.xlsx
- English/EN Plant operations and production.xlsx
- backend/tests/test_english_seed.py
- docs/H2-correcciones-cierre-QA.md

`aplicar_app14.py` ya estaba sin seguimiento y no pertenece a estas correcciones. No se ejecutó git add, commit, push, merge ni cambio de rama.

## Validación

La evidencia detallada se conserva fuera del repositorio en `qa/fixes-cierre-20261102` del espacio CAPSTONE. El informe final de esa carpeta registra los resultados reales, incluida cualquier repetición necesaria de pruebas.

- Antes de corregir se reprodujo mediante prueba la carga de texto español en EN y los fallos de etiquetas/marca.
- Las nuevas pruebas frontend cambian de idioma sobre un mismo resultado español en caché; comprueban nivel, radar, barras, heatmap, nombres de área, conservación de datos y ausencia de nueva petición innecesaria.
- Las nuevas pruebas backend cubren carga nueva, reparación de 32 registros existentes, conservación de datos operativos y UUID, repetición idempotente, traducciones personalizadas, inglés ya válido, fila EN ausente y fuente de kit no disponible.
- La misma suite dirigida se ejecutó en PostgreSQL QA local con conexión verificada y esquemas nuevos. No se utilizó Neon ni otro servicio remoto.
- Se ensayó el seed sobre una copia consistente de la base sintética de cinco usuarios: se repararon exactamente 32 traducciones EN y todas las demás tablas y UUID quedaron iguales; 132 preguntas y 528 traducciones.
- Se repitieron los casos HTTP afectados y las restricciones Free/Pro/líderes. Se verificó visualmente la pantalla EN/DE/PT y la marca de revisión.
- Se descargó nuevamente el PDF inglés y se revisaron sus cinco páginas; los tests de PDF de los cuatro idiomas forman parte de la suite frontend.

Los ensayos no modifican `backend/dev.db`, `backend/local-test.db`, modelos, migraciones, credenciales, Neon ni producción. Las pruebas generaron únicamente datos ficticios en copias aisladas.

## Integración y aplicación posterior

1. Revisar e incorporar juntos los archivos de esta corrección, incluidos ambos Excel. Publicar los cambios queda a cargo de Andrew.
2. Reconstruir la imagen API con el código y los kits nuevos y ejecutar los casos afectados en el Docker QA de Benjamín. El Dockerfile no requiere cambios.
3. Antes de aplicar datos en otra base, identificar el destino y comprobar esquema vigente y respaldo recuperable. No ejecutar una inicialización de base vacía sobre datos existentes ni asumir que el push actualiza Neon.
4. Ejecutar el seed existente `python -B -m app.seed` solo sobre el destino explícito autorizado. El flujo nuevo crea EN correcto desde cero o repara únicamente los respaldos canónicos conocidos; DE/PT siguen por el módulo de Benjamín. No requiere una migración Alembic nueva.
5. Comparar cantidades e identificadores antes y después. Esperar 132 preguntas y 528 traducciones en el catálogo estándar, sin aumento de preguntas ni cambios de UUID o respuestas. Si hay preguntas/traducciones adicionales legítimas, conservarlas y revisar los totales antes de aplicar cualquier corrección.
6. Consultar las dos áreas en EN y los otros idiomas; repetir el seed para comprobar idempotencia. Una traducción personalizada que se haya conservado debe revisarse manualmente si el texto necesita actualización; no se fuerza su reemplazo.
7. Repetir navegación Free/Pro, permisos y PDF sobre la versión integrada; anexar el cierre de QA de Adoniss. Confirmar correo real y configuración del despliegue por separado.

Esta corrección no implementa 2FA, APP-20, despliegue Azure definitivo ni una nueva política comercial. La reprogramación de 2FA debe acordarse y documentarse; no queda cumplida por cerrar las tres incidencias visuales y de catálogo.
