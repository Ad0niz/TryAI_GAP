# APP-14 — Primera etapa de integración con Administración

Fecha: 27-10-2026. Rama autorizada: `desarrollo-Andrew`.

## Alcance preparado

El modelo incorpora las definiciones de `models (1).py` de Administración para:

- `users.two_factor_enabled`: Boolean, no nullable, default ORM `False`.
- `questions.vector_type`: String(30), nullable.
- `questions.weight_pain` y `questions.weight_readiness`: SmallInteger, no nullable, default ORM `1`.

Se conserva temporalmente `invitations.accepted_at`, que no aparece en el archivo oficial. Es una extensión APP deliberada y documentada: el servicio de invitaciones y sus controles de aceptación única no se modifican ni debilitan. Su retirada futura requiere otra entrega coordinada, pruebas y revisión de datos históricos.

No se modifican APP-17 ni APP-20. No se implementa 2FA: agregar el indicador no habilita ese mecanismo ni modifica contraseñas.

## Historial y migración aditiva

La revisión nueva es `20261027_app14_admin`, con `down_revision = 20261022_app11`. No se modifica ni sustituye la revisión anterior y no se crea otra raíz Alembic.

La migración únicamente agrega las cuatro columnas nuevas. No elimina ni reconstruye tablas. Antes de hacer DDL comprueba las tablas requeridas y las definiciones de cualquier columna ya existente; si detecta tipos o nulabilidad incompatibles, se detiene.

En las columnas nuevas obligatorias utiliza valores predeterminados SQL `false` y `1` para cubrir filas existentes y permitir inserciones de versiones anteriores durante la transición. Se mantienen esos defaults SQL para evitar reconstruir tablas SQLite; los valores y tipos coinciden con los defaults oficiales del ORM. Esta diferencia entre default ORM y default SQL es intencional, no un cambio de fórmula o de política de seguridad. Si las columnas ya existen con definiciones compatibles, no las altera.

Se deshabilita el downgrade destructivo de esta revisión. No se debe interpretar como una autorización para restaurar la base; cualquier recuperación debe revisarse y autorizarse separadamente.

La cadena sigue siendo una actualización de bases existentes. No es una migración inicial que cree todas las tablas desde cero. No aplicar ni registrar esta rama Alembic sobre PostgreSQL compartida hasta conciliar el historial con Administración. No utilizar `stamp` para ocultar diferencias.

## Clasificación oficial de áreas

La clasificación se toma de `seed_area_questions (2).py`, entregado por Administración el 27-10-2026:

| Área | Valor almacenado |
|---|---|
| ventas | revenue |
| marketing | revenue |
| servicio | experience |
| finanzas | efficiency |
| operaciones | efficiency |
| rrhh | talent |
| legal | risk |

Los kits oficiales comprobados contienen A1–A4, B1–B4, C1–C4 y D1–D4 en cada área: 112 preguntas funcionales. Las constantes compartidas se reutilizan tanto para nuevas cargas de preguntas como para actualizar el catálogo existente.

`app.update_area_vectors` es una herramienta separada del seed general. Exige una ruta explícita a una copia SQLite existente, funciona en dry-run por defecto y requiere `--apply` para actualizarla. Rechaza `backend/dev.db`, sus enlaces al mismo archivo, archivos inexistentes y conexiones remotas. No utiliza la configuración de conexión de `.env`. Tampoco crea códigos de distribuidor de demostración.

El servicio valida primero todo el catálogo funcional: 112 claves `(module='area', area_key, code)`, bloques coherentes, ninguna clave desconocida o repetida y ningún vector contradictorio. Si falta una pregunta o existe una clasificación distinta de la oficial, se detiene sin aplicar una actualización parcial. El operador debe revisar los conflictos, no forzar una clasificación automática.

La actualización solo rellena `vector_type IS NULL` usando los UUID encontrados por clave lógica. No inserta, elimina o recrea preguntas ni toca respuestas, traducciones, posiciones, dimensiones, pesos, usuarios, organizaciones o evaluaciones. Las llamadas desde código deben estar dentro de una transacción; la CLI aplica el lote completo en una sola transacción. Repetirla sobre el catálogo ya clasificado actualiza cero filas.

## Contrato de resultados y dependencia de madurez

La base usa los cinco identificadores oficiales ingleses. El adaptador los convierte a las claves que ya consume el frontend:

