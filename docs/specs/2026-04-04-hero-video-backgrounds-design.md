# Spec — Hero Video Backgrounds (Footage Real CCTV)
**Fecha:** 2026-04-04
**Proyecto:** MotorControlEnterprise — NIRM GROUP
**Scope:** Reemplazar fondos de gradiente en `nirm-hero-video` con clips de video reales estilo CCTV moderno HD
**Estado:** Aprobado por usuario

---

## Contexto

El proyecto Remotion `C:/dev/nirm-hero-video/` actualmente usa gradientes CSS oscuros como fondos de cada escena. El usuario solicitó reemplazarlos con clips cortos de stock libre (Pexels) que simulen footage real de cámaras de vigilancia residencial, con estética moderna HD.

El video final se re-exporta como `hero-cinematic.mp4` y `hero-cinematic.webm` y se copia a `frontend/src/assets/` del proyecto Angular.

---

## Tema: Casa residencial

4 escenas con ángulos de cámara CCTV típicos de una propiedad residencial:

| Escena Remotion | Cámara | Ubicación | Búsqueda Pexels |
|----------------|--------|-----------|-----------------|
| SceneSingle 1 (frames 0-119) | CAM 01 · SECTOR A | Calle frontal | `residential street security camera` |
| SceneSingle 2 (frames 120-239) | CAM 03 · SECTOR B | Entrada cochera | `driveway home security` |
| SceneSingle 3 (frames 240-359) | CAM 05 · SECTOR C | Puerta principal | `front door entrance security` |
| SceneGrid cells (frames 360-599) | CAM 01/03/05/07 | Todas las vistas | clips anteriores + `backyard outdoor security` |

---

## Nota futura: Tema Fábrica

Para una segunda versión del video (intercalable con el de casa):
- CAM 01 → Entrada de planta / portón industrial
- CAM 03 → Zona de carga y descarga
- CAM 05 → Pasillo interior de producción
- CAM 07 → Patio exterior / estacionamiento de empleados

Búsquedas Pexels sugeridas: `factory entrance security`, `warehouse loading dock`, `industrial corridor security`, `factory parking lot`

Implementar cuando el usuario lo solicite como un segundo set de assets.

---

## Solución

### Parte 1: Script de descarga — `scripts/download-footage.mjs`

**Ubicación:** `C:/dev/nirm-hero-video/scripts/download-footage.mjs`

**Configuración:** La API key se lee de `.env` como `PEXELS_API_KEY`. El archivo `.env` va en `.gitignore` (ya incluido por defecto en el template).

**Lógica:**
1. Para cada escena, hace `GET https://api.pexels.com/videos/search?query=<búsqueda>&per_page=15&orientation=landscape`
2. Filtra resultados: duración 8-20s, ancho ≥ 1280px
3. Selecciona el primer resultado válido
4. Descarga el archivo de video en calidad HD (`hd` o `sd` si hd no existe)
5. Guarda en `public/footage/house/<nombre>.mp4`

**Estructura de destino:**
```
C:/dev/nirm-hero-video/
├── public/
│   └── footage/
│       └── house/
│           ├── street.mp4       ← CAM 01 / SECTOR A
│           ├── driveway.mp4     ← CAM 03 / SECTOR B
│           ├── frontdoor.mp4    ← CAM 05 / SECTOR C
│           └── backyard.mp4     ← CAM 07 / SECTOR D
├── scripts/
│   └── download-footage.mjs
└── .env                         ← PEXELS_API_KEY=xxx (no commitear)
```

**Dependencias:** Node.js nativo (`fetch` disponible en Node 18+). Sin dependencias npm adicionales.

**Uso:**
```bash
cd C:/dev/nirm-hero-video
node scripts/download-footage.mjs
```

---

### Parte 2: Modificaciones Remotion

#### `src/scenes/SceneSingle.tsx`

Agregar prop opcional `videoSrc?: string` a `SceneSingleProps`.

Lógica de renderizado del fondo:
- Si `videoSrc` presente → `<Video src={staticFile(videoSrc)} startFrom={randomOffset} />` con CSS filter
- Si `videoSrc` ausente → div con gradiente (backward compatible)

CSS filter para estética CCTV moderna HD:
```
filter: contrast(1.05) saturate(0.9) brightness(0.85)
```

El `startFrom` usa un mapa fijo por `cameraId` para ser determinístico (Remotion lo requiere): `{ 'CAM 01': 0, 'CAM 03': 45, 'CAM 05': 90, 'CAM 07': 30 }`.

