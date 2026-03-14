# Spec: Cámaras IP — Rediseño NVR con Agrupación por Cliente

**Fecha:** 2026-03-14
**Estado:** Aprobado por usuario
**Scope:** `frontend/src/app/components/cameras/`

---

## Objetivo

Reemplazar la vista plana de tarjetas de cámara por una navegación de dos niveles:
1. **Nivel 1 `/cameras`** — Grid de clientes (tarjetas minimalistas)
2. **Nivel 2 `/cameras/client/:clientId`** — Vista NVR profesional con todas las cámaras del cliente

---

## Nivel 1 — Pantalla de Clientes (`/cameras`)

### Comportamiento
- Reemplaza el grid de cámaras actual por un grid de tarjetas de cliente
- Botón `+ Añadir Cámara` permanece en el topbar (abre el modal existente — conservar toda la lógica modal: `showModal`, `modalMode`, `currentCamera`, `openCreate`, `openEdit`, `saveCamera`, `deleteCamera`)
- Campo de búsqueda filtra tarjetas por nombre de cliente en tiempo real

### Estado del componente — `cameras.component.ts`

Señales que **se eliminan**: `filterStatus`, `filterGateway`, `gridCols`, `filtered`, `camerasOnline`.
Señales que **se conservan/adaptan**: `cameras`, `clients`, `searchTerm` (ahora filtra clientes, no cámaras), todas las señales y métodos de modal.

Nueva propiedad computada principal:

```typescript
clientCards = computed(() => {
  const q = this.searchTerm().toLowerCase();
  return this.clients()
    .map(client => {
      const cams = this.cameras().filter(c => c.clientId === client.id);
      const online = cams.filter(c => this.isOnline(c)).length;
      return { id: client.id, name: client.name, total: cams.length, online, offline: cams.length - online };
    })
    .filter(c => !q || c.name.toLowerCase().includes(q));
});
```

Tipo de cada elemento: `{ id: number, name: string, total: number, online: number, offline: number }`.
Eliminar `CameraViewerComponent` del `imports` array y del import statement — no se renderizan streams en Nivel 1.
`isOnline` usa el mismo umbral de 90 segundos que `ClientNvrComponent` para consistencia entre ambos niveles.

### Tarjeta de Cliente
Cada tarjeta muestra:
- Icono 🏢 + nombre del cliente
- Contador de cámaras online en verde (`var(--green)`) y offline en rojo (`var(--red)`)
- Total de cámaras con icono 📹
- Botón "Ver NVR →" — deshabilitado si el cliente no tiene cámaras
- Borde izquierdo: `var(--green)` si todas online · `var(--red)` si alguna offline · `var(--outline)` si sin cámaras

### Estilos — tema claro/oscuro
- Fondo tarjeta: `var(--surface)` con `border: 1px solid var(--outline)` — NO usar semi-transparente para garantizar contraste en modo claro
- Texto principal: `var(--ink)`
- Texto secundario: `var(--muted)`
- Hover: `background: rgba(var(--ink-rgb), 0.03)`
- NO usar `rgba(var(--nav-rgb), ...)` para fondos — se vuelve blanco en light mode

### Estados
- **Cargando:** Mostrar 3 skeleton cards (rectángulos con `background: rgba(var(--ink-rgb), 0.06)`, animación `pulse`)
- **Sin clientes:** Mensaje centrado con icono 🏢, texto `var(--muted)`: "No hay clientes registrados"
- **Error HTTP:** Banner con `background: rgba(var(--red-rgb), 0.1)`, borde `var(--red)`, mensaje y botón "Reintentar"
- **Sin resultados de búsqueda:** Mensaje "No hay clientes que coincidan con la búsqueda"

---

## Nivel 2 — Vista NVR (`/cameras/client/:clientId`)

### Ruta
`/cameras/client/:clientId` — componente nuevo: `client-nvr.component` (standalone)

### Dependencias inyectadas — `ClientNvrComponent`

```typescript
route  = inject(ActivatedRoute); // leer :clientId del paramMap
http   = inject(HttpClient);     // GET /api/cameras
router = inject(Router);         // goToDetail + navegación ← Clientes
```

### Grid automático

| N° cámaras | CSS Grid |
|------------|---------|
| 1          | `grid-template-columns: 1fr` (max-width 900px, centrado) |
| 2          | `grid-template-columns: repeat(2, 1fr)` |
| 3–4        | `grid-template-columns: repeat(2, 1fr)` |
| 5–6        | `grid-template-columns: repeat(3, 1fr)` |
| 7–9        | `grid-template-columns: repeat(3, 1fr)` |
| 10+        | `grid-template-columns: repeat(4, 1fr)` |

