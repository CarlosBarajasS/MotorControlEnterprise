# Alert System Design — MotorControlEnterprise
**Date:** 2026-03-21
**Scope:** Camera domain (gateways, cameras, NAS storage)
**Status:** Approved

---

## 1. Overview

Event-driven alert system for the NIRM GROUP IoT platform. Designed around real-world enterprise security operations: priority-based, deduplicated, with a clear alert lifecycle and multi-channel delivery.

**Out of scope (this iteration):** Motors domain, WhatsApp/Twilio, SignalR real-time push.

---

## 2. Priority Model

| Level | Numeric | Label | SLA Response | Color |
|-------|---------|-------|-------------|-------|
| P1 | 1 | CRITICAL | 5 minutes | Red (pulsing) |
| P2 | 2 | HIGH | 15 minutes | Orange |
| P3 | 3 | MEDIUM | 1 hour | Yellow |
| P4 | 4 | LOW | Informative | Muted |

Lower numeric value = higher severity. Comparisons use numeric value: P1 (1) < P2 (2) < P3 (3) < P4 (4).

---

## 3. Alert Catalog — Camera Domain

| Event | Entity Type | Priority | Auto-Resolves | Client Visible |
|-------|------------|---------|--------------|----------------|
| Gateway edge disconnected | Gateway | P1 | Yes — on heartbeat received | Yes |
| Camera offline | Camera | P2 | Yes — on camera registration | Yes |
| NAS storage > 90% | Storage | P2 | Yes — when below threshold | No (admin-only) |
| NAS storage > 80% | Storage | P3 | Yes — when below threshold | No (admin-only) |
| Gateway reconnected | Gateway | P4 | No (informative) | Yes |
| Camera reconnected | Camera | P4 | No (informative) | Yes |

**Storage alerts** (`ClientId = null`) are system-wide and only visible to admin/installer roles. Clients never see storage alerts.

---

## 4. Data Model

### Alert Entity

```
Alert {
  Id                int           PK
  Fingerprint       string        Unique key: "{entityType}-{entityId}-{alertType}"
  EntityType        enum          Camera | Gateway | Storage
  EntityId          string        Camera id, gateway id, or "nas"
  AlertType         enum          Offline | Online | GatewayDown | GatewayUp | StorageHigh | StorageCritical
  Priority          enum          P1 | P2 | P3 | P4  (stored as int 1–4)
  Status            enum          Active | Acknowledged | Resolved
  Title             string        Human-readable title
  Message           string        Detail of the event
  ClientId          int?          FK to Client. null = system-wide (storage/infra alerts, admin-only)
  CreatedAt         DateTime      First occurrence
  LastTriggeredAt   DateTime      Updated on every dedup hit (no new alert created)
  AcknowledgedAt    DateTime?     When ACK'd
  AcknowledgedBy    string?       Email of admin who ACK'd
  ResolvedAt        DateTime?     When auto-resolved
}
```

**"Unread" definition:** An alert is unread if `Status = Active`. The unread-count badge shows the count of Active alerts. The badge clears when all Active alerts are either ACK'd or Resolved — NOT when the drawer is merely opened. No additional `IsRead` field is needed.

### AlertPreference Entity (per client)

```
AlertPreference {
  ClientId        int     FK to Client (PK)
  InAppEnabled    bool    Show alerts in drawer (default: true)
  EmailEnabled    bool    Send email notifications (default: true)
  MinPriority     int     Max numeric value to receive, default 3 (P3)
                          A client with MinPriority=3 receives P1, P2, P3 but NOT P4
                          Comparison: alert.Priority.NumericValue <= preference.MinPriority
}
```

**MinPriority comparison rule:** `alert is delivered if alert.Priority (numeric) <= MinPriority (numeric)`. Default MinPriority=3 means the client receives P1(1), P2(2), P3(3) but not P4(4).

---

## 5. Deduplication & Lifecycle

### Fingerprint Rule
```
fingerprint = "{entityType}-{entityId}-{alertType}"
examples:
  "Gateway-edge-gateway-casa-carlos-GatewayDown"
  "Camera-42-Offline"
  "Storage-nas-StorageCritical"
```

### Creation Logic (`TryCreateAsync`)
Complete step-by-step:
1. Query DB: does an alert exist with this fingerprint AND `Status IN (Active, Acknowledged)`?
   - **Yes** → update `LastTriggeredAt` only. Return without creating or emailing.
2. Query DB: does a **Resolved** alert exist with this fingerprint AND `ResolvedAt > now - 5min`? (cooldown check)
   - **Yes** → skip creation entirely. Return without creating or emailing.
3. **No match in steps 1 or 2** → INSERT new alert with `Status = Active`.
4. Dispatch email according to email rules (see Section 6).

### Recovery Logic (`ResolveAsync`)
1. Find existing alert with fingerprint AND `Status IN (Active, Acknowledged)`.
2. If found: set `Status = Resolved`, `ResolvedAt = now`.
3. Create a P4 recovery alert via `TryCreateAsync` (goes through full dedup — prevents duplicate recovery notifications on repeated MQTT heartbeats).

