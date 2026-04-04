# Spec — Landing Hero Animation (Cinematic CCTV)
**Fecha:** 2026-04-04  
**Proyecto:** MotorControlEnterprise — NIRM GROUP  
**Scope:** Landing page hero — animación cinemática alternante con NVR mockup  
**Estado:** Aprobado por usuario

---

## Contexto

El hero de la landing page (`landing.component.html`) tiene actualmente:
- **Izquierda:** texto (h1, subtítulo, CTAs)
- **Derecha:** mockup NVR con 6 slots de cámaras estáticas (`lp-dashboard-mock`)

El objetivo es agregar una animación cinemática estilo CCTV que alterne cíclicamente con el mockup NVR existente, añadiendo dinamismo profesional sin eliminar el mockup actual.

---

## Solución

### Proyecto Remotion (independiente)

**Ruta:** `C:/dev/nirm-hero-video/`  
**Stack:** Remotion 4.x + React + TypeScript  
**Template:** `@remotion/new` (bootstrap estándar)  
**Salida:** `hero-cinematic.mp4` + `hero-cinematic.webm` (1280×720, 30fps, 20s)

#### Estructura del video (600 frames @ 30fps)

| Rango (frames) | Duración | Escena |
|----------------|----------|--------|
| 0–119 | 4s | Corte 1 — CAM 01 · SECTOR A — fade in con scanlines |
| 120–239 | 4s | Corte 2 — CAM 03 · SECTOR B — cut brusco estilo DVR |
| 240–359 | 4s | Corte 3 — CAM 05 · SECTOR C — zoom lento (paneo) |
| 360–479 | 4s | Corte 4 — Split 2×2 todos los sectores (stagger 200ms por celda) |
| 480–599 | 4s | Fade a negro — transición de salida hacia NVR mockup |

#### Composición Remotion

```
nirm-hero-video/
├── src/
│   ├── Root.tsx                  — registro de composición principal
│   ├── HeroCinematic.tsx         — composición raíz (600 frames)
│   ├── scenes/
│   │   ├── SceneSingle.tsx       — cortes 1, 2, 3 (una cámara full)
│   │   ├── SceneGrid.tsx         — corte 4 (split 2×2)
│   │   └── SceneFadeOut.tsx      — fade final a negro
│   └── components/
│       ├── CameraOverlay.tsx     — overlays de datos (label, timestamp, GPS, REC)
│       └── Scanlines.tsx         — efecto CRT/CCTV
├── package.json
└── remotion.config.ts
```

#### Datos de cada escena (SceneSingle)

| Escena | cameraId | sector | coords (ficticias) |
|--------|----------|--------|--------------------|
| 1 | CAM 01 | SECTOR A | 19°25'42"N 99°07'31"W |
| 2 | CAM 03 | SECTOR B | 19°25'39"N 99°07'28"W |
| 3 | CAM 05 | SECTOR C | 19°25'44"N 99°07'35"W |
| 4 | MULTI | ALL | — |

#### Overlays de datos (CameraOverlay)

- **Superior izquierda:** `CAM 0X · SECTOR X` — `IBM Plex Sans 500`, color `#34d399` (teal)
- **Superior derecha:** timestamp `HH:MM:SS:ff` corriendo frame a frame — `IBM Plex Mono`, color `#f4f7fc`
- **Inferior izquierda:** coordenadas GPS ficticias — `IBM Plex Mono 400`, `#8898bc` (muted)
- **Inferior derecha:** badge `● REC` parpadeante (toggle cada 30 frames) — `#f87171` (rojo)
- **Full overlay:** scanlines `rgba(255,255,255,0.03)` animadas verticalmente

#### Transiciones entre cortes

| Transición | Tipo | Descripción |
|------------|------|-------------|
| Corte 1 → 2 | Cut brusco | Frame exacto, sin interpolación — DVR real |
| Corte 2 → 3 | Flash blanco | 2 frames `opacity: 1` blanco — sensor overexposure |
| Corte 3 → 4 | Stagger cells | Cada celda del grid aparece con delay 200ms |
| Corte 4 → fin | Fade a negro | `opacity` 0→1 negro en 30 frames (1s) |

#### Fondo de cada feed

Gradiente radial simulando escena nocturna de vigilancia:
```
background: radial-gradient(ellipse at 30% 40%, #1a2a1a 0%, #0a0f1a 70%, #050810 100%)
```
Con grain sutil via SVG `feTurbulence` filter.

#### Exportación

```bash
# Desde C:/dev/nirm-hero-video/
npx remotion render HeroCinematic hero-cinematic.mp4 --codec=h264
npx remotion render HeroCinematic hero-cinematic.webm --codec=vp8
# Copiar output a:
# C:/dev/MotorControlEnterprise/frontend/src/assets/
```