El grid ocupa `height: calc(100vh - 56px)` (restando topbar). Cada celda usa `aspect-ratio: 16/9`.

### Modificación a `CameraViewerComponent`
El viewer muestra internamente un badge `LIVE` en `.overlay-controls`. Para evitar colisión visual con los overlays del NVR, se añade un input opcional:

```typescript
@Input() hideOverlay = false;
```

En el template, el `div.overlay-controls` se condiciona: `*ngIf="!isLoading && !hasError && !hideOverlay"`.
Uso normal (sin cambio): `hideOverlay` no se pasa → badge LIVE visible.
Uso NVR: `[hideOverlay]="true"` → badge interno suprimido, NVR provee sus propios overlays.

### Celda NVR — arquitectura de overlays
Cada celda es un `div.nvr-cell` con `position: relative`:

```html
<div class="nvr-cell" #cell (click)="goToDetail(cam.id)">
  <app-camera-viewer [streamUrl]="getHlsUrl(cam)" [hideOverlay]="true" />
  <!-- overlays son hermanos del viewer, NO inputs del componente -->
  <div class="nvr-overlay">
    <div class="nvr-badge-top">
      <span class="live-dot" [class.online]="isOnline(cam)"></span>
      {{ isOnline(cam) ? 'EN VIVO' : 'OFFLINE' }}
    </div>
    <div class="nvr-cam-name">{{ cam.name }}</div>
    <button class="nvr-fullscreen-btn" (click)="toggleFullscreen($event, cell)">⛶</button>
  </div>
</div>
```

Los overlays son `position: absolute` sobre el viewer. El overlay base es `opacity: 0` en reposo y `opacity: 1` en hover (`.nvr-cell:hover .nvr-overlay`). Los badges de estado son siempre visibles.

**Estilos de overlay — SIEMPRE oscuro independiente del tema:**
- Badge EN VIVO / OFFLINE: `background: rgba(0,0,0,0.55)`, `color: #fff`
- Nombre de cámara: `background: rgba(0,0,0,0.45)`, `color: #fff`
- NO usar variables CSS de tema en overlays de video

### Obtención de URL HLS — `getHlsUrl(cam)`
El campo `streams` de `GET /api/cameras` es una cadena JSON (`"{"rtsp":"...","hls":"...","centralHls":"...","webrtc":"..."}`), no un objeto. El componente debe parsear:

```typescript
getHlsUrl(cam: any): string {
  try {
    const s = JSON.parse(cam.streams ?? '{}');
    return s.centralHls ?? s.hls ?? '';
  } catch {
    return '';
  }
}
```

Se prefiere `centralHls` (stream MediaMTX central) sobre `hls` (stream edge directo). Si ambos fallan, retornar cadena vacía; el viewer mostrará su estado de error.

### Filtrado de cámaras por clientId
El parámetro de ruta `:clientId` llega como `string`. Las cámaras tienen `clientId: number`. Usar coerción numérica al filtrar:

```typescript
const id = +this.route.snapshot.paramMap.get('clientId')!;
this.cameras = allCameras.filter(c => c.clientId === id);
```

### Detección de estado EN VIVO / OFFLINE
Usa el campo `lastSeen` del response de `GET /api/cameras` (ya disponible en el bulk call). `lastSeen` es una cadena ISO 8601. Criterio:

```typescript
isOnline(cam: any): boolean {
  return !!cam.lastSeen && (Date.now() - new Date(cam.lastSeen).getTime()) < 90_000;
}
```

(90 segundos de margen para tolerar el ciclo de heartbeat del edge-agent). No se hacen llamadas individuales por cámara para evitar N requests concurrentes.

### Navegación y Fullscreen — métodos del componente

```typescript
goToDetail(id: number) {
  this.router.navigate(['/cameras', id]);
}

toggleFullscreen(event: MouseEvent, cell: HTMLDivElement) {
  event.stopPropagation(); // evita disparar goToDetail del padre
  cell.requestFullscreen().catch(() => {}); // silenciar en contextos sin fullscreen
}
```

- `#cell` en la plantilla es una `HTMLDivElement` reference — en el template se pasa directamente: `(click)="toggleFullscreen($event, cell)"` donde `#cell` está en el `div.nvr-cell`.
- ESC cierra fullscreen natively (el browser lo maneja).
- El stream NO se recarga al entrar/salir de fullscreen.