| Base oficial | API existente |
|---|---|
| efficiency | eficiencia |
| revenue | ingresos |
| experience | experiencia |
| risk | riesgo |
| talent | talento |

Se conserva la compatibilidad con etiquetas españolas anteriores, sin traducir valores persistidos a español. Las etiquetas desconocidas o ausentes quedan sin mapear; no se deduce una clasificación desde el texto, bloque o dimensión.

No se asignan vectores a las 20 preguntas del Banco de Madurez: Administración aún debe entregar esos datos o confirmar explícitamente otro alcance. Tras clasificar las áreas de un catálogo de 132 preguntas, la cobertura correcta es `112 / 132` y el estado sigue siendo `mapping_pending`. Las respuestas de madurez sin etiqueta no entran en porcentajes y se contabilizan como no mapeadas.

Los porcentajes mantienen la media simple de las respuestas numéricas / 5 × 100. Pain mantiene la media de A y Readiness la media conjunta de B/C/D. Los campos de peso no se usan. Se conservan radar, heatmap, restricciones Free/Pro y el criterio de cobertura de la matriz documentado en la entrega anterior.

## Advertencia de arranque

**El código nuevo no debe iniciarse contra `dev.db` sin actualizar su esquema mediante un procedimiento posterior autorizado.** La base original no se migra en esta etapa. Un ORM que declara las columnas nuevas no puede consultarlas en un archivo que todavía no las contiene; `create_all()` no actualiza tablas existentes. Esto también aplica a un servidor Uvicorn con recarga automática.

Para probar esta entrega hay que apuntar explícitamente a una copia ya migrada o a una base de pruebas aislada. No ejecutar el seed general contra la base original.

## Procedimiento propuesto para ensayar con una copia real

Este procedimiento queda preparado para revisión; no se ejecutó sobre una copia de los datos reales durante esta etapa. Las pruebas automatizadas usan datos sintéticos.

1. Detener el backend para que no cambie el catálogo durante la captura.
2. Crear un respaldo consistente de `backend/dev.db` con `sqlite3.Connection.backup`; conservarlo y verificar `integrity_check` y `foreign_key_check`.
3. Registrar identificadores, cantidades y huellas de todas las columnas originales de las tablas de aplicación. Crear una segunda copia independiente para el ensayo.
4. Comprobar que la copia tiene el esquema existente y `alembic_version = 20261022_app11`. No ejecutar `stamp` si no coincide: detenerse y diagnosticar.
5. Desde `backend`, fijar `DATABASE_URL` **solo para el proceso del ensayo** a la ruta absoluta de la copia. Ejecutar:

   ```powershell
   # Sustituir por una copia independiente, nunca backend/dev.db.
   $env:DATABASE_URL = 'sqlite+aiosqlite:///C:/ruta/ensayo-app14.db'
   .\.venv\Scripts\python.exe -B -m alembic upgrade 20261027_app14_admin
   ```

6. Verificar revisión, cuatro columnas, valores iniciales, integridad, claves foráneas y conservación de todos los datos originales, incluido `accepted_at`.
7. Validar la clasificación sin escritura y revisar el informe:

   ```powershell
   .\.venv\Scripts\python.exe -B -m app.update_area_vectors --database 'C:/ruta/ensayo-app14.db'
   ```

8. Solo si el dry-run valida las 112 claves y no detecta conflictos, ejecutar en esa misma copia:

   ```powershell
   .\.venv\Scripts\python.exe -B -m app.update_area_vectors --database 'C:/ruta/ensayo-app14.db' --apply
   ```

9. Comprobar distribución: efficiency 32, revenue 32, experience 16, risk 16, talent 16; las 20 de madurez conservan su clasificación anterior, incluyendo NULL. Comparar UUID y todos los valores originales salvo la nueva clasificación autorizada. Repetir la herramienta: debe actualizar cero filas.
10. Probar la aplicación solo contra la copia: APP-06, invitaciones APP-11 y resultados APP-14. No enviar correos reales ni utilizar servicios de pago reales en el ensayo.
11. Cerrar ese terminal o restaurar su variable de entorno anterior. Documentar el resultado. Aplicar la actualización a `dev.db` requiere una autorización y un procedimiento separados; esta CLI la bloquea deliberadamente en esta etapa.

Si aparece cualquier diferencia inesperada, detener el ensayo y conservar las evidencias. No ejecutar downgrade automático ni eliminar respaldos.

