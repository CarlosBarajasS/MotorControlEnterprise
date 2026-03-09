# Platform Design Sprint — Design Document

**Fecha:** 2026-03-09
**Sprint:** Platform Completeness v1.0
**Enfoque:** Visual Refresh + Features en paralelo (Enfoque B)
**Autor:** Tech Lead — NIRM GROUP

---

## Contexto

La plataforma MotorControlEnterprise tiene funcionalidad base operativa (streaming HLS,
grabaciones cloud, portal cliente, portal administrador) pero se siente visualmente vacía
y carece de funcionalidades clave para un sistema de monitoreo de seguridad completo.

Este sprint entrega tres módulos en paralelo con visual refresh incluido en cada uno.

---

## Módulos del Sprint (por prioridad)

### Módulo 1 — Sistema de Alertas y Notificaciones

**Objetivo:** Informar al cliente en tiempo real cuando ocurre un evento relevante en sus
cámaras o motores.

#### Canales de entrega

| Canal | Cuándo se usa | Tecnología |
|-------|--------------|------------|
| Web (in-app) | Siempre — todas las severidades | Angular + SSE o polling |
| Email | Severidad Warning y Critical | Resend.dev (ya integrado) |
| WhatsApp | Solo Critical | Meta WhatsApp Business API o Twilio |

#### Severidades

| Nivel | Descripción | Canales |
|-------|-------------|---------|
| **Info** | Cámara reconectada, motor volvió al rango | Web |
| **Warning** | Cámara sin señal > 2 min, motor fuera de rango | Web + Email |
| **Critical** | Cámara offline > 10 min, pérdida total de gateway | Web + Email + WhatsApp |

#### Tipos de alertas (fase 1)

- Cámara desconectada / reconectada
- Gateway offline
- Motor fuera de rango paramétrico (temperatura, RPM, corriente)
- Alerta manual del administrador (broadcast de emergencia)

#### Control de preferencias

- **Cliente:** control total — activa/desactiva canales por tipo de alerta, configura
  número de WhatsApp, configura email de notificación
- **Administrador:** solo lectura — puede ver si un cliente tiene notificaciones activas
  (para soporte). No puede modificar preferencias del cliente.
- **Broadcast de emergencia:** el admin puede enviar un mensaje crítico puntual a todos
  los clientes activos (mantenimiento, aviso de seguridad). No altera preferencias.

#### UI Components necesarios

- `NotificationBellComponent` — campana en navbar con badge de conteo no leídas
- `NotificationDrawerComponent` — panel lateral con historial de alertas
- `AlertPreferencesComponent` — página en portal cliente para configurar preferencias
- `BroadcastModalComponent` — modal en portal admin para enviar mensaje de emergencia
- `NotificationBadgeComponent` — indicador visual reutilizable (dot rojo animado)

#### Backend necesario

- `AlertsController` — CRUD de alertas, marcar como leídas, historial por cliente
- `NotificationPreferencesController` — guardar/obtener preferencias por cliente
- `AlertDispatcherService` — servicio que evalúa eventos MQTT/cámara y genera alertas
- `WhatsAppService` — integración con API de WhatsApp (Twilio o Meta)
- Tabla `Alerts` — id, clientId, cameraId/motorId, severity, type, message, readAt, createdAt
- Tabla `NotificationPreferences` — clientId, channel, alertType, enabled

---

### Módulo 2 — NVR Views Mejoradas (Admin + Cliente)

**Objetivo:** Vista de monitoreo multi-cámara profesional con layouts flexibles,
indicadores de estado en tiempo real y fullscreen por cámara.

#### Layouts disponibles

| Layout | Grid | Uso típico |
|--------|------|-----------|
| 1×1 | 1 cámara | Foco en una sola cámara |
| 2×2 | 4 cámaras | Monitoreo estándar |
| 3×3 | 9 cámaras | Instalaciones medianas |
| 4×4 | 16 cámaras | Instalaciones grandes |

