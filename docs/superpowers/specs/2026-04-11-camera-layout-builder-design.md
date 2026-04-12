# Camera Layout Builder & Restricted Cameras — Design Spec
**Date:** 2026-04-11  
**Project:** MotorControlEnterprise  
**Scope:** Portal cliente (`/client/*`) únicamente  
**Status:** Aprobado por usuario

---

## 1. Resumen

El portal cliente tendrá un **Layout Builder** que permite al usuario crear, guardar y cambiar entre layouts personalizados de cámaras. Cada layout define el orden, tamaño (colspan/rowspan) y posición de cada cámara en un grid dinámico. Además, el cliente puede marcar cámaras como **restringidas**, que desaparecen del monitor principal y solo son accesibles desde una sección separada "Acceso Privado".

---

## 2. Arquitectura

### 2.1 Subsistemas

| Subsistema | Responsabilidad |
|-----------|----------------|
| Layout Builder | Modo edición sobre el grid — drag & drop, resize por colspan/rowspan |
| Layout Selector | Tabs encima del grid para cambiar entre layouts guardados |
| Fullscreen Mode | Grid 100vw×100vh con controles auto-ocultos |
| Acceso Privado | Sección separada para cámaras restringidas + sus grabaciones |

### 2.2 Flujo de datos

```
Cliente → GET /api/client/layouts       → carga tabs + layout activo
Cliente → PUT /api/client/layouts/:id   → guarda cambios del builder
Cliente → PATCH /api/client/cameras/:id/restricted → toggle restringida
```

---

## 3. Backend

### 3.1 Tabla nueva: `client_layouts`

```sql
CREATE TABLE client_layouts (
  id          SERIAL PRIMARY KEY,
  client_id   INTEGER NOT NULL REFERENCES "Clients"("Id") ON DELETE CASCADE,
  name        VARCHAR(80) NOT NULL,
  config      JSONB NOT NULL DEFAULT '{}',
  is_default  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_client_layouts_client ON client_layouts(client_id);
```

### 3.2 Config JSONB schema

```json
{
  "totalCols": 3,
  "cells": [
    { "cameraId": 260, "col": 1, "row": 1, "colspan": 2, "rowspan": 2 },
    { "cameraId": 261, "col": 3, "row": 1, "colspan": 1, "rowspan": 1 },
    { "cameraId": 262, "col": 3, "row": 2, "colspan": 1, "rowspan": 1 }
  ]
}
```

- `col` / `row`: posición en el grid (1-based)
- `colspan` / `rowspan`: cuántas columnas/filas ocupa (mínimo 1)
- `totalCols`: número de columnas del grid (calculado automáticamente como el colspan máximo alcanzado)
- Cámaras no presentes en `cells` no se muestran en ese layout

### 3.3 Columna nueva en `Cameras`

```sql
ALTER TABLE "Cameras" ADD COLUMN is_client_restricted BOOLEAN NOT NULL DEFAULT false;
```

