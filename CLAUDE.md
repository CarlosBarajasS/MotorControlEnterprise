# CLAUDE.md — MotorControl Enterprise

AI assistant guide for the MotorControl Enterprise codebase. Read this before making any changes.

---

## Project Overview

**MotorControl Enterprise** is a B2B Video Management System (VMS) for industrial monitoring. It manages IP cameras connected through distributed edge gateways, streams live video, stores recordings, and monitors motor telemetry — all from a central .NET 8 + Angular 17 platform.

**Tech stack:**
- **Backend:** .NET 8 Web API, Entity Framework Core, PostgreSQL, MQTTnet, JWT auth
- **Frontend:** Angular 17 (standalone components), HLS.js, Chart.js
- **Infrastructure:** Docker Compose, Nginx reverse proxy, MediaMTX (RTSP to HLS), Mosquitto MQTT, FFmpeg

---

## Repository Structure

```
MotorControlEnterprise/
├── backend/
│   ├── Controllers/
│   │   ├── Auth/                   # AuthController, UserAuthController
│   │   ├── Monitoring/             # CameraController, ClientController, StreamController,
│   │   │                           #   UserStreamController, PtzController, RecordingController,
│   │   │                           #   SdCardController, WizardController
│   │   ├── Motors/                 # MotorController, AdminTelemetryController
│   │   └── HealthController.cs
│   ├── Data/
│   │   └── ApplicationDbContext.cs # EF Core DbContext
│   ├── Models/
│   │   ├── Monitoring/             # Camera.cs, Client.cs, Recording.cs
│   │   ├── Motors/                 # MotorTelemetry.cs
│   │   └── Shared/                 # User.cs
│   ├── Services/
│   │   ├── Infrastructure/         # MqttPublisherService, MqttIntegrationService
│   │   ├── Monitoring/             # CameraEdgeService, StreamRecorderService, StorageCleanerService
│   │   └── Shared/                 # ResendEmailService, AdminSeederService
│   ├── Program.cs                  # DI container and middleware pipeline
│   ├── appsettings.json
│   └── Dockerfile                  # Multi-stage: SDK build then ASP.NET runtime + ffmpeg
├── frontend/
│   ├── src/app/
│   │   ├── components/
│   │   │   ├── dashboard/
│   │   │   ├── cameras/            # cameras.component, camera-detail.component
│   │   │   ├── clients/            # clients.component, client-detail.component
│   │   │   ├── gateways/
│   │   │   ├── recordings/         # Cloud + NAS recordings browser
│   │   │   ├── motors/             # motors.component, motor-control.component
│   │   │   ├── telemetry-dashboard/
│   │   │   ├── telemetry-history/
│   │   │   ├── users/
│   │   │   ├── wizard/             # 5-step onboarding wizard
│   │   │   ├── sidebar/
│   │   │   ├── login/
│   │   │   ├── landing/
│   │   │   ├── camera-viewer/      # Reusable HLS player
│   │   │   └── client-portal/      # Client-facing portal (login, cameras, recordings)
│   │   ├── services/
│   │   │   └── auth.service.ts     # JWT login/logout/token management
│   │   ├── interceptors/
│   │   │   └── auth.interceptor.ts # Adds Bearer token to all HTTP requests
│   │   ├── guards/
│   │   │   └── client-auth.guard.ts
│   │   ├── app.routes.ts           # All route definitions + adminAuthGuard (inline)
│   │   └── app.config.ts
│   ├── proxy.conf.json             # Dev proxy: /api -> https://localhost:7084
│   └── Dockerfile                  # Multi-stage: Node/Angular build then Nginx
├── nginx/
│   └── nginx.conf                  # Reverse proxy rules
├── mediamtx/
│   └── central-mediamtx.yml        # MediaMTX RTSP ingestion + HLS config
├── mosquitto.conf
├── docker-compose.yml
├── .env.example                    # Required env vars template
└── MotorControlEnterprise.sln
```

---

## Development Commands

