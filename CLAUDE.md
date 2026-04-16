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

## Topología de red — CRÍTICO leer antes de tocar cualquier IP

### Servidor de producción (Casa del Profesor)
- SSH: `victormanuel@177.247.175.4:2222` — ES una Raspberry Pi, NO un VPS cloud
- IP local: `192.168.1.24` · Red local: `192.168.1.0/24` · Router: `192.168.1.1`
- Tailscale: `mce-vps` → `100.121.193.106`
- **Las grabaciones van al disco LOCAL** (`/mnt/nas/raspberry_data/videos`) — el NAS físico (192.168.1.50) NO es accesible desde aquí. Disco: 29GB, se llena con ~1GB/hora de grabación.
- **Riesgo crítico**: disco lleno → PostgreSQL crash → gap de grabaciones. Monitorear con `df -h`.

### Gateway Six Zamora (Tienda)
- SSH: `carlos@100.127.9.5` (Tailscale) · Nombre TS: `six-zamora-pi` (antes `pruebacasacarlos`)
- IP local: `192.168.1.165` · Red local: `192.168.1.0/24` (distinta física a la del Profesor)
- DVR: `192.168.1.154` (antes `.155`, cambió 2026-04-16) · creds `admin:Emma080215` — **NO responde ping** (ICMP bloqueado), pero RTSP sí funciona. Confirmar con `nmap -p 554` antes de asumir caído.
- Grabaciones edge locales en: `/home/carlos/edge-gateway/data/recordings/` — pueden llenar el disco (29GB). Limpiar con `sudo find ... -name '*.mp4' -delete`
- Docker compose en: `~/edge-gateway/` · servicios: `mediamtx` (container: `edge-mediamtx`), `edge-agent`

### Tailscale — subnet routers
- **NUNCA activar ambas subnets al mismo tiempo** — Profesor y Six Zamora usan el mismo rango `192.168.1.0/24` y generan conflicto.
- Para acceder a red del Profesor: aprobar ruta en `mce-vps`
- Para acceder a red Six Zamora: aprobar ruta en `six-zamora-pi` (y quitar la del Profesor)
- Admin: https://login.tailscale.com/admin/machines

### NAS (pendiente resolver)
- NAS físico reportado en `192.168.1.50` — actualmente desconectado/apagado
- Confirmar con Profesor si está en otra IP o apagado
- Hasta resolver: grabaciones en disco local del servidor (riesgo de llenado)

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
