# ONVIF Auto-Discovery — Design Spec
**Date:** 2026-03-13
**Status:** Approved
**Scope:** motorcontrol-edge-template + MotorControlEnterprise (backend + frontend wizard)

---

## Problem

The current wizard requires the installer to manually find and enter the RTSP URL of each camera (port, path, UUID). This is:
- Error-prone: UUID paths change when ONVIF password changes
- Brand-dependent: each manufacturer uses a different RTSP path format
- Requires SSH access to fix when the URL is wrong
- Not scalable for multi-camera or NVR deployments

Today's real incident: Steren CCTV-238 streams broke silently when the ONVIF password was changed from `admin` to `admin123`, regenerating the UUID path. Fix required manual SSH, Python ONVIF script, DB update, and mediamtx.yml edit.

---

## Goal

Any ONVIF-compatible camera (any brand) gets discovered and configured automatically. The installer only needs: camera IP, ONVIF port, username, and password. Everything else is handled by the system.

---

## Architecture

The Raspberry Pi is the ONVIF discovery agent. It is the only entity on the client's LAN that can reach cameras directly. The central server communicates with the Pi via MQTT (outbound connection, no port forwarding needed).

```
Wizard UI → WizardController → MQTT Broker
                                    ↓ cmd/discover-onvif
                             Raspberry Pi (client LAN)
                                    ↓ ONVIF SOAP
                             Camera (192.168.x.x)
                                    ↓ discovered streams
                             Pi → REST API → Central DB
                                    ↓
                             Wizard polls → shows result
```

### Backward Compatibility

Existing gateways (e.g., edge-gateway-raspberry with hardcoded mediamtx.yml paths) are **not affected**. They continue working exactly as deployed. The new dynamic path approach only applies to gateways created with the updated wizard.

---

## Components

### 1. edge-agent — `OnvifDiscoveryService.js` (NEW)

**Package:** `npm install onvif` — supports Hikvision, Dahua, Axis, Steren, Reolink, Amcrest, Bosch, Hanwha, Uniview, and any ONVIF-compliant device.

**Export pattern:**
```js
// services/OnvifDiscoveryService.js
class OnvifDiscoveryService {
  async scan(ip, port, user, pass) { ... }
  async discoverAll(cameras) { ... }
}
module.exports = new OnvifDiscoveryService();
```

**Diagnostic command (copy-paste ready):**
```bash
docker exec edge-agent node -e \
  "require('./services/OnvifDiscoveryService')
    .scan('192.168.100.45', 8000, 'admin', 'admin123')
    .then(r => console.log(JSON.stringify(r, null, 2)))"
```

**Discovery flow per camera:**
1. Try ONVIF ports in order: `[configuredPort, 80, 8000, 8080, 2020]` — stop at first that responds
2. `GetDeviceInformation` → brand, model, firmware
3. `GetProfiles` → list of available stream profiles
4. `GetStreamUri(profile)` per profile → real RTSP URL (resolves UUIDs automatically)
5. Return: `{ status, brand, model, profiles[], mainStream, subStream }`

If all ports fail: return `{ status: "onvif_failed", triedPorts: [...] }`

**Dual-stream handling:**
- `mainStream` → maps to the live camera record (`cameraKey`)
- `subStream` (if present in profiles) → maps to the recording-only camera record (`cameraKey-low`)
- If no sub stream exists → only update the live camera, leave `-low` record with `status: "onvif_failed"`

**NVR/DVR:** A single `GetProfiles` call to an NVR returns all connected camera channels as separate profiles. Edge-agent matches profiles to camera records by `cameraKey`. Unmatched profiles are ignored (not auto-created).

**Multi-brand ONVIF port reference:**

| Brand | Typical ONVIF Port | Auth | Notes |
|-------|-------------------|------|-------|
| Hikvision | 80 | Digest | Channels/101, /201 per camera |
| Dahua | 80 | Digest | realmonitor?channel=1 |
| Axis | 80 | Basic | Simple RTSP path |
| Steren/Happytimesoft | 8000 | WS-Security | UUID regenerates with password change |
| Reolink | 8000 | Digest | — |
| Amcrest | 80 | Digest | — |
| Generic Chinese | 8000 | WS-Security | — |

---

### 2. edge-agent — Startup discovery flow