### Backend (.NET 8)

```bash
cd backend
dotnet run                          # Run locally
dotnet watch run                    # Hot reload
dotnet build
dotnet restore
dotnet ef migrations add <Name>     # Add EF migration
dotnet ef database update           # Apply migrations
```

### Frontend (Angular 17)

```bash
cd frontend
npm install
npm start          # ng serve --proxy-config proxy.conf.json  (dev server on :4200)
npm run build      # Production build
npm test           # Unit tests
npm run watch      # Watch mode build
```

The Angular dev server proxies `/api/*` to `https://localhost:7084` (the .NET Kestrel port).
Run `npm start` in `frontend/` and `dotnet run` in `backend/` simultaneously for local dev.

### Docker (full stack)

```bash
cp .env.example .env   # Fill in secrets first
docker network create shared-edge-network   # Required external network
docker compose up -d

# Rebuild after code changes
docker compose build backend
docker compose up -d

# Logs
docker compose logs -f backend
docker compose logs -f frontend

docker compose down
```

---

## Environment Configuration

Copy `.env.example` to `.env` before running. Key variables:

| Variable | Description |
|---|---|
| `POSTGRES_USER` | PostgreSQL username |
| `POSTGRES_PASSWORD` | PostgreSQL password |
| `POSTGRES_DB` | Database name |
| `JWT_SECRET_KEY` | JWT signing secret (min 32 chars) |
| `MQTT_HOST` | MQTT broker hostname |
| `MQTT_PORT` | MQTT port (default 1883) |
| `BACKEND_PORT` | Host port for backend (default 8090) |
| `POSTGRES_PORT` | Host port for PostgreSQL (default 5433) |
| `Seed__AdminEmail` | First admin email (delete after first login) |
| `Seed__AdminPassword` | First admin password (delete after first login) |
| `NAS_RECORDINGS_PATH` | Host path for video recordings |
| `NAS_BACKUPS_PATH` | Host path for DB backups |

Non-secret config lives in `backend/appsettings.json`:
- `Email:ResendApiKey` — Resend.dev API key (empty disables email)
- `Email:AdminAlertEmail` — camera alert destination
- `EdgeDefaults:*` — defaults used by WizardController config generator

---

## API Reference

### Authentication

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/admin/auth/login` | None | Admin login, returns JWT |
| POST | `/api/auth/login` | None | Client login, returns JWT |
| GET | `/api/admin/auth/verify` | JWT | Verify token validity |
| GET | `/api/admin/auth/users` | Admin | List all users |
| POST | `/api/admin/auth/users` | Admin | Create user |
| POST | `/api/admin/auth/users/invite` | Admin | Invite user via email with temp password |
| PATCH | `/api/admin/auth/users/{id}/status` | Admin | Toggle active/inactive |
| DELETE | `/api/admin/auth/users/{id}` | Admin | Delete user |
| POST | `/api/auth/signup` | None | Client self-registration |

### Health

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/health` | None | `{ status, services: {database}, uptime }` — returns 503 if DB is down |
| GET | `/health/test-email` | Admin | Send test alert email |

### Clients / Gateways

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/clients` | JWT | List clients with camera counts |
| GET | `/api/clients/stats` | JWT | Aggregated statistics |
| GET | `/api/clients/{id}` | JWT | Client details with cameras |
| POST | `/api/clients` | JWT | Create client |
| PUT | `/api/clients/{id}` | JWT | Update client |
| DELETE | `/api/clients/{id}` | JWT | Soft-delete (marks inactive) |
| PATCH | `/api/clients/{id}/status` | JWT | Set active/inactive/suspended |
| PATCH | `/api/clients/{id}/cloud-storage` | JWT | Toggle cloud recording |
| GET | `/api/admin/clients/{id}/edge-config` | Admin | Download edge config files |

### Cameras

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/cameras` | JWT | All cameras (admin) or own cameras (client) |
| GET | `/api/cameras/{id}` | JWT | Camera details |
| GET | `/api/cameras/{id}/status` | JWT | Online if LastSeen < 90s ago |
| POST | `/api/cameras` | Admin | Create camera |
| PUT | `/api/cameras/{id}` | Admin | Update camera |
| DELETE | `/api/cameras/{id}` | Admin | Delete camera |
| GET | `/api/cameras/{id}/recordings` | JWT | Paginated recording list |

