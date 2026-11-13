# Propuesta Técnica: TerrenoCNR
**Licitación Compra Ágil:** APP y servicio web para la toma de información en terreno  
**Mandante:** Comisión Nacional de Riego (CNR) – Ministerio de Agricultura de Chile  
**Presupuesto Máximo Disponible:** $7.200.000 CLP  
**Plazo de Entrega e Implementación:** 5 días hábiles  

---

## 1. Resumen Ejecutivo
TerrenoCNR es una plataforma web y móvil empresarial diseñada específicamente para digitalizar, supervisar, georreferenciar y trazar en tiempo real las actividades técnicas, inspecciones de obras de riego (Ley N° 18.450), órdenes de trabajo (OT) y requerimientos de soporte informático de la CNR.

La plataforma opera bajo una arquitectura de alta disponibilidad con **sincronización bidireccional offline**, permitiendo a los inspectores operar en zonas remotas y sin cobertura celular, asegurando la captura fidedigna de datos, trazabilidad bajo la Ley N° 19.799 y máxima seguridad según la Ley N° 21.719.

---

## 2. Matriz de Cumplimiento Funcional y Técnico (35 Puntos)

| # | Requerimiento TDR | Cumplimiento | Detalle Técnico y Acreditación |
|---|---|---|---|
| 1 | **Digitalización de procesos en terreno** | **CUMPLE TOTALMENTE** | Soporte multientidad para inspección de obras de riego, órdenes de trabajo, visitas técnicas, soporte TI y levantamientos. Cada tipo cuenta con flujos y formularios configurables. |
| 2 | **Aplicación móvil y web** | **CUMPLE TOTALMENTE** | Plataforma Web responsiva Next.js y App Móvil nativa desarrollada en React Native / Expo compatible con Android e iOS. |
| 3 | **Formularios personalizados** | **CUMPLE TOTALMENTE** | Motor de formularios dinámicos con 21 tipos de campo: texto, números, fechas, QR, código de barras, fotos, firmas, puntos/polígonos GPS, audio y transcripción voz a texto. Incluye motor de reglas condicionales y precarga externa. |
| 4 | **Geolocalización y mapas** | **CUMPLE TOTALMENTE** | Captura de coordenadas GPS con estimación de precisión (±m), soporte para puntos, líneas, recorridos y polígonos. Visualización en mapas y exportación interoperable en **KML, GeoJSON y CSV**. |
| 5 | **Registro de evidencias digitales** | **CUMPLE TOTALMENTE** | Adjunto de fotografías con opción de **bloqueo estricto de galería** (captura exclusiva por cámara), documentos, firmas y notas con sellado de tiempo, coordenadas y hash SHA-256 inmutable. |
| 6 | **Funcionamiento sin conexión (offline)** | **CUMPLE TOTALMENTE** | Base de datos local SQLite con cola de mutaciones idempotentes y sincronización automática transaccional al recuperar conectividad. |
| 7 | **Gestión de Órdenes de Trabajo (OT)** | **CUMPLE TOTALMENTE** | Módulo integral de gestión de OT con priorización, asignación a responsables, monitoreo de % de avance, fechas límites y evidencias de ejecución. |
| 8 | **Identificación y trazabilidad** | **CUMPLE TOTALMENTE** | Folio institucional único correlativo por tipo de proceso y año (ej. `INS-2026-000001`), bitácora de auditoría detallada de cambios anteriores y posteriores. |
| 9 | **Notificaciones y documentos automáticos** | **CUMPLE TOTALMENTE** | Generación instantánea de comprobantes/vouchers y reportes técnicos en PDF con código QR de verificación web y envío automático de correos institucionales. |
| 10 | **Flujos de trabajo y aprobación** | **CUMPLE TOTALMENTE** | Máquina de estados configurable por unidad, soportando múltiples niveles de autorización (Nivel 1 Supervisor, Nivel 2 Jefatura) con observaciones y rechazos trazados. |
| 11 | **Integración con sistemas institucionales** | **CUMPLE TOTALMENTE** | Interoperabilidad integral mediante API REST documentada con Swagger/OpenAPI, Webhooks bidireccionales con firma criptográfica HMAC y servidor de protocolo MCP (*Model Context Protocol*). |
| 12 | **Reportabilidad y dashboards** | **CUMPLE TOTALMENTE** | Tableros de control ejecutivos con métricas de productividad, estado de obras e informes exportables en PDF y Excel estructurado. |
| 13 | **Administración de usuarios** | **CUMPLE TOTALMENTE** | Gestión de 45 usuarios con roles diferenciados (Administrador, Supervisor, Técnico/Terreno) y restricción de visibilidad por unidad institucional. |
| 14 | **Ciberseguridad y protección de datos** | **CUMPLE TOTALMENTE** | Cifrado en reposo AES-256-GCM para evidencias sensibles, hashing de credenciales con Argon2id, tokens JWT de corta duración, CSP, rate limiting y auditoría. |
| 15 | **Monitoreo y continuidad** | **CUMPLE TOTALMENTE** | Endpoints de salud operacional `/health`, recolección de métricas Prometheus `/metrics`, respaldos automatizados y alertas ante contingencias. |

---

## 3. Ambiente de Demostración Operativo

- **URL Plataforma Web:** `http://localhost:3000` (Desplegable en entorno cloud institucional)
- **Perfil Administrador:** `admin@cnr.gob.cl` / `Cnr2026!Demo`
- **Perfil Usuario Terreno:** `terreno@cnr.gob.cl` / `Cnr2026!Demo`
- **Documentación API y Swagger:** `http://localhost:4000/docs`

---

## 4. Oferta Económica

| Ítem | Descripción | Total Anual (CLP) |
|---|---|---|
| 1 | Licenciamiento anual para 45 usuarios habilitados | $5.500.000 |
| 2 | Configuración inicial, despliegue y capacitación | $900.000 |
| 3 | Soporte técnico, actualizaciones y mantenimiento 12 meses | $500.000 |
| **TOTAL OFERTA** | **Servicio Integral por 12 meses (Exento/Neto según corresponda)** | **$6.900.000 CLP** |

*La oferta económica se sitúa por debajo del presupuesto disponible de $7.200.000 CLP fijado por la CNR, garantizando el máximo puntaje en la evaluación de precio (35%).*
