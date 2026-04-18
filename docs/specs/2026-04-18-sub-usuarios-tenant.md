# Spec: Sub-usuarios por Tenant
> Estado: DRAFT  
> Fecha: 2026-04-18

## Objetivo
Permitir que un `Client` tenga múltiples usuarios con acceso a sus cámaras y datos, superando la limitación actual de 1 usuario por cliente.

## Fuera de scope
- Roles internos dentro del tenant (todos son "client")
- Permisos granulares por cámara
- Invitación por email a sub-usuarios (fase futura)
- Sub-usuarios pueden gestionar otros sub-usuarios

## Modelo de datos

### Cambio en `User`
```csharp
// Nuevo campo nullable — solo poblado en sub-usuarios
public int? ClientId { get; set; }
public Client? Client { get; set; }
```

### Migración
- `ALTER TABLE users ADD COLUMN client_id INT NULL REFERENCES clients(id) ON DELETE CASCADE`
- Índice único: `(client_id, email)` — evita duplicados dentro del mismo tenant
- Usuarios existentes: `client_id = NULL` (sin cambio de comportamiento)

### Relaciones resultantes
```
User (admin)       → ClientId = null
User (installer)   → ClientId = null
User (client main) → ClientId = null  (vínculo sigue siendo Client.UserId)
User (sub-usuario) → ClientId = N     (nuevo)
```

## Contratos de API

### GET /api/clients/{clientId}/sub-users
- Auth: `admin`
- Response: `[{ id, email, isActive, createdAt }]`

### POST /api/clients/{clientId}/sub-users
- Auth: `admin`
- Body: `{ email, password, mustChangePassword? }`
- Validación: email único en el tenant, Client debe existir
- Response: `201 { id, email, isActive }`

### DELETE /api/clients/{clientId}/sub-users/{userId}
- Auth: `admin`
- Restricción: no puede eliminar el usuario principal del Client (`Client.UserId`)
- Response: `204`

### PATCH /api/clients/{clientId}/sub-users/{userId}/status
- Auth: `admin`
- Body: `{ isActive: bool }`
- Response: `200 { id, isActive }`

## JWT — Opción B (JWT propio por sub-usuario)
- Cada sub-usuario genera su propio JWT con `userId` real + `clientId` del tenant
- Claim `clientId` se agrega al token cuando `user.ClientId != null`
- `LastLogin` y auditoría son independientes por usuario
- Revocación individual: desactivar un sub-usuario invalida solo su acceso
- Endpoints de cámaras/gateways filtran por `clientId` del claim — sin cambio

## Componentes afectados

### Backend
- `Models/Shared/User.cs` — agregar `ClientId?`, navegación `Client`
- `Data/ApplicationDbContext.cs` — configurar relación + índice único
- `Migrations/` — nueva migración
- `Controllers/Auth/AuthController.cs` — agregar `clientId` al JWT claim
- `Controllers/Monitoring/ClientController.cs` — 4 nuevos endpoints sub-users

### Frontend
- `clients/client-detail/` (o equivalente) — nueva sección "Usuarios" con tabla + botones crear/eliminar/toggle activo

## Criterios de aceptación
- [ ] CA1: Admin puede crear un sub-usuario vinculado a un Client específico
- [ ] CA2: El sub-usuario puede hacer login y ve solo las cámaras de su Client
- [ ] CA3: Admin puede listar todos los sub-usuarios de un Client
- [ ] CA4: Admin puede eliminar un sub-usuario (no el usuario principal)
- [ ] CA5: Admin puede activar/desactivar un sub-usuario
- [ ] CA6: No se puede crear dos sub-usuarios con el mismo email en el mismo tenant
- [ ] CA7: Al eliminar un Client, sus sub-usuarios se eliminan en cascada
- [ ] CA8: El JWT de un sub-usuario incluye el claim `clientId`