### Cooldown
5 minutes after `ResolvedAt`. Prevents alert flapping from unstable connections.

### Lifecycle State Machine
```
           TryCreateAsync()
                 ↓
             [ ACTIVE ]
            /          \
  Admin ACK()        ResolveAsync()
          ↓                ↓
    [ ACKNOWLEDGED ]   [ RESOLVED ]
          ↓
     ResolveAsync()
          ↓
      [ RESOLVED ]
```

- `ResolveAsync` on an already-Resolved alert: no-op (idempotent).
- `AcknowledgeAsync` on a Resolved alert: returns 409 Conflict.
- `AcknowledgeAsync` on an already-Acknowledged alert: returns 200 (idempotent, updates `AcknowledgedBy` if different admin).

---

## 6. Backend Architecture

### Email Dispatch Rules

**Admin (mandatory):** Always receives email for P1 and P2. No opt-out.

**Client (preference-driven):**
- `EmailEnabled = false` → no email ever
- `EmailEnabled = true` AND `alert.Priority (numeric) <= MinPriority` → send email
- Storage alerts (`ClientId = null`) are never emailed to clients

Subject format: `[P1 CRITICAL] Gateway desconectado — NIRM GROUP`

Example: client with `MinPriority = 3` receives email for P1, P2, P3 alerts on their cameras/gateways.

### New Files

**`backend/Models/Monitoring/Alert.cs`**
EF Core entity matching the data model above.

**`backend/Models/Monitoring/AlertPreference.cs`**
EF Core entity for per-client preferences.

**`backend/Services/Monitoring/AlertService.cs`**
Core alert logic:
- `TryCreateAsync(fingerprint, entityType, entityId, alertType, priority, title, message, clientId)` — full dedup + cooldown + create + email dispatch
- `ResolveAsync(fingerprint)` — auto-resolve + P4 recovery alert via TryCreateAsync
- `AcknowledgeAsync(alertId, adminEmail)` — ACK with idempotency

**`backend/Services/Monitoring/AlertWatchdogService.cs`**
BackgroundService running every 2 minutes. Data sources:
- Camera offline: reads `Camera.LastSeen` column (existing field in `Cameras` table, updated by `MqttIntegrationService` on camera registration). Threshold: `LastSeen < now - 5min`.
- Gateway offline: reads `Client.LastHeartbeat` or equivalent gateway heartbeat timestamp. Threshold: `> 3min` since last heartbeat. *(If no heartbeat timestamp exists on Client, add it as part of this implementation — see Step 1b in Implementation Order.)*
- NAS storage: calls `RecordingController.StorageStats()` logic directly via shared helper.

**`backend/Controllers/Monitoring/AlertController.cs`**
Admin/installer endpoints:
```
GET   /api/alerts
      Query params: status, priority, clientId, page, pageSize
      Response: { total, page, data: Alert[] }

GET   /api/alerts/unread-count
      Response: { count: N }  (count of Active alerts)

PATCH /api/alerts/{id}/acknowledge
      Request body: (none)
      Response:
        200 { id, status, acknowledgedAt, acknowledgedBy }  — success or already-ACK'd
        404  — alert not found
        409  — alert is already Resolved (cannot ACK resolved)
```

### Modified Files

**`backend/Services/Monitoring/MqttIntegrationService.cs`**
- On gateway heartbeat → `AlertService.ResolveAsync("Gateway-{id}-GatewayDown")`
- On camera register → `AlertService.ResolveAsync("Camera-{id}-Offline")`

**`backend/Controllers/Monitoring/ClientProfileController.cs`**
New endpoints:
```
GET   /api/client/me/alerts
      Returns alerts where ClientId = caller's clientId AND Status != Resolved (last 50)
      Only if InAppEnabled = true, else returns empty list
      Response: Alert[]

GET   /api/client/me/alerts/unread-count
      Response: { count: N }  (Active alerts for this client)

GET   /api/client/me/alert-preferences
      Response: AlertPreference

PATCH /api/client/me/alert-preferences
      Body: { inAppEnabled?, emailEnabled?, minPriority? }
      Response: AlertPreference (updated)
      Creates preference record if none exists (upsert)
```

**`backend/Data/ApplicationDbContext.cs`**
Add `DbSet<Alert>` and `DbSet<AlertPreference>`.

**`backend/Program.cs`**
Register services in DI:
```csharp
builder.Services.AddScoped<AlertService>();
builder.Services.AddHostedService<AlertWatchdogService>();
```

**EF Core Migration**
New migration: `AddAlertSystem` — creates:
- `Alerts` table with index on `(Fingerprint, Status)` for fast dedup queries
- `AlertPreferences` table
- If `Client` table lacks a gateway heartbeat timestamp: add `LastHeartbeatAt` column

---

## 7. Frontend Architecture

### Modified Files

**`frontend/.../sidebar/sidebar.component.html/.ts`**
- Bell icon with badge (count of Active alerts)
- Polling every 30s to `/api/alerts/unread-count` via single `setInterval`
- Click toggles the alert drawer open/closed
- Badge is a red circle; disappears when count = 0

