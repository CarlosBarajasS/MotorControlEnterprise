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

## Inicio de sesión (ClaudeBrain — canónico)
Ver protocolo completo en `~/.claude/CLAUDE.md` → SESSION START.
Rutas directas para este proyecto:
1. `C:\Users\carlo\Documents\ClaudeBrain\01-projects\MotorControlEnterprise\briefing_MotorControlEnterprise.md`
2. `C:\Users\carlo\Documents\ClaudeBrain\01-projects\MotorControlEnterprise\session_log_MotorControlEnterprise.md` — últimas 20 líneas
3. `C:\Users\carlo\Documents\ClaudeBrain\01-projects\MotorControlEnterprise\project_state_MotorControlEnterprise.md`

## Fin de sesión (ClaudeBrain — canónico)
Al terminar trabajo significativo:
- Agregar entrada al tope de `session_log_MotorControlEnterprise.md`
- Reescribir `project_state_MotorControlEnterprise.md` si el estado cambió
- Si cambió arquitectura → actualizar `briefing_MotorControlEnterprise.md`
- Feedback/domain nuevo → crear archivo en `memory\` e indexar en `memory\MEMORY.md`

## Compact Instructions
Al compactar, preservar:
- Últimos feat/fix commits y su razonamiento técnico
- Bugs encontrados y su causa raíz (especialmente CSS/stacking context, serialización de enums)
- Decisiones de arquitectura de la sesión actual
- Estado de features activas: qué está en prod, qué está en progreso
- Bloqueantes activos y workarounds aplicados
Descartar: outputs de herramientas verbose, listados de archivos completos, tareas ya cerradas.

## Memory
Vault canónico: `C:\Users\carlo\Documents\ClaudeBrain\01-projects\MotorControlEnterprise\`
Feedback/domain: `memory\` — leer solo si el usuario los pide por nombre.
Auto-memory Claude Code: `C:\Users\carlo\.claude\projects\C--dev-MotorControlEnterprise\memory\` — secundario, apunta a ClaudeBrain.
