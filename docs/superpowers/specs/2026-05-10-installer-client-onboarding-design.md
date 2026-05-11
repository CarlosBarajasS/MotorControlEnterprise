# Spec: Flujo de Alta de Cliente por Instalador
**Fecha:** 2026-05-10  
**Proyecto:** MotorControlEnterprise  
**Estado:** Aprobado

---

## Problema

El rol `installer` existe en el sistema pero no tiene capacidad de crear clientes ni gestionar accesos. Actualmente solo los admins pueden crear clientes y enviar invitaciones de acceso. Los instaladores necesitan registrar nuevos clientes (con acceso enviado por email) y ver solo sus propios clientes por defecto, con la posibilidad de acceder a clientes de otros instaladores para mantenimiento, bajo auditoría.

El Wizard ya está correctamente separado: solo selecciona clientes existentes y gestiona la instalación (gateways + cámaras). No se toca.

---

## Solución — Opción A: Ownership + Vista global auditada

El instalador es propietario de los clientes que crea. Por defecto ve solo los suyos. Puede ver y actuar sobre clientes ajenos (para mantenimiento), pero toda acción queda registrada. El admin tiene visibilidad total con atribución de instalador.

---

## Modelo de datos

### Cambio en `Client`
Agregar campo `InstallerCreatedById` (FK nullable a `User`):

```csharp
[Column("installer_created_by_id")]
public int? InstallerCreatedById { get; set; }
public User? InstallerCreatedBy { get; set; }
```

- `null` = creado por admin
- `int` = id del instalador que lo creó

### Nueva tabla `AuditLog`

```csharp
public class AuditLog
{
    public int Id { get; set; }
    public int UserId { get; set; }           // Quién actuó
    public User User { get; set; }
    public string Action { get; set; }        // Acción realizada
    public string EntityType { get; set; }    // "Client" | "User" | "Gateway"
    public int? EntityId { get; set; }        // Id de la entidad afectada
    public string? Details { get; set; }      // JSON con contexto extra
    public DateTime CreatedAt { get; set; }
}
```

**Acciones auditadas:**

| Action | Cuándo se registra |
|--------|--------------------|
| `create_client` | Instalador/admin crea cliente |
| `create_client_user` | Se crea acceso de usuario para un cliente |
| `access_foreign_client` | Instalador consulta cliente de otro instalador (`?scope=all`) |
| `modify_foreign_client` | Instalador crea usuario o gateway en cliente ajeno |

---

## API — Cambios y permisos

### `GET /api/clients`
- **Admin:** sin cambios, devuelve todos los clientes con campo `installerCreatedBy: { id, name }`
- **Installer sin `?scope=all`:** filtra por `InstallerCreatedById = userId` (solo propios)
- **Installer con `?scope=all`:** devuelve todos; registra `access_foreign_client` en AuditLog (una entrada por llamada, no por cliente)

### `POST /api/clients`
- Ahora autorizado para `installer` además de `admin`
- Al crear: si caller es installer, guarda `InstallerCreatedById = userId`
- Flujo de creación de usuario + email: sin cambios (usa `userEmail` en body)

### `POST /api/clients/{id}/create-user`
- Ahora autorizado para `installer` además de `admin`
- Si el cliente es de otro instalador: registra `modify_foreign_client` en AuditLog

### `POST /api/clients/{id}/gateways` (o endpoint equivalente del Wizard)
- Si el cliente es de otro instalador y el caller es installer: registra `modify_foreign_client`

### `GET /api/admin/audit-log` *(nuevo)*
- Solo `admin`
- Query params: `?userId=`, `?action=`, `?entityType=`, `?from=`, `?to=`, `?page=`, `?pageSize=`
- Respuesta paginada: `{ items: AuditLog[], total, page, pageSize }`

### Acciones bloqueadas para `installer` en clientes ajenos
- `DELETE /api/clients/{id}` — solo admin o instalador propietario
- `PATCH /api/clients/{id}/status` — solo admin o instalador propietario
- `DELETE /api/clients/{id}/permanent` — solo admin