## Validación preparada

Las pruebas nuevas ejecutan Alembic y la CLI reales sobre archivos temporales con 132 preguntas sintéticas y traducciones/respuestas asociadas. Cubren cadena histórica, defaults, esquema parcialmente incompatible, preservación de todas las columnas previas, dry-run sin cambios, actualización de 112 preguntas, repetición, catálogo incompleto, conflictos y protección del archivo original. También prueban resultados después de la migración y la actualización real en una fixture aislada.

Las pruebas de métricas usan ahora el modelo integrado real, etiquetas inglesas y el contrato previo; ya no añaden una columna ficticia ni sustituyen el atributo mapeado. Incluyen madurez sin clasificar e independencia respecto de pesos distintos.

Pendientes externos: mapeo de las 20 preguntas de madurez, historial Alembic compartido y ensayo PostgreSQL autorizado. Se mantiene la diferencia temporal `accepted_at`. APP-17 y APP-20 quedan fuera del alcance.

## Resultados verificados de esta etapa

- Backend completo: **92 pruebas aprobadas**, sin fallos ni errores (173,656 s), con `DATABASE_URL=sqlite+aiosqlite:///:memory:` para el proceso de pruebas y rutas temporales explícitas en los subprocesos de migración. Incluye las dos pruebas históricas de migración APP-11, ahora autorizadas exclusivamente en fixtures aisladas; no se ejecutan contra `dev.db`.
- Dentro de esa suite: 10 pruebas de integración administrativa/migración/actualización/seed y 19 pruebas de fórmulas y resultados. La primera ejecución de las pruebas administrativas detectó conexiones de fixtures SQLite sin cerrar al limpiarlas en Windows; se corrigió su cierre y la suite completa final pasó.
- Frontend: **122 pruebas aprobadas en 19 archivos** (150,05 s), incluidas las regresiones de resultados, PDF, cuatro idiomas y paywall.
- `npm run build`: **aprobado**, TypeScript y Vite. Avisos no bloqueantes de Browserslist antiguo y bundles mayores de 500 kB; no se actualizan dependencias en esta etapa.
- `git diff --check`: aprobado. Todos los campos oficiales de los modelos coinciden por comparación AST; la única extensión de campos respecto del archivo oficial es `Invitation.accepted_at`, conservada intencionalmente.
- Alembic: una única cabeza `20261027_app14_admin`, cuyo antecedente es `20261022_app11`.
- Los hashes de `backend/dev.db` y de la migración histórica APP-11 son idénticos antes/después del trabajo y las pruebas.
- No se modificaron archivos frontend, APP-17, APP-20, credenciales, bases remotas o datos de la base local original. No hubo commits, push ni cambios de rama. `aplicar_app14.py` era un archivo sin seguimiento preexistente y quedó intacto.

Las ejecuciones reales de migración y actualización de datos solo ocurrieron sobre fixtures sintéticas temporales. No se ensayó todavía sobre una copia de datos reales ni sobre PostgreSQL. No se declara completada la integración operativa o el mapeo de madurez.

Evidencias externas: `backend-tests.log`, `frontend-tests.log`, `frontend-build.log` y `protected-baseline.json` en `C:/Users/andre/Documents/ChatGPT/CAPSTONE/APP14_integracion_2026-10-27`.

## Archivos de esta entrega

Modificados:

- `backend/app/models.py`: cuatro campos oficiales y nota de compatibilidad de `accepted_at`.
- `backend/app/seed_area_questions.py`: clasificación oficial para nuevas cargas.
- `backend/app/services/result_metrics_service.py`: adaptación de identificadores ingleses al contrato existente, sin cambiar fórmulas.
- `backend/tests/test_result_metrics.py`: uso del modelo integrado, identificadores oficiales, pesos ignorados y madurez pendiente.

Nuevos:

- `backend/app/core/question_vectors.py`: clasificación oficial y adaptación de claves compartidas.
- `backend/app/services/question_vector_service.py`: actualización estricta y transaccional del catálogo existente.
- `backend/app/update_area_vectors.py`: CLI protegida para copias SQLite explícitas.
- `backend/migrations/versions/20261027_app14_admin.py`: migración aditiva encadenada.
- `backend/tests/test_admin_integration.py`: pruebas aisladas de la cadena, preservación y resultados.
- `docs/APP-14-integracion-administracion.md`: esta documentación y el procedimiento de ensayo.