**`frontend/.../client-portal/client-shell.component.html/.ts`**
- Same bell + badge for client portal
- Polls `/api/client/me/alerts/unread-count` every 30s
- Only renders bell if `InAppEnabled = true` (checked once on load from preferences endpoint)

**`frontend/.../shared/alert-drawer/alert-drawer.component.ts`** *(new component)*
- Slide-in overlay panel from the right (no route change)
- Fetches full alert list on open; refreshes every 30s while open
- Ordered by: Priority (P1 first) → CreatedAt (newest first)
- Priority chips:
  - P1 → `var(--red)` with pulse animation
  - P2 → `#f97316` (orange)
  - P3 → `#eab308` (yellow)
  - P4 → `var(--muted)`
- ACK button visible only for Active alerts AND admin/installer role
- Resolved alerts shown with "RESUELTO" badge (history, last 20)
- Clients see only their own alerts; admin sees all (same component, different endpoint)

**`frontend/.../client-portal/client-account.component.ts`**
New preferences section:
- Toggle: Notificaciones en app (`InAppEnabled`)
- Toggle: Notificaciones por email (`EmailEnabled`)
- Select: Nivel mínimo (`MinPriority`): P1 / P2 / P3 / P4
- PATCH on change to `/api/client/me/alert-preferences`

### Polling Strategy
Single `setInterval(30_000)` per shell. The drawer does NOT add its own interval — it shares the same signal. When the drawer is open, it refreshes its internal list every 30s using the same tick.

---

## 8. Alert Flow — End to End

### P1: Gateway goes down

```
1. Gateway stops sending MQTT heartbeats
2. AlertWatchdog (every 2 min) detects Client.LastHeartbeatAt > 3 min ago
3. AlertService.TryCreateAsync("Gateway-{id}-GatewayDown", P1, clientId)
   Step 1: no Active/Acknowledged alert → continue
   Step 2: no Resolved within 5min → continue
   Step 3: INSERT new alert (Status=Active)
   Step 4: email admin (mandatory P1) + email client if EmailEnabled & MinPriority >= 1
4. Admin navbar badge: "1" (red)
5. Admin opens drawer → P1 alert with pulsing red chip
6. Admin clicks ACK → PATCH /api/alerts/{id}/acknowledge
   → Status=Acknowledged, AcknowledgedBy="admin@nirm.mx"
7. Gateway reconnects → MQTT heartbeat arrives
8. MqttIntegrationService → AlertService.ResolveAsync("Gateway-{id}-GatewayDown")
   → Existing Acknowledged alert → Status=Resolved, ResolvedAt=now
   → TryCreateAsync("Gateway-{id}-GatewayUp", P4) → INSERT recovery alert
9. Unread-count: 0 Active alerts → badge clears
```

### Dedup scenario: Watchdog fires twice before resolution

```
T+2min: Watchdog → TryCreateAsync → no existing → INSERT, email sent
T+4min: Watchdog → TryCreateAsync → Active alert found → update LastTriggeredAt only
T+4min: MQTT hook also fires ResolveAsync — no-op since alert is still Active? No:
         ResolveAsync checks for Active/Acknowledged → found → Resolve it
         Then TryCreateAsync for P4 GatewayUp recovery
Result: exactly 1 alert created, 1 email sent, no duplicates
```

---

## 9. Security & Access Control

- **Admin / Installer:** sees ALL alerts across all clients via `AlertController`. Cannot opt out of email for P1/P2.
- **Client:** sees only `alerts WHERE ClientId = their clientId` via `ClientProfileController`. Can opt out via preferences.
- `AlertController` protected by `[Authorize(Roles = "admin,installer")]`
- Client endpoints protected by `[Authorize]` + `clientId` extracted from JWT `sub` claim (same pattern as `ClientProfileController`)
- Storage alerts (`ClientId = null`) are only returned by admin endpoints; client endpoint query always filters by `ClientId = callerClientId` which excludes nulls.

---

## 10. Implementation Order

1a. **DB models** — `Alert.cs`, `AlertPreference.cs`
1b. **Check `Client` entity** — add `LastHeartbeatAt DateTime?` if missing; update `MqttIntegrationService` to write it on heartbeat
1c. **EF Core migration** — `AddAlertSystem` (Alerts table, AlertPreferences table, LastHeartbeatAt if needed); index on `(Fingerprint, Status)`
2. **`AlertService`** — core logic (dedup, cooldown, resolve, ACK, email dispatch)
3. **DI registration** — register `AlertService` (scoped) and `AlertWatchdogService` (hosted) in `Program.cs`
4. **Hook `MqttIntegrationService`** — call `ResolveAsync` on heartbeat and camera registration
5. **`AlertWatchdogService`** — detection loop using `AlertService`
6. **`AlertController`** — admin REST endpoints
7. **`ClientProfileController` extensions** — client alert endpoints + preferences
8. **Frontend: bell + badge** — in `sidebar.component` and `client-shell.component`
9. **Frontend: `AlertDrawerComponent`** — slide-in panel
10. **Frontend: client preferences** — section in `client-account.component`
