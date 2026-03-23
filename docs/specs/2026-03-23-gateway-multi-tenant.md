# Spec: Gateway Multi-Tenant (1:N)
> Estado: DONE
> Fecha: 2026-03-23

## Objetivo
Permitir que un cliente tenga múltiples edge gateways (Raspberry Pi) asociados, cubriendo
escenarios de campus multi-edificio, redes separadas por VLAN, o clientes con sucursales.
El flujo normal (1 gateway por cliente) no cambia — el multi-gateway es un caso especial opt-in.

## Fuera de scope
- UI de gestión de gateways en el frontend de cliente (solo admin por ahora)
- Asignación de cámaras a gateway específico (las cámaras siguen siendo del cliente)
- MQTT multi-gateway (heartbeat y comandos siguen siendo por gatewayId string)
- Deploy/aprovisionamiento automático de nuevos RPis

## Contratos de API

### Gateway CRUD
```
GET    /api/gateways                    → GatewayDto[]         [admin]
GET    /api/gateways/{id}               → GatewayDto           [admin]
GET    /api/clients/{clientId}/gateways → GatewayDto[]         [admin, installer]
POST   /api/gateways                    ← GatewayCreateDto     [admin]
PUT    /api/gateways/{id}               ← GatewayUpdateDto     [admin]
DELETE /api/gateways/{id}                                      [admin]
```

### DTOs
```
GatewayDto {
  id: int
  gatewayId: string          // identificador del RPi (MAC o serial)
  name: string               // "Gateway Edificio A"
  location: string?          // "Piso 2, Sala Servidores"
  clientId: int
  clientName: string
  status: string             // "active" | "offline" | "inactive"
  lastHeartbeatAt: DateTime?
  createdAt: DateTime
}

GatewayCreateDto {
  gatewayId: string          // UNIQUE global
  name: string
  location: string?
  clientId: int
  edgeToken: string          // token que usara el RPi para autenticarse
}

GatewayUpdateDto {
  name: string?
  location: string?
  status: string?
}
```

### Edge endpoints (sin cambio de ruta)
```
POST /api/edge/{gatewayId}/heartbeat    — sigue igual, actualiza Gateway.LastHeartbeatAt
GET  /api/edge/{gatewayId}/cameras      — busca gateway en tabla Gateways (no Clients)
POST /api/edge/{gatewayId}/cameras/{id}/streams — igual
```

## Modelo de datos

### Nueva tabla: Gateways
```
Id              int          PK, identity
ClientId        int          FK → Clients.Id CASCADE DELETE
GatewayId       varchar(150) UNIQUE NOT NULL   (id del RPi)
Name            varchar(255) NOT NULL
Location        text         NULL
Status          varchar(20)  NOT NULL DEFAULT 'active'
Metadata        jsonb        NULL     { "edgeToken": "...", "ip": "..." }
CreatedAt       timestamptz  NOT NULL
UpdatedAt       timestamptz  NOT NULL
LastHeartbeatAt timestamptz  NULL
```

### Modificacion tabla Clients
```
QUITAR: gateway_id varchar(150) UNIQUE
QUITAR: last_heartbeat_at timestamptz  (se mueve a Gateways)
```

### Data migration (en la misma migracion EF)
```sql
INSERT INTO "Gateways" ("ClientId", "GatewayId", "Name", "Status", "Metadata",
                         "CreatedAt", "UpdatedAt", "LastHeartbeatAt")
SELECT "Id", "GatewayId", "Name" || ' - Gateway', 'active',
       "Metadata", NOW(), NOW(), "LastHeartbeatAt"
FROM "Clients"
WHERE "GatewayId" IS NOT NULL;
```

## Componentes afectados

### Backend
- `Models/Monitoring/Gateway.cs`              — CREAR entidad
- `Models/Monitoring/Client.cs`               — quitar GatewayId y LastHeartbeatAt, agregar Gateways nav
- `Data/ApplicationDbContext.cs`              — DbSet<Gateway>, fluent config
- `Controllers/Monitoring/GatewayController.cs` — CREAR (CRUD)
- `Controllers/Edge/EdgeCameraController.cs`  — validar contra tabla Gateways
- `Controllers/Monitoring/CameraController.cs` — GatewayId en DTOs desde Gateways nav
- `Middleware/EdgeTokenAuthMiddleware.cs`      — buscar edgeToken en Gateways.Metadata
- `Migrations/`                               — nueva migracion + data migration

### Frontend
- `components/gateways/gateway-modal.component.ts`  — CREAR modal reutilizable de alta/edicion
- `components/gateways/gateways.component.ts`       — GET /api/gateways, conectar modal
- `components/gateways/gateways.component.html`     — titulo amigable (name), subtitulo con clientName
- `components/clients/clients.component.ts`         — cargar gateways por cliente, abrir modal
- `components/clients/clients.component.html`       — reemplazar info-row gateway → seccion chips
- `components/clients/clients.component.scss`       — estilos gateway-section, chip rows, boton dashed

### UX Handoff
- `.agents/handoffs/2026-03-23-UX-to-FE-gateway-multi.md` — wireframes y variables CSS

## Criterios de aceptacion

- [ ] CA1: Un cliente puede tener 0, 1 o N gateways registrados en tabla Gateways
- [ ] CA2: Alta de cliente funciona igual — sin campo gatewayId en el form
- [ ] CA3: RPi existente con token valido sigue autenticandose sin reconfigurar
- [ ] CA4: GET /api/clients/{id}/gateways devuelve lista correcta
- [ ] CA5: Heartbeat de RPi actualiza Gateway.LastHeartbeatAt (no Client)
- [ ] CA6: GET /api/gateways lista todos con clientName incluido
- [ ] CA7: Frontend Gateways muestra datos reales desde /api/gateways
- [ ] CA8: Frontend Clients muestra gateways asociados por cliente
- [ ] CA9: dotnet build sin errores tras migracion
- [ ] CA10: Data migration preserva gateways existentes sin perdida de datos
- [ ] CA11: Tarjeta de cliente muestra chips de gateways con dot verde/rojo (no MAC raw)
- [ ] CA12: Boton "+ Agregar punto" abre modal pre-filtrado al cliente correcto
- [ ] CA13: Modal de gateway tiene tooltip en ID del dispositivo y Token de acceso
- [ ] CA14: Pantalla Gateways muestra nombre amigable como titulo (no el gatewayId tecnico)
- [ ] CA15: Chips y modal se ven correctos en modo claro Y oscuro