---

## Frontend Angular

### Sección Clientes — instalador

**Tabs:**
- **"Mis clientes"** (default): `GET /api/clients` (sin `?scope=all`)
- **"Todos"**: `GET /api/clients?scope=all`; clientes ajenos muestran badge `"Instalado por [nombre]"` y ocultan acciones destructivas (eliminar, cambiar estado)

**Formulario de creación:** idéntico al del admin (2 pasos: datos + acceso con email). No hay cambio visual, solo disponible para el rol installer.

**Acciones disponibles para installer en cliente ajeno:**
- Ver detalle ✅
- Crear acceso de usuario ✅ (si no tiene)
- Agregar gateway (via Wizard) ✅
- Eliminar / desactivar ❌ (botones ocultos)

### Sección Clientes — admin

- Tabla de clientes: nueva columna **"Instalador"** (muestra nombre del instalador o "Admin" si `InstallerCreatedById = null`)
- Sin cambios en funcionalidad

### Sección Auditoría — admin *(nueva)*

- Tabla paginada en el panel de admin
- Columnas: Fecha · Usuario · Acción · Entidad · Detalle
- Filtros: por usuario, por acción, por rango de fechas
- Acceso vía ruta `/admin/audit` o tab dentro del panel de administración

### Route guards

- La ruta de Clientes (`/clients` o equivalente) actualmente solo accesible para admin → extender para permitir `installer`
- La ruta de Auditoría → solo `admin`

---

## Restricciones explícitas

- El Wizard **no se toca**: sigue seleccionando clientes existentes, sin cambios en pasos ni lógica
- Configuraciones de cámaras y gateways **no se tocan**: sin cambios en CameraController, GatewayController, MediaMTX ni MQTT
- No se agrega flujo de solicitud/aprobación de acceso: el acceso a clientes ajenos es libre pero auditado

---

## Migración de BD

```sql
-- 1. Columna en Clients
ALTER TABLE "Clients" ADD COLUMN IF NOT EXISTS installer_created_by_id INTEGER REFERENCES "Users"(Id);

-- 2. Tabla AuditLog
CREATE TABLE IF NOT EXISTS "AuditLogs" (
    "Id" SERIAL PRIMARY KEY,
    "UserId" INTEGER NOT NULL REFERENCES "Users"(Id),
    "Action" VARCHAR(50) NOT NULL,
    "EntityType" VARCHAR(30) NOT NULL,
    "EntityId" INTEGER,
    "Details" JSONB,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auditlogs_userid ON "AuditLogs"("UserId");
CREATE INDEX IF NOT EXISTS idx_auditlogs_action ON "AuditLogs"("Action");
CREATE INDEX IF NOT EXISTS idx_auditlogs_createdat ON "AuditLogs"("CreatedAt" DESC);
```

---

## Archivos afectados

### Backend
| Archivo | Cambio |
|---------|--------|
| `Models/Monitoring/Client.cs` | Agregar `InstallerCreatedById` + nav property |
| `Models/Shared/AuditLog.cs` | Nuevo modelo |
| `Data/ApplicationDbContext.cs` | Registrar `AuditLogs` DbSet + configuración |
| `Migrations/` | Nueva migración EF Core |
| `Controllers/Monitoring/ClientController.cs` | Filtro por scope, autorizar installer, registrar auditoría |
| `Controllers/Admin/AuditLogController.cs` | Nuevo controlador GET /api/admin/audit-log |
| `Services/Shared/AuditService.cs` | Nuevo servicio para registrar entradas |

### Frontend
| Archivo | Cambio |
|---------|--------|
| `app/guards/` o `app/app.routes.ts` | Permitir `installer` en ruta Clientes |
| `components/clients/clients.component.ts` | Tabs mis/todos, badge ajeno, ocultar acciones |
| `components/clients/clients.component.html` | UI tabs + badge + condicionales de botones |
| `components/admin-panel/` o nueva ruta | Tabla de auditoría |
| `services/audit.service.ts` | Nuevo servicio Angular para `GET /api/admin/audit-log` |
