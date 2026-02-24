# Carlos Barajas S.
**Desarrollador Full Stack | Ingeniero de Software**

📧 [tu.email@ejemplo.com] · 📱 [+52 XXX XXX XXXX] · 🌐 [github.com/CarlosBarajasS] · 📍 [Ciudad, País]

---

## Perfil Profesional

Desarrollador Full Stack con experiencia en diseño e implementación de sistemas empresariales escalables. Especializado en arquitecturas de microservicios, integración IoT y plataformas de monitoreo en tiempo real. Apasionado por construir soluciones robustas que combinan backend de alto rendimiento con interfaces de usuario modernas y reactivas.

---

## Habilidades Técnicas

### Backend
- **C# / .NET 8** — ASP.NET Core Web API, Entity Framework Core, JWT Authentication
- **Node.js** — Express, APIs REST
- **Bases de datos** — PostgreSQL, SQL Server
- **Mensajería IoT** — MQTT (MQTTnet, Mosquitto)
- **Seguridad** — Autenticación JWT, RBAC, BCrypt, HTTPS/TLS

### Frontend
- **Angular 17** — Componentes standalone, RxJS, Angular CLI, TypeScript 5
- **JavaScript / TypeScript**
- **HTML5 / CSS3**
- **Librerías** — HLS.js (video streaming), Chart.js / ng2-charts (visualización de datos)

### DevOps & Infraestructura
- **Docker & Docker Compose** — Contenerización de stacks completos
- **Nginx** — Reverse proxy, configuración de servidores estáticos
- **MediaMTX** — Servidor de streaming RTSP/HLS/WebRTC
- **NAS / Almacenamiento distribuido**
- **Swagger / OpenAPI** — Documentación de APIs

### Herramientas & Metodologías
- Git, GitHub, control de versiones
- Arquitectura orientada a servicios (microservicios, edge computing)
- Diseño de sistemas multi-tenant
- Principios SOLID, clean architecture

---

## Proyectos Destacados

### MotorControlEnterprise · *2024–2025*
**Plataforma empresarial de monitoreo y control IoT**

Sistema integral de gestión y vigilancia diseñado para entornos industriales distribuidos. Combina videovigilancia (VMS), telemetría de motores en tiempo real y administración multi-tenant en una sola plataforma.

**Arquitectura:**
- Stack completo contenerizado con Docker Compose: PostgreSQL 15, Mosquitto MQTT, MediaMTX, .NET 8 API, Angular 17 SPA y Nginx como reverse proxy
- Comunicación edge-to-cloud mediante MQTT para gateways distribuidos (cámaras IP, motores industriales)
- Streaming de video en tiempo real vía MediaMTX (RTSP → HLS/WebRTC) consumido en el frontend con HLS.js
- Grabación continua automática con segmentación, almacenamiento en NAS y política de retención de 30 días

**Backend (.NET 8 / C#):**
- API REST documentada con Swagger/OpenAPI
- Autenticación y autorización con JWT + roles (admin, client, user)
- Integración MQTT bidireccional: suscripción a heartbeats de gateways, estado de cámaras, telemetría de motores y eventos
- Patrón request-response sobre MQTT para comandos PTZ, gestión de tarjetas SD y control de grabaciones
- Background services: `AdminSeederService`, `MqttIntegrationService`, `StreamRecorderService`, `StorageCleanerService`
- Notificaciones por email con Resend.dev (alertas de cámaras, invitaciones de usuarios)
- ORM con Entity Framework Core + PostgreSQL; migraciones automatizadas

**Frontend (Angular 17 / TypeScript):**
- SPA con +20 componentes standalone: dashboard principal, gestión de cámaras, grabaciones, clientes, gateways, telemetría de motores, usuarios y wizard de configuración
- Visualización de telemetría (velocidad, corriente, voltaje, estado) con Chart.js en tiempo real
- Reproducción de video HLS en vivo y desde grabaciones históricas
- Portal diferenciado para clientes con acceso restringido a sus propias cámaras
- Guards de autenticación e interceptores HTTP para inyección automática de tokens JWT

**Características destacadas:**
- Arquitectura multi-tenant: múltiples clientes, cada uno con gateways, cámaras y grabaciones propias
- Detección automática de dispositivos (Hikvision, Dahua, genéricos) con identificación de tipo de almacenamiento (NVR, DVR, SD)
- Dashboard administrativo con métricas de uptime, disponibilidad de cámaras y salud del sistema
- Diseño en modo oscuro para los paneles de monitoreo
- Migracion documentada de arquitectura Node.js/Sequelize → .NET 8 Enterprise

**Tecnologías:** C# · .NET 8 · Angular 17 · TypeScript · PostgreSQL · Entity Framework Core · MQTT · MediaMTX · HLS.js · Chart.js · Docker · Nginx · JWT · BCrypt · Swagger

---

## Experiencia Profesional

### [Empresa / Freelance] · [Rol] · *[Fecha inicio] – Presente*
- [Descripción de responsabilidades y logros]
- [Logro cuantificable: p. ej. "Reducción del 30% en tiempo de despliegue mediante CI/CD"]

### [Empresa anterior] · [Rol] · *[Fecha inicio] – [Fecha fin]*
- [Descripción de responsabilidades]
- [Logro o impacto]

---

## Educación

### [Nombre de la Institución] · [Título / Carrera]
*[Año inicio] – [Año egreso]* · [Ciudad, País]

---

## Certificaciones & Cursos *(opcional)*

- [Certificación / Plataforma / Año]
- [Certificación / Plataforma / Año]

---

## Idiomas

- **Español** — Nativo
- **Inglés** — [Nivel: Básico / Intermedio / Avanzado]

---

*Última actualización: Febrero 2026*
