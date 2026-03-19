# CODEBASE MAP — MotorControlEnterprise
**Última actualización:** 2026-03-18

---

## Arquitectura general

```
                    ┌─────────────────────────────────────────┐
                    │           Cloudflare Proxy               │
                    │  nirmgroup.net (SSL Full Strict)         │
                    └───────────────┬─────────────────────────┘
                                    │ HTTPS :443
                    ┌───────────────▼─────────────────────────┐
                    │           nginx (mce-nginx)              │
                    │  :80  → redirect HTTPS (dominio)        │
                    │  :443 → SSL termination                  │
                    │  :80/443 default_server → LAN only       │
                    └──────┬──────────┬───────────────────────┘
                           │          │
              /api/*        │          │ /**/whep/**
        ┌─────▼──────┐    │    ┌─────▼────────────────────┐
        │  backend   │    │    │  central-mediamtx :8889  │
        │  :8080     │    │    │  WebRTC/WHEP             │
        └─────┬──────┘    │    └──────────────────────────┘
              │            │ /
        ┌─────▼──────┐  ┌─▼──────────┐
        │ PostgreSQL │  │  frontend  │
        │ :5432      │  │  :80       │
        └────────────┘  └────────────┘

Edge gateways (Raspberry Pi)
  → RTSP push → central-mediamtx :8554 (expuesto :8556)
  → MQTT publish → mosquitto :1883 (expuesto :1885)
  → HTTP pull config → /api/edge/{gatewayId}/*
```

---

## Backend — Controllers

| Controlador | Ruta base | Auth | Descripción |
|---|---|---|---|
| `Auth/AuthController` | `/api/admin/auth` | admin | Login admin, gestión de usuarios internos |
| `Auth/UserAuthController` | `/api/auth` | — | Login cliente, change-password |
| `Monitoring/CameraController` | `/api/cameras` | admin/installer | CRUD cámaras, estado, metadata |
| `Monitoring/ClientController` | `/api/clients` | admin | CRUD clientes con soft-delete |
| `Monitoring/ClientProfileController` | `/api/client` | client | Portal cliente: perfil, cámaras, cambio de contraseña |
| `Monitoring/StreamController` | `/api/admin/stream` | admin | Control de streams (admin) |
| `Monitoring/UserStreamController` | `/api/stream` | client | Streams del portal cliente |
| `Monitoring/RecordingController` | `/api/recordings` | admin | Grabaciones NAS |
| `Monitoring/PtzController` | `/api/cameras/{id}/ptz` | admin | Control PTZ vía MQTT |
| `Monitoring/SdCardController` | `/api/cameras/{id}/sdcard` | admin | Gestión SD card |
| `Monitoring/WizardController` | `/api/admin/clients/{id}/edge-config` | admin | Genera config para edge gateway |
| `Edge/EdgeCameraController` | `/api/edge/{gatewayId}` | edge-token | Registro/heartbeat de cámaras desde el Pi |
| `Motors/MotorController` | `/api/admin/motors` | admin | CRUD motores industriales |
| `Motors/AdminTelemetryController` | `/api/admin/telemetry` | admin | Telemetría de motores |
| `HealthController` | `/health` | — | Estado del servicio + DB |

### Soft-delete de Clientes

```
DELETE /api/clients/{id}           → soft-delete (deleted_at = now)
GET    /api/clients/trash          → listar papelera (con DaysUntilPurge)
PATCH  /api/clients/{id}/restore   → restaurar
DELETE /api/clients/{id}/permanent → eliminar permanente (solo si en papelera)
```

### Portal cliente (`/api/client/*`)

```
GET    /api/client/me                  → perfil + cámaras (filtra IsRecordingOnly)
PATCH  /api/client/me/change-password  → cambio de contraseña
```

---

## Backend — Services

| Servicio | Descripción |
|---|---|
| `MqttService` | Conexión persistente con Mosquitto, pub/sub de tópicos |
| `CameraEdgeService` | Procesamiento de mensajes MQTT de cámaras edge |
| `StreamRecorderService` | Graba streams RTSP a NAS via ffmpeg |
| `StorageCleanerService` | Limpia grabaciones antiguas del NAS |
| `ResendEmailService` | Envío de emails via Resend.dev |
| `EdgeTokenService` | Genera/valida tokens para autenticación de edge gateways |