On `docker compose up`, before camera monitoring begins:

```
1. GET /api/edge/{gatewayId}/cameras  (auth: X-Edge-Token header)
   ← [{ id, name, cameraKey, ip, onvifPort, onvifUser, onvifPass }]

2. For each camera:
   OnvifDiscoveryService.scan(ip, port, user, pass)

3. For each discovered stream:
   MediamtxManagerService.addPath(cameraKey, rtspUrl)
   POST /v3/config/paths/add/{cameraKey}
   { source: "rtsp://...", sourceProtocol: "tcp" }

4. POST /api/edge/{gatewayId}/cameras/{id}/streams
   { rtsp, centralHls, brand, model, resolution, fps, profiles }
   ← Central updates DB Streams + Metadata

5. CameraMonitorService normal polling begins
```

---

### 3. edge-agent — MQTT command handler

**Subscribe:** `gateway/{CLIENT_ID}/cmd/discover-onvif`

```json
// Inbound payload
{
  "requestId": "uuid-1234",
  "cameras": [
    { "id": 3, "ip": "192.168.100.45", "onvifPort": 8000,
      "user": "admin", "pass": "admin123" }
  ]
}
```

`id` is the integer `Camera.Id` from the database.

Executes discovery → updates MediaMTX paths → calls `POST /api/edge/{gatewayId}/cameras/{id}/streams` for each camera.

No MQTT response topic needed — the wizard polls the REST endpoint for status.

---

### 4. mediamtx.yml — No hardcoded camera paths

Generated by wizard for new gateways. Edge-agent adds paths dynamically via API.

```yaml
# MediaMTX config — gateway: {gatewayId}
# Camera paths managed dynamically by edge-agent via REST API
logLevel: info

api: yes
apiAddress: 0.0.0.0:9997

authInternalUsers:
  - user: edge
    pass: edge123
    permissions:
      - action: api
      - action: read

rtspAuthMethods: [basic]
rtspAddress: :8554
hlsAddress: :8888
webrtcAddress: :8889

pathDefaults:
  record: yes
  recordPath: /recordings/%path/%Y-%m-%d/%H-%M-%S
  recordFormat: fmp4
  recordSegmentDuration: 15m
  runOnReady: >-
    ffmpeg
    -rtsp_transport tcp
    -i rtsp://${MEDIAMTX_USERNAME}:${MEDIAMTX_PASSWORD}@127.0.0.1:8554/$MTX_PATH
    -c copy -f rtsp -rtsp_transport tcp
    rtsp://${MEDIAMTX_PUSH_USER}:${MEDIAMTX_PUSH_PASS}@${CENTRAL_RTSP_HOST}:${CENTRAL_RTSP_PORT}/${GATEWAY_CLIENT_ID}/$MTX_PATH
  runOnReadyRestart: yes

paths:
  all_others: ~
```

**Key fixes vs current template:**
- Removed `-re` flag (caused `bitrate=N/A` — no data transferred to central)
- Added `-rtsp_transport tcp` on input and output (bypasses cloud provider UDP firewall)
- No hardcoded camera paths (edge-agent adds them dynamically via MediaMTX API)

**`centralHls` URL consistency:** The relay command pushes streams to central MediaMTX under path `{GATEWAY_CLIENT_ID}/{cameraKey}` (confirmed by production setup). Therefore `centralHls = "http://central-mediamtx:8888/{gatewayId}/{cameraKey}/index.m3u8"` is correct and consistent with the relay path. This was verified in production on 2026-03-13.

---

### 5. Backend — Edge-agent authentication

**Token provisioning:**
1. Wizard generates a UUID v4 token at client creation time
2. Token stored in `Client.Metadata` JSON: `{ "edgeToken": "uuid-v4" }`
3. Token included in generated `.env`: `CENTRAL_API_TOKEN={token}`
4. Edge-agent sends it as HTTP header: `X-Edge-Token: {token}`

**Validation middleware:** `EdgeTokenAuthMiddleware` queries `Clients` where `Metadata->>'edgeToken' = token`. Applied only to `/api/edge/` routes.

No token rotation in v1 — can be added later via a re-generate button in client settings.

---

### 6. Backend — New endpoints