- Layout seleccionado persiste en `localStorage` por usuario
- Si hay menos cámaras que slots, los slots vacíos muestran placeholder

#### Indicadores de estado en cada tile

- Badge **EN VIVO** / **OFFLINE** con color semántico
- Indicador de calidad de señal (basado en latencia de conexión o último heartbeat)
- Timestamp de última actividad detectada
- Nombre de la cámara superpuesto en overlay inferior
- Ícono de grabación activa (si la cámara está grabando)

#### Fullscreen por tile

- Click en ícono expand en cada tile abre la cámara en pantalla completa dentro de la
  misma vista NVR (overlay, no navegación)
- ESC o botón cerrar regresa al grid sin recargar streams

#### Visual Refresh NVR

- Cards de tiles con borde sutil que cambia a color de alerta si cámara offline
- Transición suave al cambiar layout
- Header del NVR con selector de layout (íconos de grid), contador de cámaras online/total
- Skeleton loaders mientras conectan los streams

#### Aplica a

- Portal Admin: `/cameras` (vista NVR del administrador)
- Portal Cliente: `/client/cameras` (vista NVR del cliente)

---

### Módulo 3 — Dashboard con Analítica Real

**Objetivo:** Reemplazar el dashboard vacío del admin con métricas operacionales y de
negocio en tiempo real.

#### Métricas operacionales

- Cámaras online ahora mismo vs total (con porcentaje de uptime)
- Uptime de cámaras últimas 24h y últimos 7 días (sparkline o barra)
- Gateways activos vs total
- Segmentos grabados hoy / esta semana
- Motores en operación normal vs con alertas

#### Métricas de negocio

- Clientes activos vs total registrados
- Cámaras por cliente (top 5 clientes con más cámaras)
- Almacenamiento total usado vs disponible en NAS (barra de progreso)
- Desglose de almacenamiento por cliente

#### UI Components necesarios

- `StatCardComponent` — tarjeta reutilizable: ícono + número grande + label + trend
- `UptimeChartComponent` — sparkline de uptime por cámara o global
- `StorageGaugeComponent` — gauge o barra de uso de almacenamiento
- `TopClientsTableComponent` — tabla simple de top clientes por cámaras/almacenamiento
- `SystemStatusBannerComponent` — banner superior con estado general del sistema

#### Backend necesario

- `DashboardController` — endpoint `/api/dashboard/summary` con todas las métricas
- Queries optimizadas con `AsNoTracking()` y caché de 30s en `IMemoryCache`

---

## Visual Refresh Transversal

Aplicar en todos los módulos como parte del mismo entregable:

### Empty States
Todas las páginas que muestran listas vacías deben tener ilustración o ícono + mensaje
descriptivo + acción sugerida (ej: "No hay cámaras asignadas — Agregar cámara").

### Typography & Spacing
- Jerarquía clara: título de página (24px), subtítulo de sección (16px semibold), body (14px)
- Padding consistente en cards: 20px
- Gap entre cards: 16px