### MQTT — Tópicos

```
camera/{gatewayId}/{cameraKey}/status    → "active" | "offline" (+ LastSeen update)
camera/{gatewayId}/{cameraKey}/telemetry → datos de la cámara
motor/{id}/telemetry                     → telemetría ESP32
motor/{id}/command                       → comandos al motor
```

---

## Backend — Modelos principales

| Modelo | Tabla | Notas |
|---|---|---|
| `Client` | `Clients` | `DeletedAt` nullable — soft-delete; sin `ICollection<Camera>` nav (evita shadow FK) |
| `Camera` | `Cameras` | `IsRecordingOnly` bool; `Status` = "active"/"offline"/"inactive"; `ClientId` FK |
| `User` | `Users` | Roles: admin, installer, client; `MustChangePassword` bool |
| `Motor` | `Motors` | ESP32 via MQTT |
| `MotorTelemetry` | `MotorTelemetry` | Serie temporal |

### Migraciones

No existe tabla `__EFMigrationsHistory` — las migraciones se aplican con SQL directo en producción:
```sql
ALTER TABLE "Clients" ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE NULL;
```
Los archivos en `backend/Migrations/` son referencia, no se auto-aplican.

---

## Frontend — Componentes

```
frontend/src/app/
├── components/
│   ├── landing/                    → Landing page pública
│   ├── login/                      → Login admin/installer
│   ├── change-password/            → Cambio de contraseña forzado
│   ├── sidebar/                    → Sidebar admin
│   ├── dashboard/                  → Stats, actividad reciente
│   ├── cameras/                    → Lista de cámaras (admin)
│   ├── camera-detail/              → Detalle cámara + stream WebRTC
│   ├── camera-viewer/
│   │   ├── webrtc-viewer.component.ts   ← USAR ESTE (activo)
│   │   └── camera-viewer.component.ts   ← stub vacío (deprecated)
│   ├── gateways/                   → Gestión de edge gateways
│   ├── clients/                    → CRUD clientes + papelera soft-delete
│   ├── users/                      → IAM (dropdown: reenviar/suspender/eliminar)
│   ├── recordings/                 → Grabaciones NAS
│   ├── telemetry-dashboard/        → Dashboard telemetría motores
│   ├── telemetry-history/          → Histórico telemetría
│   ├── wizard/                     → Wizard configuración edge gateway
│   ├── shared/
│   │   ├── toast-container/        → Toasts top-right, auto-dismiss 4s
│   │   └── confirm-dialog/         → Modal confirmación con modo danger
│   └── client-portal/
│       ├── client-login/           → Login exclusivo cliente
│       ├── client-shell/           → Shell + sidebar portal cliente
│       ├── client-cameras/         → Cámaras cliente (polling 20s)
│       ├── client-camera-detail/   → Detalle cámara + WebRTC
│       ├── client-recordings/      → Grabaciones del cliente
│       └── client-account/         → Perfil y contraseña
├── guards/
│   ├── auth.guard.ts               → Admin/installer
│   └── client-auth.guard.ts        → Portal cliente
├── interceptors/
│   └── auth.interceptor.ts         → Agrega JWT — NO modificar sin coordinación
├── models/                         → Interfaces TypeScript
└── services/
    ├── toast.service.ts            → Signal-based (success/error/warning/info)
    └── confirm.service.ts          → Promise-based confirm modal
```

### Dos portales

| Portal | Ruta | Guard | JWT Role |
|---|---|---|---|
| Admin | `/dashboard`, `/cameras`, `/clients`, ... | `AuthGuard` | admin, installer |
| Cliente | `/client/*` | `ClientAuthGuard` | client |

### WebRTC/WHEP — Streaming

- **Componente activo:** `webrtc-viewer.component.ts`
- **Input:** `@Input() streamPath: string` → `"gatewayId/cameraKey"`
- **URL WHEP:** `/${streamPath}/whep` → nginx inyecta `Authorization: Basic` internamente
- **Reconexión:** automática, hasta 6 intentos, backoff exponencial
- **HLS:** eliminado completamente (`hls.js` removido del proyecto)