### Streaming

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/admin/stream/{id}/hls` | Admin | HLS playlist proxy (admin, all cameras) |
| GET | `/api/admin/stream/{id}/hls-url` | Admin | Public HLS URL |
| GET | `/api/stream/{cameraId}/hls` | Client | HLS proxy (own cameras only) |
| GET | `/api/stream/{cameraId}/hls/{segment}` | Client | Individual HLS segment |
| GET | `/api/stream/{cameraId}/rtsp` | Client | RTSP URL |
| GET | `/api/stream/{cameraId}/webrtc` | Client | WebRTC URL |

> **JWT in query string:** Video endpoints also accept `?token=<jwt>` because HTML5 `<video src>` cannot send Authorization headers.

### PTZ Control

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/cameras/{id}/ptz/move` | JWT | Pan/Tilt/Zoom via MQTT |
| POST | `/api/cameras/{id}/ptz/stop` | JWT | Stop movement |
| GET | `/api/cameras/{id}/ptz/presets` | JWT | List presets |
| POST | `/api/cameras/{id}/ptz/presets/{pid}/goto` | JWT | Go to preset |

### Recordings

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/recordings/cloud/{cameraId}/dates` | JWT | Available recording dates |
| GET | `/api/recordings/cloud/{cameraId}?date=YYYY-MM-DD` | JWT | Files for a date — shape: `{ date, cameraId, files: [{filename, path, sizeMb, startTime}] }` |
| GET | `/api/recordings/cloud/video?path=...` | JWT | Stream/download recording |
| GET | `/api/recordings/local/{cameraId}?date=...` | JWT | NAS local recordings |
| POST | `/api/recordings/local/{cameraId}/play` | JWT | Start NVR playback relay |
| GET | `/api/recordings/nvr/{cameraId}?date=...` | JWT | NVR recordings |
| GET | `/api/recordings/sd/{cameraId}?start=...&end=...` | JWT | SD card recordings |
| GET | `/api/recordings/sd/video?path=...` | JWT | Stream SD recording |

> Cloud recordings response is wrapped — always use `response.files` to get the array, not the root response object.

### Motors and Telemetry

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/admin/motors` | Admin | List motors with latest telemetry |
| POST | `/api/admin/motors/{id}/command` | Admin | Send command (start/stop/set_speed/emergency_stop) |
| GET | `/api/admin/motors/{id}/telemetry` | Admin | Paginated telemetry history |
| POST | `/api/admin/motors/{id}/arranque6p` | Admin | 6-step startup sequence (PWM 0-255) |
| POST | `/api/admin/motors/{id}/continuo` | Admin | Continuous mode |
| POST | `/api/admin/motors/{id}/paro` | Admin | Normal stop |
| GET | `/api/admin/motors/mqtt/info` | Admin | MQTT broker info |
| GET | `/api/admin/telemetry/stats` | Admin | Global telemetry statistics |
| GET | `/api/admin/telemetry/live` | Admin | Real-time all devices state |
| GET | `/api/admin/telemetry/devices` | Admin | Device list |
| GET | `/api/admin/telemetry/history` | Admin | Historical data (max 30 days, 500 records/page) |

---

## Data Models

### User
```
Id, Email (unique), PasswordHash (BCrypt), Name,
Role ("admin" | "client"), IsActive, LastLogin, CreatedAt, UpdatedAt
```

