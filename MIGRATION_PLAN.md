# Plan de Migración: MotorControl Enterprise (.NET 8 + Angular)

Este documento detalla la hoja de ruta para migrar el servidor central a una arquitectura empresarial moderna, manteniendo intacta la infraestructura de Edge Computing (`motorcontrol-edge-template`).

## Fases de la Migración

### Fase 1: Arquitectura Base e Inicialización (Días 1-2)
- [ ] Inicializar el repositorio Git.
- [ ] Crear la solución `.sln` de Visual Studio / .NET CLI.
- [ ] Scaffolding de la Web API con .NET 8 (`dotnet new webapi`).
- [ ] Workspace de Angular (`ng new frontend`).

### Fase 2: Capa de Datos y Dominio (Días 3-5)
- [ ] Configurar **Entity Framework Core**.
- [ ] Migrar el esquema de base de datos desde Sequelize a clases C# (Modelos: `User`, `Gateway`, `Camera`, `Log`).
- [ ] Crear las migraciones iniciales.
- [ ] Configurar repositorios o el DbContext nativo.

### Fase 3: Seguridad y Core API (Días 6-8)
- [ ] Implementar Autenticación y Autorización basada en **JWT** (JSON Web Tokens) en .NET.
- [ ] Crear controladores (`Controllers`) para Gestión de Usuarios y Setup de Gateways.
- [ ] Configurar Swagger para documentación de la API.

### Fase 4: Integración IoT en el Backend (Días 9-12)
- [ ] Añadir paquete **MQTTnet**.
- [ ] Crear un `BackgroundService` en C# que esté permanentemente suscrito al broker Mosquitto.
- [ ] Procesar heartbeats de Edge Devices y actualizar su estado en la base de datos (Online/Offline).

### Fase 5: Desarrollo Frontend - Angular (Días 13-18)
- [ ] Implementar sistema de enrutamiento y Guards (Protección de rutas por login).
- [ ] Crear interceptor HTTP para inyectar el token JWT en las peticiones.
- [ ] Construir Vistas Principales:
    - [ ] Login
    - [ ] Dashboard General (Gateways Activos, Cámaras Online)
    - [ ] Panel de Gestión de Cámaras y Gateways
- [ ] Integrar el reproductor de video para consumir el flujo de MediaMTX.

### Fase 6: Tiempo Real (Opcional pero Recomendado)
- [ ] Integrar **SignalR** en .NET.
- [ ] Consumir SignalR en Angular para reflejar la caída/conexión de cámaras instantáneamente en la pantalla sin recargar la página.

---
**Nota:** El cliente Edge (`motorcontrol-edge-template`) y el stack de Docker con `mediamtx` y `mosquitto` seguirán funcionando como hasta ahora, interactuando con este nuevo servidor central de .NET.