### Estado de cámaras — Regla crítica

```typescript
// ✅ CORRECTO
isOnline(cam) { return cam.status === 'active'; }

// ❌ INCORRECTO — lastSeen se actualiza en TODOS los mensajes MQTT incluyendo offline
isOnline(cam) { return (Date.now() - cam.lastSeen) < 30000; }
```

---

## Infraestructura

### Servidor producción

| Parámetro | Valor |
|---|---|
| Host público | `177.247.175.4` |
| SSH | `victormanuel@177.247.175.4 -p 2222` |
| IP interna | `192.168.1.24` |
| Directorio | `/home/victormanuel/MotorControlEnterprise` |
| Dominio | `https://nirmgroup.net` |
| SSL | Cloudflare Origin Cert (15 años, vence 2041) |
| Cloudflare | Full (strict) — wildcard `*.nirmgroup.net` listo |

### Puertos router (ZTE F670L)

| Puerto externo | Destino | Servicio |
|---|---|---|
| 443/TCP | 192.168.1.24:443 | HTTPS (Cloudflare → nginx) |
| 2222/TCP | 192.168.1.24:2222 | SSH |
| 1885/TCP | 192.168.1.24:1885 | MQTT (edge gateways) |
| 8556/TCP | 192.168.1.24:8556 | RTSP push (edge → mediamtx) |
| 8190/UDP | 192.168.1.24:8190 | WebRTC ICE media |

### Docker Compose — Servicios

| Contenedor | Puerto(s) | Descripción |
|---|---|---|
| `mce-postgres` | 5433→5432 | Base de datos |
| `mce-mosquitto` | 1885→1883 | MQTT broker |
| `mce-central-mediamtx` | 8556→8554 | RTSP + WebRTC/WHEP |
| `mce-backend` | interno:8080 | API ASP.NET Core 8 |
| `mce-frontend` | interno:80 | Angular 17 |
| `mce-nginx` | 80, 443 | Reverse proxy + SSL |
| `mce-postgres-backup` | — | pg_dump diario, retención 7 días |
| `mce-portainer` | 9000 | Docker UI (solo LAN) |

### nginx — Routing

```
nirmgroup.net → :443 (SSL)
  /health          → backend:8080
  /swagger         → backend:8080
  /api/*           → backend:8080
  /**/whep/**      → mediamtx:8889 + Authorization: Basic (viewer:MCE-watch-2026)
  /*               → frontend:80

IP directa (default_server):
  allow 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12, 127.0.0.1
  deny all  ← bloquea acceso externo directo por IP
```

---

## Gotchas y decisiones clave

1. **Sin `__EFMigrationsHistory`** — migraciones aplicadas con SQL directo. No usar `dotnet ef database update` en producción.

2. **Sin `ICollection<Camera>` en `Client.cs`** — causaba shadow FK `ClientId1`. Cameras se consultan con `.Where(c => c.ClientId == id)`.

3. **Credenciales MediaMTX en nginx** — `Authorization: Basic` se inyecta en nginx. El browser nunca ve las credenciales del viewer.

4. **`IsRecordingOnly`** — cámaras con esta flag solo graban al NAS. No se muestran en portal cliente ni conteos de cámaras activas.

5. **Polling en portal cliente** — `timer(0, 20000).pipe(switchMap(() => GET /api/client/me))`. Se destruye en `ngOnDestroy`.

6. **Auth interceptor** — JWT se agrega automáticamente. No poner `Authorization` manualmente en servicios HTTP.

7. **Toast + Confirm** — `providedIn: 'root'`. Los componentes visuales están en `app.component.html` (root level).

8. **Soft-delete** — `Client.DeletedAt != null` = en papelera. Todos los queries de lista filtran `.Where(c => c.DeletedAt == null)`.

9. **Deploy** — SSH → `git pull` → `docker compose up -d --build`. Usar skill `/devops`.

10. **Wildcard DNS** — `*.nirmgroup.net` activo en Cloudflare. Nuevos subdominios solo requieren agregar virtual host en nginx.