### Status Indicators
- Dot animado (pulse) para elementos online/activos
- Color semántico: verde (#22c55e) = online, rojo (#ef4444) = offline, amarillo (#f59e0b) = warning
- Aplicar en: lista de cámaras, lista de gateways, NVR tiles, sidebar del cliente

### Dark / Light Mode
- Verificar que todos los nuevos componentes respeten las CSS variables existentes
  (`--bg`, `--surface`, `--accent`, `--muted`, etc.)
- Badge EN VIVO debe ser visible en ambos modos (bug conocido en modo claro)

---

## Arquitectura de datos — Nuevas tablas

```sql
-- Alertas generadas por el sistema
CREATE TABLE "Alerts" (
  "Id" SERIAL PRIMARY KEY,
  "ClientId" INTEGER NOT NULL REFERENCES "Clients"("Id"),
  "CameraId" INTEGER REFERENCES "Cameras"("Id"),
  "Severity" VARCHAR(10) NOT NULL,   -- Info | Warning | Critical
  "Type" VARCHAR(50) NOT NULL,        -- camera_offline | motor_out_of_range | broadcast | etc
  "Message" TEXT NOT NULL,
  "ReadAt" TIMESTAMPTZ,
  "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Preferencias de notificación por cliente
CREATE TABLE "NotificationPreferences" (
  "Id" SERIAL PRIMARY KEY,
  "ClientId" INTEGER NOT NULL REFERENCES "Clients"("Id"),
  "AlertType" VARCHAR(50) NOT NULL,   -- camera_offline | motor_out_of_range | all
  "EmailEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "WebEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "WhatsAppEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "WhatsAppPhone" VARCHAR(20),
  "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("ClientId", "AlertType")
);
```

---

## Flujo de datos — Sistema de Alertas

```
Evento MQTT/Cámara
       ↓
AlertDispatcherService
  → evalúa severidad
  → crea registro en Alerts
       ↓
    ┌──────────────────────────────┐
    │  Web (SSE/polling)           │  ← siempre
    │  Email (Resend.dev)          │  ← si Warning o Critical
    │  WhatsApp (Twilio/Meta)      │  ← solo si Critical
    └──────────────────────────────┘
```

---

## Dependencias externas

| Servicio | Para | Estado |
|---------|------|--------|
| Resend.dev | Email de alertas | Ya integrado |
| Twilio o Meta WhatsApp Business API | WhatsApp | Por integrar |

**Decisión sobre WhatsApp API:**
- **Twilio** — fácil integración, precio por mensaje, sin aprobación de cuenta empresarial
- **Meta WhatsApp Business API** — requiere verificación de empresa, más barato a escala
- Recomendación para fase 1: **Twilio** por velocidad de integración

---

## Criterios de aceptación por módulo

### Módulo 1 — Alertas
- [ ] Campana en navbar muestra conteo de no leídas en tiempo real
- [ ] Panel de alertas muestra historial con severidad, timestamp y mensaje
- [ ] Cliente puede activar/desactivar cada canal por tipo de alerta
- [ ] Email se envía dentro de 30s de generada la alerta
- [ ] WhatsApp se envía solo para alertas Critical
- [ ] Admin puede enviar broadcast y llega a todos los clientes activos
- [ ] Admin NO puede modificar preferencias de ningún cliente

### Módulo 2 — NVR
- [ ] Selector de layout (1×1, 2×2, 3×3, 4×4) visible y funcional
- [ ] Layout persiste entre sesiones (localStorage)
- [ ] Cada tile muestra badge EN VIVO / OFFLINE con color correcto
- [ ] Click en expand abre fullscreen overlay sin recargar stream
- [ ] ESC cierra fullscreen y regresa al grid
- [ ] Tiles vacíos muestran placeholder, no error
- [ ] Badge EN VIVO visible en modo claro y oscuro

### Módulo 3 — Dashboard
- [ ] Endpoint `/api/dashboard/summary` responde en < 200ms (caché 30s)
- [ ] Métricas operacionales visibles: cámaras online, gateways, grabaciones
- [ ] Métricas de negocio visibles: clientes, almacenamiento
- [ ] StatCards muestran trend vs día anterior
- [ ] Dashboard no muestra datos vacíos — si no hay datos, muestra estado "sin datos"

---

## Fases de entrega sugeridas

| Fase | Módulos | Descripción |
|------|---------|-------------|
| 1 | Backend Alertas + DB migration | Tablas, endpoints, AlertDispatcher |
| 2 | Frontend Alertas (web only) | Campana, drawer, preferencias cliente |
| 3 | NVR mejorado (admin + cliente) | Layouts, tiles, fullscreen |
| 4 | Dashboard analítica | StatCards, métricas, charts |
| 5 | Email + WhatsApp dispatch | Integración Twilio, templates email |
| 6 | Visual Refresh transversal | Empty states, status dots, polish |

Las fases 1-4 pueden ejecutarse con los recursos actuales (no requieren terceros).
Las fases 5-6 pueden ir en paralelo una vez que 1-4 estén estables.