Capas en orden (de fondo a frente):
1. Video (o gradiente fallback)
2. Vignette div
3. `<Scanlines />`
4. `<CameraOverlay />`

#### `src/scenes/SceneGrid.tsx`

Agregar `videoSrc?: string` a la definición de `CELLS`:

```typescript
const CELLS = [
  { cameraId: 'CAM 01', ..., videoSrc: 'footage/house/street.mp4' },
  { cameraId: 'CAM 03', ..., videoSrc: 'footage/house/driveway.mp4' },
  { cameraId: 'CAM 05', ..., videoSrc: 'footage/house/frontdoor.mp4' },
  { cameraId: 'CAM 07', ..., videoSrc: 'footage/house/backyard.mp4' },
];
```

Mismo renderizado: `<Video>` con filter en lugar del div de gradiente cuando `videoSrc` está presente.

#### `src/HeroCinematic.tsx`

Agregar `videoSrc` a cada `<SceneSingle>`:

```tsx
<SceneSingle
  cameraId="CAM 01"
  sector="SECTOR A"
  coords="..."
  frameOffset={0}
  gradient={G_A}          // mantener como fallback
  videoSrc="footage/house/street.mp4"
  fadeIn
/>
```

Los gradientes `G_A`, `G_B`, `G_C` se mantienen como fallback cuando el video no carga.

---

### Parte 3: Re-exportar video

Tras descargar assets y actualizar componentes:

```bash
cd C:/dev/nirm-hero-video
npx remotion render HeroCinematic out/hero-cinematic.mp4 --codec=h264
npx remotion render HeroCinematic out/hero-cinematic.webm --codec=vp8
```

Luego copiar a Angular:
```bash
cp out/hero-cinematic.mp4  C:/dev/MotorControlEnterprise/frontend/src/assets/hero-cinematic.mp4
cp out/hero-cinematic.webm C:/dev/MotorControlEnterprise/frontend/src/assets/hero-cinematic.webm
```

Y hacer commit + push + deploy.

---

## Consideraciones técnicas

### Determinismo en Remotion
`<Video startFrom={N}>` donde N debe ser un valor fijo, no `Math.random()`. Para variar el punto de inicio por cámara de forma determinística:
```typescript
// Seed basado en cameraId para startFrom determinístico
const startOffsets: Record<string, number> = {
  'CAM 01': 0,
  'CAM 03': 45,
  'CAM 05': 90,
  'CAM 07': 30,
};
const startFrom = startOffsets[cameraId] ?? 0;
```

### Tamaño del video de salida
Con 4 clips de video de fondo, el video Remotion exportado crecerá de ~3.5MB a ~15-35MB. El `hero-cinematic.webm` seguirá siendo más pequeño (~8-15MB). Para el landing page esto es aceptable dado que el video está en el asset pipeline de Angular y se sirve via nginx con compresión.

### Fallback
Si `public/footage/house/*.mp4` no existen (ej. primer clone del repo), SceneSingle renderiza el gradiente. Esto protege contra assets faltantes.

---

## Criterios de aceptación

- [ ] `.env` con `PEXELS_API_KEY` creado localmente (no en git)
- [ ] `node scripts/download-footage.mjs` descarga 4 clips en `public/footage/house/`
- [ ] Preview Remotion (`npm run dev`) muestra footage real en cada escena
- [ ] SceneSingle renderiza correctamente con video Y con gradiente (fallback)
- [ ] Video exportado visualmente correcto — footage real con overlay CCTV
- [ ] Archivos copiados a Angular assets
- [ ] Deploy a producción

---

## Archivos afectados

| Archivo | Acción |
|---------|--------|
| `C:/dev/nirm-hero-video/scripts/download-footage.mjs` | Crear |
| `C:/dev/nirm-hero-video/.env` | Crear (local, no git) |
| `C:/dev/nirm-hero-video/public/footage/house/*.mp4` | Crear (descargados) |
| `C:/dev/nirm-hero-video/src/scenes/SceneSingle.tsx` | Modificar — agregar videoSrc |
| `C:/dev/nirm-hero-video/src/scenes/SceneGrid.tsx` | Modificar — agregar videoSrc a CELLS |
| `C:/dev/nirm-hero-video/src/HeroCinematic.tsx` | Modificar — pasar videoSrc props |
| `frontend/src/assets/hero-cinematic.mp4` | Re-exportar |
| `frontend/src/assets/hero-cinematic.webm` | Re-exportar |

---

## Fuera de scope

- Tema fábrica (spec separado cuando se solicite)
- Cambios al portal cliente o admin (próximas sesiones)
- Compresión adicional de assets (nginx ya maneja gzip/brotli)