### 3.4 Endpoints nuevos

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/client/layouts` | Lista todos los layouts del cliente autenticado |
| `POST` | `/api/client/layouts` | Crear layout nuevo |
| `PUT` | `/api/client/layouts/:id` | Actualizar layout (nombre o config) |
| `DELETE` | `/api/client/layouts/:id` | Eliminar layout |
| `PATCH` | `/api/client/cameras/:id/restricted` | Toggle `is_client_restricted` |
| `GET` | `/api/client/private` | Cámaras restringidas del cliente + grabaciones |

**Autorización:** Todos los endpoints verifican que el recurso pertenece al cliente del JWT. Un cliente no puede leer/modificar layouts ni cámaras de otro cliente.

**Regla `is_default`:** Al marcar un layout como default, el backend desactiva el default anterior del mismo cliente en la misma transacción.

---

## 4. Frontend — Layout Builder

### 4.1 Modos del monitor

El componente `ClientCamerasComponent` tiene dos modos controlados por signal `editMode`:

- **Modo Ver (default):** grid normal, tabs de layouts, botón "Editar layout"
- **Modo Editar:** overlay de edición sobre cada celda, panel lateral de cámaras disponibles, botones Guardar/Cancelar

### 4.2 Grid dinámico

- Implementado con CSS Grid nativo: `grid-template-columns: repeat(N, 1fr)`
- `N` = `totalCols` del layout activo (mínimo 2, máximo 6)
- Cada celda usa `grid-column: span colspan` y `grid-row: span rowspan`
- Al hacer resize, `totalCols` se recalcula como `Math.max(...cells.map(c => c.col + c.colspan - 1))`

### 4.3 Drag & Drop

- Implementado con la **HTML5 Drag and Drop API** nativa (sin librerías externas)
- Al arrastrar una cámara sobre otra celda, se intercambian las posiciones
- Las cámaras del panel lateral (no colocadas) también son arrastrables al grid

### 4.4 Resize por colspan/rowspan

- Handle visual en esquina inferior-derecha de cada celda en modo edición
- Al arrastrar el handle horizontalmente → incrementa/decrementa `colspan`
- Al arrastrar verticalmente → incrementa/decrementa `rowspan`
- Mínimo: 1×1. Máximo: no puede sobrepasar `totalCols` ni crear solapamiento
- El grid se reajusta en tiempo real mientras se arrastra

### 4.5 Guardar layout

Al presionar "Guardar":
1. Si es layout nuevo → input de nombre → `POST /api/client/layouts`
2. Si es layout existente → pregunta "¿Sobreescribir o guardar como nuevo?"
3. Si guarda como nuevo → input de nombre
4. Tras guardar → salir de modo edición, activar el layout guardado

### 4.6 Layout Selector (tabs)

```
[+ Nuevo]  [Layout 1 ●]  [Entrada]  [Caja]
```

- Tab con `●` = layout predeterminado
- Click en tab → carga layout instantáneamente (sin reload)
- Menú `⋯` por tab: Renombrar | Poner como predeterminado | Eliminar
- Máximo visual de tabs: 6. Si hay más, scroll horizontal en la fila de tabs
- Al cargar el portal, se activa automáticamente el layout marcado como `is_default`

---

## 5. Frontend — Modo Pantalla Completa

- Botón fullscreen en toolbar del monitor (ícono expand)
- Usa la **Fullscreen API** nativa del navegador (`element.requestFullscreen()`)
- En fullscreen: grid ocupa 100vw × 100vh, fondo negro, sin topbar ni sidebar
- **Auto-hide de controles:**
  - Controles (tabs de layout, botón salir fullscreen) aparecen en overlay superior `rgba(0,0,0,0.55)`
  - Se ocultan tras 2 segundos de inactividad del mouse (transition opacity 0.3s)
  - Reaparecen al mover el mouse, con timer que se reinicia
  - Tecla `Escape` sale del fullscreen (comportamiento nativo del navegador)

---

## 6. Frontend — Cámaras Restringidas

### 6.1 Marcar como restringida

- En modo edición del layout, cada celda tiene toggle 🔒 "Restringida"
- Al activar: `PATCH /api/client/cameras/:id/restricted { restricted: true }`
- La cámara desaparece inmediatamente del grid actual y de todos los layouts normales
- Se agrega a la lista de restringidas en `/client/private`

### 6.2 Sección Acceso Privado

- Nueva entrada en el sidebar del portal: **"Acceso Privado"** (ícono candado)
- Ruta: `/client/private`
- Muestra grid simple (sin builder) con todas las cámaras marcadas como restringidas
- Sub-ruta `/client/private/recordings` — grabaciones de cámaras restringidas únicamente
- Las cámaras restringidas NO aparecen en `/client/cameras` ni en `/client/recordings`

---

## 7. Restricciones y reglas de negocio

- Un cliente solo puede ver/editar sus propios layouts y cámaras
- Si se elimina un layout que era el default, el siguiente en la lista se convierte en default automáticamente
- Si todas las cámaras de un layout se marcan como restringidas, el layout queda vacío (se muestra estado vacío, no error)
- La restricción de cámara es persistente — sobrevive a cambios de layout
- El admin NO puede marcar cámaras como restringidas desde su panel (es decisión exclusiva del cliente)
- Máximo 20 layouts por cliente (límite de BD, validado en backend)

---

## 8. Orden de implementación

1. **Migración BD** — tabla `client_layouts` + columna `is_client_restricted`
2. **Backend** — 6 endpoints nuevos con autorización por cliente
3. **Frontend** — Layout Selector (tabs) + carga de layout desde BD
4. **Frontend** — Grid dinámico con colspan/rowspan
5. **Frontend** — Drag & Drop reordering
6. **Frontend** — Resize handle (colspan/rowspan)
7. **Frontend** — Guardar layout (nuevo y sobreescribir)
8. **Frontend** — Modo fullscreen con auto-hide
9. **Frontend** — Toggle restringida en modo edición
10. **Frontend** — Sección `/client/private` + `/client/private/recordings`