#### `GET /api/edge/{gatewayId}/cameras`
- Auth: `X-Edge-Token`
- Returns cameras with ONVIF credentials for Pi to discover on startup
- Only returns cameras for the gateway matching `gatewayId` = `Client.GatewayId`
- `cameraId` in response = integer `Camera.Id`

#### `POST /api/edge/{gatewayId}/cameras/{cameraId}/streams`
- Auth: `X-Edge-Token`
- `cameraId` = integer `Camera.Id`
- Body: `{ rtsp, brand, model, resolution, fps, profiles[] }`
- Updates `Camera.Streams` JSON with discovered `rtsp` URL (keeps existing `centralHls`)
- Updates `Camera.Metadata` with `discovery` object
- Sets `discovery.status = "discovered"` or `"onvif_failed"`

#### `POST /api/admin/wizard/trigger-discovery/{gatewayId}`
- Auth: admin JWT
- Sets all pending cameras to `status = "discovering"` in DB (prevents stale `pending` in UI)
- Publishes `gateway/{gatewayId}/cmd/discover-onvif` with all cameras + their ONVIF credentials
- Returns `{ requestId, cameraCount }`

#### `GET /api/admin/wizard/discovery-status/{gatewayId}`
- Auth: admin JWT
- Returns per-camera discovery status from `Camera.Metadata.discovery`
- Response: `{ gatewayOnline: bool, cameras: [{ id, name, status, brand, model, resolution, fps }] }`
- `gatewayOnline` = has received heartbeat in last 60 seconds

---

### 7. Database — Camera Metadata JSON

No new columns. Uses existing `Metadata` JSONB field:

```json
{
  "onvif": {
    "port": 8000,
    "user": "admin",
    "pass": "admin123"
  },
  "discovery": {
    "status": "discovered",
    "brand": "Steren",
    "model": "CCTV-238",
    "resolution": "2304x1296",
    "fps": 20,
    "discoveredAt": "2026-03-13T22:00:00Z"
  }
}
```

**`discovery.status` lifecycle:**
- `pending` — camera saved in wizard, Pi not yet deployed (set by `CameraController.Create`)
- `discovering` — backend published MQTT cmd (set by `trigger-discovery` endpoint)
- `discovered` — Pi reported success (set by `POST .../streams` endpoint)
- `onvif_failed` — Pi tried all ports, none responded (set by `POST .../streams` endpoint)
- `manual` — admin entered RTSP URL manually via UI

**`Camera.Streams` at wizard save time:**
```json
{
  "rtsp": "pending_onvif_discovery",
  "centralHls": "http://central-mediamtx:8888/{gatewayId}/{cameraKey}/index.m3u8"
}
```
`centralHls` is set immediately (path is deterministic from gatewayId + cameraKey).
`rtsp` field is updated by the Pi after discovery.

---

### 8. Wizard UI changes

#### Existing wizard structure (5 steps — unchanged count)

| Step | Current | Change |
|------|---------|--------|
| 1 | Client data | No change |
| 2 | Cameras | RTSP fields → ONVIF fields |
| 3 | Config files | No change |
| 4 | Deploy | Add live discovery status panel |
| 5 | Web access | No change |

#### Step 2 — Camera form: RTSP path → ONVIF credentials

**Fields removed:** `rtspUser`, `rtspPassword`, `rtspPath`
**Fields added:** `onvifPort` (default: 8000, hint: "Común: 80, 8000, 8080, 2020"), `onvifUser`, `onvifPass`
**Fields kept:** `name`, `ip`

**`validateStep2()` change:**
```typescript
// Before: validates cam.rtspPath is not empty
// After: validates cam.ip, cam.onvifUser, cam.onvifPass are not empty
//        onvifPort defaults to 8000 if blank
```

**Dual-camera creation (unchanged logic, new data source):**
- Live camera: `cameraKey = slugify(cam.name)`, uses `mainStream`
- Recording-only camera: `cameraKey = slugify(cam.name) + "-low"`, uses `subStream`
- Both created immediately in DB with `status: "pending"` and `rtsp: "pending_onvif_discovery"`

#### Step 4 — Deploy: live discovery status panel

Polling: `GET /api/admin/wizard/discovery-status/{gatewayId}` every 3 seconds.