### Client (Gateway)
```
Id, Name (unique), BusinessType, Rfc, Address, City, State, PostalCode, Country,
ContactName, ContactPhone, ContactEmail,
GatewayId (unique),              -- Edge gateway hardware identifier
UserId (FK -> User),
Status ("active" | "inactive" | "suspended"),
CloudStorageActive, CloudStorageEnabledAt,
LocalStorageType ("nvr" | "dvr" | "sd" | "none"),
NvrIp, NvrUser, NvrPassword, NvrPort, NvrBrand ("hikvision" | "dahua" | "generic"),
Metadata (JSONB), CreatedAt, UpdatedAt
```

### Camera
```
Id, UserId (FK -> User, cascade), Name, Location,
Status ("active" | "offline" | "inactive"),
CameraId (hardware ID), ClientId (FK -> Client, set null),
CameraKey,                       -- Edge gateway reference key
Streams (JSONB: {rtsp, hls, webrtc}),
LastSeen,                        -- Online if < 90 seconds ago
Metadata (JSONB), Ptz (bool),
CreatedAt, UpdatedAt
```

### MotorTelemetry
```
Id, DeviceId, Speed (int), Current (float), Voltage (float),
State ("unknown" | "running" | "stopped" | ...), Timestamp
```

### Recording
```
Id, UserId (FK), CameraId (FK), Path (500 chars),
SizeMb, StartedAt, EndedAt, CreatedAt, UpdatedAt
```

---

## Architecture and Key Patterns

### MQTT Topics

| Topic | Direction | Purpose |
|---|---|---|
| `gateway/{gatewayId}/heartbeat` | Edge to Central | Gateway alive signal |
| `camera/{gatewayId}/{channel}/register` | Edge to Central | Auto-register camera in DB |
| `camera/{gatewayId}/{channel}/status` | Edge to Central | Online/offline update |
| `camera/{gatewayId}/{channel}/events` | Edge to Central | Camera events |
| `motor/{deviceId}/telemetry` | Edge to Central | Motor speed/current/voltage/state |
| `cmd/{gatewayId}/{channel}` | Central to Edge | PTZ/SD/NVR commands |
| `response/{gatewayId}/{requestId}` | Edge to Central | Command responses |

### MQTT Request-Response Pattern
PTZ, SD card, and NVR operations use request/response over MQTT:
1. Backend publishes to `cmd/{gatewayId}/{channel}` with a unique `requestId`
2. Edge device responds on `response/{gatewayId}/{requestId}`
3. `CameraEdgeService` correlates responses via `TaskCompletionSource` with 10s timeout

### Camera Online Detection
A camera is **online** if `LastSeen` is within the last 90 seconds.
`MqttIntegrationService` updates `LastSeen` on every heartbeat and status message.

### Auto-Camera Registration
When an edge gateway sends a `register` MQTT message, `MqttIntegrationService` automatically creates the Camera record in PostgreSQL if it does not exist yet.

### Cloud Recording (FFmpeg)
`StreamRecorderService` runs as a background service:
- Finds cameras where `CloudStorageActive = true`
- Launches FFmpeg to segment RTSP streams into 15-minute MP4 files
- Storage path pattern: `{NasRecordingsPath}/{gatewayId}/{cameraId}/{YYYY-MM-DD}/{HH-MM-SS}.mp4`
- Refreshes the active camera list every 5 minutes (configurable)

### Email Alerts
`ResendEmailService` (Resend.dev) sends alerts on camera online/offline transitions and user invitations. Requires `Email:ResendApiKey` and `Email:AdminAlertEmail` in config.

---

## Frontend Conventions

### Component Architecture
- All components are **standalone** (no NgModules anywhere)
- State uses **Angular signals**: `signal()` for mutable state, `computed()` for derived state
- No centralized state management (no NgRx)
- Most API calls are made with `HttpClient` injected directly in components
- Only `auth.service.ts` is a shared service — everything else is component-local

### Design System (Dark Theme)
All CSS custom properties are in `frontend/src/styles.scss`:

```scss
--bg: #0b1120           /* Page background */
--surface: #1e293b      /* Card background */
--nav: #0f172a          /* Navigation bar */
--ink: #f8fafc          /* Primary text */
--muted: #94a3b8        /* Secondary text */
--accent: #137fec       /* Primary blue */
--teal: #34d399         /* Online / success */
--red: #f87171          /* Offline / error */
--outline: rgba(255,255,255,0.1)
```

Typography: **IBM Plex Sans** (body), **Space Grotesk** (headings)

**Use these utility classes — do not use inline styles:**
- `.topbar` — section header bar (glassmorphism, backdrop blur)
- `.card` — content card with hover lift effect
- `.card.online` — teal left border indicator
- `.card.offline` — red left border indicator
- `.badge.online`, `.badge.offline`, `.badge.active`, `.badge.inactive`, `.badge.suspended`
- `.btn-primary` — filled blue action button
- `.btn-secondary` — ghost/outline button

### Route Overview

```
/                      LandingComponent          (public)
/login                 LoginComponent            (public)
/dashboard             DashboardComponent        [adminAuthGuard]
/gateways              GatewaysComponent         [adminAuthGuard]
/clients               ClientsComponent          [adminAuthGuard]
/clients/:id           ClientDetailComponent     [adminAuthGuard]
/cameras               CamerasComponent          [adminAuthGuard]
/cameras/:id           CameraDetailComponent     [adminAuthGuard]
/recordings/:id        RecordingsComponent       [adminAuthGuard]
/motors                MotorsComponent           [adminAuthGuard]
/users                 UsersComponent            [adminAuthGuard]
/telemetry-history     TelemetryHistoryComponent [adminAuthGuard]
/wizard                WizardComponent           [adminAuthGuard]
/client/login          ClientLoginComponent      (public)
/client/cameras        ClientCamerasComponent    [clientAuthGuard]
/client/cameras/:id    ClientCameraDetailComponent [clientAuthGuard]
/client/recordings/:id ClientRecordingsComponent [clientAuthGuard]
```

`adminAuthGuard` is defined inline in `app.routes.ts`.
`clientAuthGuard` is in `app/guards/client-auth.guard.ts`.

### HLS Video Player
`CameraViewerComponent` wraps HLS.js. Use the appropriate endpoint by role:
- Admin cameras page: `GET /api/admin/stream/{id}/hls`
- Client portal: `GET /api/stream/{cameraId}/hls`
- Always append `?token=<jwt>` — required because `<video src>` cannot send Authorization headers

---

## Infrastructure Details

### Docker Services

| Service | Image | Purpose |
|---|---|---|
| `postgres` | postgres:15-alpine | Primary database |
| `mosquitto` | eclipse-mosquitto:2.0 | MQTT broker |
| `central-mediamtx` | bluenviron/mediamtx:latest | RTSP ingestion + HLS serving |
| `backend` | (built locally) | .NET 8 API + FFmpeg |
| `frontend` | (built locally) | Angular SPA served by Nginx |
| `nginx` | nginx:alpine | Reverse proxy entry point |
| `postgres-backup` | postgres:15-alpine | Daily pg_dump, keeps 7 backups |

### Docker Networks
- `mce-net` — internal bridge for all services
- `shared-edge-network` — **external, must be created manually** before `docker compose up`

```bash
docker network create shared-edge-network
```

### Port Mapping

| Service | Host Port | Container Port | Notes |
|---|---|---|---|
| Nginx | 80, 8080 | 80 | Primary HTTP entry point |
| Nginx | 443 | 443 | HTTPS |
| PostgreSQL | 5433 | 5432 | Direct DB access |
| Mosquitto | 1885 | 1883 | MQTT (edge devices connect here) |
| Mosquitto | 9002 | 9001 | MQTT WebSocket |
| MediaMTX | 8556 | 8554 | RTSP push from edge gateways |

### Nginx Routing
- `/health` — proxied to backend (access log suppressed)
- `/swagger` — proxied to backend Swagger UI
- `/api/*` — proxied to backend
- `/*` — proxied to Angular frontend (SPA catch-all)

