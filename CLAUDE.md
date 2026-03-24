# CLAUDE.md — MotorControlEnterprise (NIRM GROUP)

> El orquestador global y las reglas base están en `~/.claude/CLAUDE.md`.
> Este archivo agrega el contexto de dominio de MotorControlEnterprise.

## Stack
- API: ASP.NET Core 8, EF Core 8, JWT · DB: PostgreSQL 15
- MQTT: MQTTnet 5.1, Mosquitto :1885
- Stream: MediaMTX + WebRTC/WHEP (sin HLS) · nginx proxy con credenciales
- Email: Resend.dev · Roles: `admin | installer | client`
- Frontend: Angular 17 standalone, SCSS variables
- Prod: `victormanuel@177.247.175.4:2222`

## Infra fija (no cambia entre sesiones)
- DB user: `motor_ent` · DB name: `MotorControlEnterprise`
- Docker services: `mce-postgres` `mce-mosquitto` `mce-central-mediamtx` `mce-backend` `mce-frontend` `mce-nginx`
- Servidor en mantenimiento hasta ~2026-04-01 — confirmar estado antes de deploy

## Commits — Scopes de este proyecto
`auth api mqtt db infra edge stream motor camera`

## Skills de dominio
| Dominio | Skill |
|---------|-------|
| Endpoint, DB, MQTT, .NET | `/backend` |
| Angular, SCSS, RxJS | `/frontend` |
| QA, aceptación | `/qa` |
| OWASP, JWT, seguridad | `/security` |
| Deploy, Docker, SSH | `/devops` |
| UI, theming, accesibilidad | `/ux` |
| Animaciones | `/animate` |
| Estado del sistema | `/status` |
| Pruebas UI, Playwright | `/webapp-testing` |

## Capturas del usuario
`Read` con ruta absoluta: `C:\Users\carlo\Pictures\Screenshots\` · `C:\Users\carlo\Desktop\` · `C:\Users\carlo\Pictures\Analisis-imagnes\`

## Contexto entre sesiones
Memory auto-save activo en `C:\Users\carlo\.claude\projects\C--dev-MotorControlEnterprise\memory\`.
Al terminar trabajo significativo → guardar en `project_*.md` o `feedback_*.md`.
Ver índice: `MEMORY.md`

## Inicio de sesión
Al iniciar cada sesión, leer:
1. `C:\Users\carlo\.claude\projects\C--dev-MotorControlEnterprise\memory\implementation_log.md` — últimas 3 sesiones
2. `C:\Users\carlo\.claude\projects\C--dev-MotorControlEnterprise\memory\project_state.md` — estado actual

## Compact Instructions
Al compactar, preservar:
- Últimos feat/fix commits y su razonamiento técnico
- Bugs encontrados y su causa raíz (especialmente CSS/stacking context, serialización de enums)
- Decisiones de arquitectura de la sesión actual
- Estado de features activas: qué está en prod, qué está en progreso
- Bloqueantes activos y workarounds aplicados
Descartar: outputs de herramientas verbose, listados de archivos completos, tareas ya cerradas.