### Topbar NVR
```
[← Clientes]   Casa Carlos   [● 1 EN VIVO  ○ 0 Offline]   [+ Añadir Cámara]
```
- `← Clientes` navega a `/cameras` con `router.navigate(['/cameras'])`
- Badge de estado: `var(--green)` / `var(--red)` / `var(--muted)`
- Fondo topbar: `var(--surface)` con `border-bottom: 1px solid var(--outline)`

### Estados
- **Cargando:** 4 skeleton cells en grid 2×2, fondo `rgba(var(--ink-rgb), 0.06)`, `aspect-ratio: 16/9`, animación `pulse`
- **Sin cámaras:** Mensaje centrado "Este cliente no tiene cámaras configuradas" con botón "Añadir Cámara"
- **Error HTTP:** Banner rojo con "Error al cargar cámaras" y botón "Reintentar"
- **Cliente no encontrado (404):** Mensaje "Cliente no encontrado" con botón "← Volver"

---

## Rutas Angular

```typescript
{ path: 'cameras',                   component: CamerasComponent,   canActivate: [adminAuthGuard] },
{ path: 'cameras/client/:clientId',  component: ClientNvrComponent, canActivate: [adminAuthGuard] },
{ path: 'cameras/:id',               component: CameraDetailComponent, canActivate: [adminAuthGuard] },
```

**Notas:**
- **Orden crítico:** `cameras/client/:clientId` y `cameras/:id` tienen ambas **2 segmentos** — Angular usa first-match-wins. Declarar `cameras/client/:clientId` **antes** de `cameras/:id`; si se invierte, `/cameras/client/5` matchea `cameras/:id` con `id='client'`.
- `adminAuthGuard` es un `const` inline en `app.routes.ts` (no es un símbolo exportado ni importable). Las nuevas rutas deben añadirse dentro del mismo archivo `app.routes.ts` donde está declarado, sin import statement del guard.
- Añadir import del componente en `app.routes.ts`: `import { ClientNvrComponent } from './components/cameras/client-nvr.component';`
- Insertar antes del catch-all `{ path: '**', redirectTo: 'login' }` en `app.routes.ts`

---

## Archivos a crear/modificar

| Archivo | Acción |
|---------|--------|
| `camera-viewer/camera-viewer.component.ts` | Modificar — añadir `@Input() hideOverlay = false;` a la clase |
| `camera-viewer/camera-viewer.component.html` | Modificar — cambiar condición `.overlay-controls` a `*ngIf="!isLoading && !hasError && !hideOverlay"` |
| `cameras/cameras.component.ts` | Modificar — añadir `clientCards` computed, eliminar `filterStatus`/`filterGateway`/`gridCols`/`filtered`/`camerasOnline`, actualizar `isOnline` threshold a `< 90_000`, conservar modal, eliminar `CameraViewerComponent` del import |
| `cameras/cameras.component.html` | Reescribir — grid de clientes con estados |
| `cameras/cameras.component.scss` | Reescribir — estilos tarjetas cliente, skeleton, error |
| `cameras/client-nvr.component.ts` | **Crear** — standalone, `imports: [CommonModule, RouterModule, CameraViewerComponent]`, carga cámaras del cliente, calcula grid, fullscreen |
| `cameras/client-nvr.component.html` | **Crear** — grid NVR con celdas y overlays |
| `cameras/client-nvr.component.scss` | **Crear** — estilos NVR: celdas, overlays, badges |
| `app.routes.ts` | Modificar — añadir ruta `cameras/client/:clientId` (inline, no import de guard) |

---

## Datos — endpoints existentes (sin cambios)

- `GET /api/cameras` → array de cámaras con `clientId`, `lastSeen`, `streams` (cadena JSON con campos `rtsp`, `hls`, `centralHls`, `webrtc`)
- `GET /api/clients` → array de clientes con `id`, `name`
- No se requieren endpoints nuevos

---

## Restricciones absolutas

- Variables CSS: `--ink`, `--ink-rgb`, `--surface`, `--muted`, `--accent`, `--green`, `--green-rgb`, `--red`, `--red-rgb`, `--outline` (excluir `--nav-rgb` — se vuelve blanco en light mode)
- Overlays sobre video: SIEMPRE `rgba(0,0,0,N)` — NUNCA variables de tema
- Componentes: SIEMPRE `standalone: true` con imports explícitos
- URL base: SIEMPRE `const API_URL = '/api'`
- No añadir dependencias npm
- No modificar `auth.interceptor.ts`