---

### Integración Angular

**Archivo modificado:** `frontend/src/app/components/landing/landing.component.html` y `.scss` y `.ts`

#### HTML — `lp-hero-right`

El contenedor `.lp-hero-right` se convierte en un contenedor de posicionamiento relativo que superpone dos capas:

```html
<div class="lp-hero-right reveal reveal-delay-2">
  <!-- Capa A: video cinemático -->
  <div class="hero-visual" [class.active]="heroView === 'video'">
    <video class="hero-video" autoplay muted loop playsinline>
      <source src="assets/hero-cinematic.webm" type="video/webm">
      <source src="assets/hero-cinematic.mp4"  type="video/mp4">
    </video>
  </div>
  <!-- Capa B: NVR mockup (existente, sin cambios internos) -->
  <div class="hero-visual" [class.active]="heroView === 'mockup'">
    <div class="lp-dashboard-mock">...</div>
  </div>
</div>
```

#### Lógica Angular (landing.component.ts)

Las duraciones son asimétricas (video: 21s, mockup: 9s), por lo que se usa `setTimeout` recursivo en lugar de `setInterval`.

```typescript
heroView: 'video' | 'mockup' = 'video';
private heroTimeout: ReturnType<typeof setTimeout> | null = null;

private readonly DURATIONS = { video: 21000, mockup: 9000 } as const;

ngOnInit() {
  this.scheduleHeroToggle();
}

private scheduleHeroToggle(): void {
  const duration = this.DURATIONS[this.heroView];
  this.heroTimeout = setTimeout(() => {
    this.heroView = this.heroView === 'video' ? 'mockup' : 'video';
    this.scheduleHeroToggle(); // recursivo
  }, duration);
}

ngOnDestroy() {
  if (this.heroTimeout) clearTimeout(this.heroTimeout);
}
```

#### SCSS

```scss
.lp-hero-right {
  position: relative;
}

.hero-visual {
  position: absolute;
  inset: 0;
  opacity: 0;
  transition: opacity 1s ease;
  pointer-events: none;

  &.active {
    opacity: 1;
    pointer-events: auto;
  }
}

.hero-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 16px; // mismo que lp-dashboard-mock
  border: 1px solid var(--outline);
  box-shadow: var(--shadow);
}

// Mobile: ocultar video para ahorrar ancho de banda
@media (max-width: 768px) {
  .hero-visual:has(.hero-video) {
    display: none;
  }
  // Forzar mockup visible en mobile
  .hero-visual:has(.lp-dashboard-mock) {
    position: relative;
    opacity: 1;
  }
}
```

#### Ciclo de alternancia

| Estado | Duración | Acción |
|--------|----------|--------|
| `video` | 20s (duración del video) | Reproducir cinemático |
| Transición video→mockup | 1s | Crossfade CSS opacity |
| `mockup` | 8s | Mostrar NVR mockup |
| Transición mockup→video | 1s | Crossfade CSS opacity |

---

## Criterios de aceptación

- [ ] Proyecto Remotion construye sin errores en `C:/dev/nirm-hero-video/`
- [ ] Video exportado visible y correcto (overlays, transiciones, scanlines)
- [ ] Video copiado a `frontend/src/assets/`
- [ ] Hero alterna correctamente video ↔ mockup con crossfade de 1s
- [ ] En mobile (<768px) solo se muestra el mockup NVR
- [ ] No hay cambios al layout izquierdo del hero (texto, CTAs)
- [ ] `clearInterval` se ejecuta en `ngOnDestroy` (no hay memory leaks)
- [ ] El video usa el design system de NIRM GROUP (teal, red, muted, IBM Plex)

---

## Archivos afectados

| Archivo | Acción |
|---------|--------|
| `C:/dev/nirm-hero-video/` | Crear — proyecto Remotion nuevo |
| `frontend/src/assets/hero-cinematic.mp4` | Crear — output Remotion |
| `frontend/src/assets/hero-cinematic.webm` | Crear — output Remotion |
| `frontend/src/app/components/landing/landing.component.html` | Modificar — hero-right |
| `frontend/src/app/components/landing/landing.component.ts` | Modificar — alternancia |
| `frontend/src/app/components/landing/landing.component.scss` | Modificar — hero-visual styles |

---

## Fuera de scope

- Cambios al texto del hero (h1, subtítulo, CTAs)
- Portal cliente o admin (specs separados)
- Sonido en el video (siempre `muted`)
- Imágenes reales de cámaras (se usan gradientes procedurales)
