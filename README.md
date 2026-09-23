<p align="center">
  <img src="./logo-tryai.svg" alt="Logo TryAI Gap" width="450">
</p>

<h1 align="center">TryAI Gap (Bridge the AI Gap) 🚀</h1>
# TryAI Gap (Bridge the AI Gap) 🚀

> Plataforma web SaaS multitenant diseñada para evaluar el nivel de madurez y preparación de las organizaciones frente a la adopción de Inteligencia Artificial.

TryAI Gap ayuda a las empresas a diagnosticar su estado actual, identificar brechas tecnológicas y de negocio, y priorizar iniciativas de IA mediante una evaluación estructurada, visualización de datos avanzados y generación automática de informes ejecutivos.

## ✨ Funcionalidades Principales

- **🏢 Arquitectura Multitenant:** Aislamiento de datos por organización, garantizando seguridad, trazabilidad y control de acceso basado en roles.
- **📝 Diagnóstico Colaborativo:** Cuestionarios dinámicos con la capacidad de delegar preguntas a especialistas dentro de la misma organización y adjuntar evidencias.
- **📊 Motor de Visualización Avanzado:** 
  - Radar de Madurez.
  - Mapas de Calor (Heatmaps).
  - Matriz *Pain × Readiness* para priorización de iniciativas.
- **📄 Reportes Ejecutivos:** Generación automática de informes en formato PDF con los resultados del diagnóstico para el apoyo en la toma de decisiones.

## 🛠️ Stack Tecnológico

El proyecto está construido utilizando tecnologías modernas y orientadas a la escalabilidad:

### Frontend
- **Framework:** React + Vite
- **Lenguaje:** TypeScript
- **UI/UX:** shadcn/ui (o la librería de estilos que definan)
- **Visualización de datos:** Librerías gráficas para Dashboards

### Backend
- **Framework:** FastAPI (Python)
- **Base de Datos:** PostgreSQL
- **Autenticación:** JWT / Magic Links

### Aseguramiento de Calidad & DevOps
- **Testing:** Pytest (Backend) / Playwright o Vitest (Frontend E2E)
- **Contenedores & Despliegue:** Docker, GitHub Actions (CI/CD)

## 👥 Equipo de Desarrollo

Este proyecto es desarrollado para la asignatura Capstone de Ingeniería en Informática (Sede San Joaquín) por el siguiente equipo

*   **Vicente Cerda:** Responsable principal de UX/UI, frontend y visualización de resultados
*   **Benjamin Abarca:** Responsable principal de backend y diseño de APIs
*   **Adoniss Riquelme:** Responsable principal de base de datos, reglas de negocio y procesamiento de resultados
*   **Andrew Sandoval:** Responsable principal de QA, seguridad, CI/CD y despliegue