---

## Key Files Quick Reference

| File | Purpose |
|---|---|
| `backend/Program.cs` | Service registration and middleware pipeline |
| `backend/appsettings.json` | Non-secret defaults (JWT, MQTT, Email, Storage) |
| `backend/Data/ApplicationDbContext.cs` | EF Core schema, indexes, and relationships |
| `backend/Services/Infrastructure/MqttIntegrationService.cs` | MQTT subscriber — camera and motor event processing |
| `backend/Services/Infrastructure/MqttPublisherService.cs` | MQTT publisher singleton for sending commands |
| `backend/Services/Monitoring/CameraEdgeService.cs` | MQTT request-response for PTZ, SD, NVR |
| `backend/Services/Monitoring/StreamRecorderService.cs` | Cloud recording via FFmpeg |
| `backend/Services/Shared/AdminSeederService.cs` | DB migrations on startup + first admin creation |
| `frontend/src/app/app.routes.ts` | All routes and adminAuthGuard |
| `frontend/src/app/interceptors/auth.interceptor.ts` | JWT injection and 401 logout |
| `frontend/src/styles.scss` | Global CSS variables and component classes |
| `docker-compose.yml` | Complete service orchestration |
| `nginx/nginx.conf` | Reverse proxy configuration |
| `.env.example` | Required environment variable template |

---

## Common Tasks

### Add a new API endpoint
1. Create or edit a controller in `backend/Controllers/`
2. Use `[ApiController]`, `[Route("api/...")]`, and `[Authorize]` / `[Authorize(Roles = "admin")]`
3. Inject `ApplicationDbContext` and/or services via constructor
4. Return `Ok(...)`, `NotFound()`, `BadRequest(...)`, or `StatusCode(503, ...)`

### Add a new Angular page
1. Create a folder under `frontend/src/app/components/`
2. Use the standalone component pattern (no NgModule)
3. Add the route to `frontend/src/app/app.routes.ts` with the appropriate guard
4. Add a nav link in `sidebar.component.ts` for admin-facing pages
5. Use design system classes — no inline styles
6. Use Angular signals for local state (`signal()`, `computed()`)

### Add a new EF Core model
1. Create a `.cs` file in `backend/Models/{Module}/`
2. Add a `DbSet<T>` property to `ApplicationDbContext`
3. Configure relationships and indexes in `OnModelCreating`
4. Run `dotnet ef migrations add <MigrationName>` from `backend/`
5. Run `dotnet ef database update`

---

## Rules for AI Assistants

1. **Never commit `.env` files.** The `.gitignore` excludes `.env` and all `.env.*` variants intentionally.
2. **`TODO.md` and `AI_RULES.md` are gitignored.** They are local-only coordination files for AI agents — do not reference or recreate them in commits.
3. **Cloud recordings response is wrapped.** Always access `response.files` when consuming `/api/recordings/cloud/{id}` — the root response is not an array.
4. **Two stream controllers exist with different scopes:**
   - `/api/admin/stream/` — admin role, all cameras
   - `/api/stream/` — client role, own cameras only
   - Admin pages (like Cameras) must use `/api/admin/stream/`
5. **JWT via query string for video.** Append `?token=<jwt>` to HLS/video URLs since `<video src>` cannot send Authorization headers.
6. **MQTT edge devices connect on host port 1885** (mapped to container port 1883).
7. **`shared-edge-network` must exist** before `docker compose up` — it is declared `external: true` and will fail if absent.
8. **Backend listens on port 8080** inside Docker; Nginx exposes the service on port 80.
9. **Camera online threshold is 90 seconds.** `LastSeen` older than 90 seconds means offline.
10. **Do not use `app-motor-control` or `app-telemetry-dashboard` in the admin dashboard.** These components were removed from the dashboard layout — use the proper card-based layout instead.
11. **Do not add inline styles to Angular templates.** Use the CSS custom properties and utility classes from `styles.scss`.