**Stop conditions:**
- Stop polling when ALL cameras reach a terminal state: `discovered`, `onvif_failed`, or `manual`
- Maximum polling duration: 5 minutes, then show timeout message
- `[Continuar →]` button enabled when: gateway is online AND all cameras are terminal state (any terminal state counts — installer can fix `onvif_failed` cameras later)

**UI states:**
```
Gateway:  🟡 Esperando conexión...
          🟢 {gatewayName} — conectado

Cameras:
  📷 {name}  ⬜ pending
             🟡 discovering...
             ✅ {brand} {model} · {resolution} · {fps}fps
             ⚠️  ONVIF no respondió  [ver guía]
             ✏️  URL manual configurada
```

#### ONVIF failure UI — integrated step-by-step guide

When `status = "onvif_failed"`, the tile expands automatically with three options:

**Opción 1 — Activar ONVIF en la cámara**
> La mayoría de cámaras tienen ONVIF desactivado por defecto.
> Busca en la app o interfaz web de la cámara:
> Configuración → Red → ONVIF → Activar

Botón: `[🔄 Reintentar descubrimiento]` → calls `trigger-discovery` for this camera only.

**Opción 2 — Ingresar URL RTSP manualmente**

Input field: `rtsp://user:pass@{ip}:554/_______________`

Cheatsheet copiable por marca:
| Marca | Path |
|-------|------|
| Hikvision | `/Streaming/Channels/101` |
| Dahua | `/cam/realmonitor?channel=1&subtype=0` |
| Reolink | `/h264Preview_01_main` |
| TP-Link Tapo | `/stream1` |
| Axis | `/axis-media/media.amp` |
| Steren/Happytimesoft | usar Opción 3 |

Al guardar: sets `status = "manual"`, updates `Camera.Streams.rtsp`, Pi agrega el path a MediaMTX via `POST .../streams`.

**Opción 3 — Diagnóstico desde el Pi (avanzado)**

> Conéctate al Pi por SSH y ejecuta:

```bash
docker exec edge-agent node -e \
  "require('./services/OnvifDiscoveryService')
    .scan('{ip}', {onvifPort}, '{user}', '{pass}')
    .then(r => console.log(JSON.stringify(r, null, 2)))"
```

`[📋 Copiar]` — el comando se pre-llena con los datos de la cámara que falló.

---

### 9. Post-wizard: Re-scan button in client detail page

In `/admin/clients/{id}`, each camera card shows:
- Discovery badge: `✅ Steren CCTV-238 · 3MP` or `⚠️ Manual` or `⏳ Pendiente`
- `[⋯]` menu: **Re-escanear ONVIF** | Editar URL manual | Ver stream

`Re-escanear` calls `trigger-discovery` for that specific camera → Pi runs ONVIF → updates DB → badge refreshes.

**When to re-scan:**
- ONVIF password changed (UUID regenerates — as happened in production 2026-03-13)
- New camera added to existing client
- Camera replaced with different model

---

### 10. .env download fix (Windows)

**Problem:** Windows browsers block download of files starting with `.`

**Fix:** In `wizard.component.ts` `downloadFile()` method, change filename from `.env` to `edge-gateway.env`.

**Step 4 deployment instructions include:**
```bash
mv edge-gateway.env .env
docker compose up -d
docker logs edge-agent -f
```

---

## Implementation Order

1. **Quick fixes** (no risk, independent): `-rtsp_transport tcp` in `BuildMediamtxYml()`, `centralHls` auto-set in `CameraController.Create()`, `.env` rename in `downloadFile()`, edge token generation in wizard
2. **Backend**: `EdgeTokenAuthMiddleware`, 4 new endpoints, `trigger-discovery` sets `discovering` status
3. **edge-agent**: `OnvifDiscoveryService.js`, startup flow, MQTT handler
4. **Wizard UI**: Step 2 ONVIF form + `validateStep2()` update + Step 4 live panel + failure guide
5. **Post-wizard**: Re-scan button in `/admin/clients/{id}` camera cards

---

## Out of Scope (future)

- **Tailscale integration** for remote SSH access to Pi
- **VLAN support** for multi-building installations
- **WS-Discovery** (UDP multicast) for auto-detecting cameras without knowing their IPs
- **Token rotation** for `CENTRAL_API_TOKEN`
- **Camera health alerts** when ONVIF UUID changes unexpectedly
