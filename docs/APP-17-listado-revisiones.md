# APP-17 Listado de revisiones de diagnóstico

Fecha: 29 de octubre de 2026. Rama: `desarrollo-Andrew`.

## Requisitos revisados

La Carta Gantt `FASE 1/Carta_Gantt_TryAI_Gap_App_con_desglose.xlsm`, hoja de desglose, compromete definir permisos/respuesta, implementar el listado filtrado por organización, mostrar estado y detalle, retirar la dependencia del ID guardado solo en navegador y probar revisiones múltiples y accesos no autorizados. El informe `FASE 1/DTG_50_TryAIGap_02-10-2026.docx` identifica APP-17 como solicitud/seguimiento y el listado como pendiente.

No se encontró una especificación de filtros adicionales ni paginación. El orden y contrato siguientes son decisiones de implementación para cubrir ese listado, no reglas comerciales atribuidas a Administración.

## Estado previo

Existían creación Pro, detalle individual y valoraciones. La pantalla solo podía descubrir la revisión cuyo identificador había guardado en `localStorage`. El detalle admitía acceso global por rol `consultant`; la valoración no comprobaba la organización propietaria.

## Contrato del listado

`GET /api/v1/reviews?assessment_id=<uuid>` requiere autenticación. Responde:

```json
{
  "assessment_id": "<uuid>",
  "items": [
    {
      "review_id": "<uuid>",
      "mode": "async",
      "stage": 1,
      "created_at": "2026-10-29T12:00:00Z",
      "updated_at": "2026-10-29T12:00:00Z",
      "consultant": null
    }
  ]
}
```

Se devuelven todas las revisiones del diagnóstico, ordenadas por `created_at DESC, id DESC`. No se filtran estados ni modalidades. Un diagnóstico existente sin revisiones devuelve HTTP 200 e `items: []`. Las fechas se serializan con zona horaria utilizando el helper UTC existente.

HTTP 401: falta autenticación o sesión no válida. HTTP 403: diagnóstico de otra organización. HTTP 404: diagnóstico o revisión inexistentes. Los errores no devuelven nombres de otra organización ni contenido de revisiones. Los parámetros inválidos mantienen HTTP 400 mediante el manejador de validación existente.

## Autorización y compatibilidad

Listado, detalle y valoración comprueban la organización del diagnóstico. La lectura conserva acceso autenticado a la propia organización, sin una nueva restricción Pro; la creación sigue requiriendo Pro y mantiene el rechazo de una revisión activa (`stage < 2`). Se conserva el contrato de creación, detalle y valoración.

Se retira la excepción de acceso global a detalles por rol `consultant`. Un consultor sin pertenencia a la organización no obtiene acceso por ese rol, incluso si existe `consultant_id`. Esta entrega no define permisos entre organizaciones por asignación, no asigna consultores ni modifica APP-20. Administración deberá confirmar su contrato antes de habilitar ese acceso específico. El cambio de seguridad se comunicó antes de aplicarse.

No se alteran modelos, tablas, migraciones ni bases reales.

## Interfaz

`Review.tsx` consulta el historial del diagnóstico desde la API. Muestra fecha, modalidad, estado, consultor disponible y acción para abrir el detalle. Selecciona inicialmente la revisión más reciente y permite cambiar de revisión. La selección está acotada al diagnóstico y las claves de caché incluyen usuario y diagnóstico.

El historial se revalida antes de mostrar datos en caché. Incluye carga, vacío, errores, 403/404, reintento y actualización. Las solicitudes en curso se actualizan periódicamente. Crear una revisión o encontrar un conflicto actualiza el historial desde el servidor. Puede solicitarse una nueva revisión cuando todas las existentes estén completadas, según la regla previa del backend.

Se elimina la lectura/escritura de `tryaigap.review.<assessmentId>` como mecanismo de descubrimiento; los valores antiguos no se utilizan ni se borran automáticamente. Permanece la caché local previa de valoraciones `tryaigap.rated.<reviewId>`, que no descubre revisiones ni autoriza operaciones. No se añade una nueva regla de unicidad de valoraciones.

Se conservan las traducciones ES/EN/DE/PT y se reutilizan las modalidades, estados y componentes existentes. No se agregan dependencias.

## Validación funcional manual para cierre

1. Abrir un diagnóstico sin revisiones: comprobar estado vacío y solicitud Pro.
2. Abrir un diagnóstico con varias revisiones, verificar orden y seleccionar detalles diferentes.
3. Reabrir la sesión en otro navegador o sin el ID local anterior: comprobar que el historial reaparece desde el servidor.
4. Solicitar una revisión, verificar que aparece y que no se ofrece otra mientras esté activa.
5. Consultar una revisión histórica completada y comprobar el formulario de valoración.
6. Verificar carga, error/reintento y respuestas 403/404 sin datos de otra organización.
7. Repetir la presentación en ES/EN/DE/PT y comprobar la conservación de Free/Pro.

La asignación y el avance real del trabajo del consultor pertenecen a los flujos existentes o a integraciones pendientes; no se simulan desde esta pantalla. La concurrencia de creación y la unicidad de valoraciones no se amplían en esta entrega. La aceptación funcional del Hito 2 requiere revisión del equipo; no se deduce únicamente del build.

+
+## Resultados de validación de esta entrega
+
+- Backend: 111 pruebas aprobadas, incluidas las 13 nuevas de `backend/tests/test_reviews.py`. Se probaron rutas y autenticación JWT reales con usuarios sintéticos y bases aisladas. La ejecución excluyó las dos suites dedicadas a migraciones y no utilizó bases reales.
+- Frontend: `npm test -- --maxWorkers=1 --pool=threads`, 22 archivos y 161 pruebas aprobadas. Las 18 pruebas de `web/src/pages/Review.test.tsx` cubren cuatro idiomas, vacío, varios detalles, reapertura, creación, conflicto, paywall, 403/404, reintento, caché y cambio de usuario/diagnóstico, nueva solicitud tras finalizadas y valoración histórica.
+- `npm run build`: aprobado. Permanecen advertencias previas de tamaño de chunks y antigüedad de Browserslist.
+- `git diff --check`: sin errores.
+- La primera ejecución frontend con procesos forks no inició su trabajador y no ejecutó pruebas; la ejecución final con threads pasó. No se modificó la configuración global de Vitest.
+- No se ejecutó validación manual en la aplicación ni una conexión PostgreSQL de integración en esta etapa. Quedan como comprobaciones de cierre del equipo; la asignación APP-20 sigue fuera del alcance.
+