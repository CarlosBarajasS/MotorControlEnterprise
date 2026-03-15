# QA Report: HLS Streaming Fix
**Fecha:** 2026-03-07
**Agente:** QA Engineer — modo bestia
**Veredicto:** BLOQUEADO

**Archivos revisados:**
- `frontend/src/app/components/camera-viewer/camera-viewer.component.ts`
- `frontend/src/app/components/cameras/camera-detail.component.ts`
- `frontend/src/app/components/client-portal/client-camera-detail.component.ts`
- `backend/Controllers/Monitoring/UserStreamController.cs`

---

## Bugs encontrados

| # | Severidad | Archivo | Linea | Descripcion | Como reproducirlo |
|---|-----------|---------|-------|-------------|-------------------|
| 1 | **P1** | `camera-viewer.component.ts` | 66-79 | **Safari: event listeners se acumulan en cada retry.** El path nativo (Safari/iOS) llama `addEventListener('loadedmetadata')` y `addEventListener('error')` sin guardar referencia ni removerlos. Cada `retry()` agrega listeners adicionales al mismo `<video>`. Tras 3 reintento: 3 handlers disparan en paralelo. | Abrir en Safari, esperar error de stream, clickear "Reintentar" 3 veces, reconectar exitosamente — `video.play()` se llama 3 veces simultaneamente. |
| 2 | **P1** | `camera-detail.component.ts` | 60 | **setTimeout de initPlayer no se cancela en ngOnDestroy — HLS leak.** `setTimeout(() => this.initPlayer(), 0)` no guarda el handle. Si el usuario navega fuera del componente antes de que el timeout dispare, `ngOnDestroy` destruye el HLS existente (null) pero el setTimeout igual llama `initPlayer()` despues, creando una instancia HLS huerfana que nunca se destruye. | Navegar a detalle de camara y salir inmediatamente antes de que el HTTP response llegue. |
| 3 | **P1** | `UserStreamController.cs` | 38-41 | **`GetCurrentUserId()` lanza FormatException con JWT no numerico.** `int.Parse(claim ?? "0")` falla si el claim `sub` existe pero contiene un valor no numerico (UUID, string vacio). Resultado: excepcion no manejada → 500 al cliente en lugar de 401/403. | Hacer request con un JWT cuyo claim `sub` sea un UUID o string no numerico. |
| 4 | **P1** | `UserStreamController.cs` | 90 | **Paths de segmento con subdirectorio rompen la regex de seguridad.** La regex de seguridad `^[\w\-]+\.(ts\|m3u8\|mp4\|m4s)$` no permite `/`. Pero `RewritePlaylistUrls` puede generar rutas con slash cuando MediaMTX organiza sus playlists en subdirectorios (ej: playlist contiene `hls/chunklist.m3u8` → reescrito como `/api/stream/1/hls/hls/chunklist.m3u8` → el segmento recibido es `hls/chunklist.m3u8` → falla la regex de seguridad → **400 Bad Request**). Stream falla completamente en cámaras con ese formato de playlist. | Configurar MediaMTX con HLS en subdirectorios y abrir cualquier camara. |
| 5 | **P2** | `camera-viewer.component.ts` | 97-105 | **Loop de reconexion infinita sin backoff ni limite.** Si la camara esta offline permanentemente, `scheduleReconnect()` → `retry()` → error → `scheduleReconnect()` se repite cada 5s para siempre, generando ~720 requests/hora al backend por camara offline. | Abrir camara con stream caido, esperar 30 segundos, revisar Network tab. |
| 6 | **P2** | `camera-viewer.component.ts` | 72-75 | **Safari path no tiene auto-reconexion.** El handler de error nativo (linea 72) solo setea `hasError = true` pero NO llama `scheduleReconnect()`. Safari queda en pantalla de error estatica mientras que Chrome se reconecta automaticamente. | Abrir en Safari con stream intermitente. |
| 7 | **P2** | `UserStreamController.cs` | 199 | **Rol `installer` no puede ver streams.** `GetAuthorizedCamera` solo hace bypass completo para `admin`. El rol `installer` cae al path de cliente, que busca un `Client` record con `UserId == userId` — los installers no tienen registro en la tabla `Clients` → `clientId == null` → retorna null → 404. | Loguear como installer e intentar ver cualquier camara en vivo. |
| 8 | **P2** | `UserStreamController.cs` | 118-119 | **`ReadAsStreamAsync` no reduce memoria — la "optimizacion" no tiene efecto.** `GetAsync` con `HttpCompletionOption.ResponseContentRead` (default) descarga el body completo antes de retornar. `ReadAsStreamAsync()` retorna un `MemoryStream` sobre bytes ya buffereados. Para que sea streaming real se requiere `HttpCompletionOption.ResponseHeadersRead`. | Monitorear memoria del proceso backend mientras se reproducen 5 camaras simultaneas. |
| 9 | **P2** | `client-camera-detail.component.ts` | 126 | **Portal cliente llama a endpoint admin `/api/cameras/{id}` sin filtro de propiedad.** Si el controlador admin de camaras no valida `clientId` del JWT, un cliente podria cambiar el ID en la URL y cargar datos de camara de otro cliente (IDOR). Requiere verificacion de ese endpoint. | Loguear como cliente A, navegar a `/client/cameras/{id-de-cliente-B}`. |

---

## Edge cases adicionales no manejados

- **`streamUrl` input vacio o null en `CameraViewerComponent`**: `this.hls.loadSource(this.streamUrl)` con string vacio no lanza error inmediato pero HLS.js falla silenciosamente.
- **Token JWT expirado durante sesion activa**: los segmentos empezaran a fallar con 401. HLS.js reintentara 6 veces con el mismo token expirado antes de marcar fatal. No hay logica de refresh.
- **Multiples instancias de `CameraViewerComponent` en pantalla**: cada una crea su propio loop de reconexion. Con 5 camaras offline = 5 loops corriendo en paralelo → 3600 requests/hora.
- **`camera-detail.component.ts` no tiene estado de loading**: a diferencia de `CameraViewerComponent`, el video de detalle no muestra spinner mientras carga. Experiencia inconsistente.

---

## Observaciones de calidad (P3)

- `NETWORK_ERROR` fatal podria intentar `hls.startLoad()` antes del reinit completo (mas liviano).
- `ngOnDestroy` en `camera-viewer` no nullifica `this.hls` despues de `destroy()` (cosmético, GC lo maneja).
- La regex de seguridad en `GetHlsSegment` no permite puntos en el nombre base del segmento — si MediaMTX genera nombres como `seg.001.ts`, falla. En la practica MediaMTX usa nombres simples.
- El comportamiento del rol `installer` deberia estar documentado explicitamente.

---

## Criterios de aceptacion vs estado

| Criterio | Estado | Notas |
|----------|--------|-------|
| Stream no se corta por errores transitorios | Parcial | HLS.js recupera MEDIA_ERROR, pero NETWORK_ERROR hace reinit completo |
| Reconexion automatica al recuperarse el stream | Parcial | Solo Chrome/Firefox — Safari no tiene auto-reconexion |
| Segmentos no se cargan en memoria completa | No cumplido | `GetAsync` default ya descarga todo — fix es ineficaz sin `ResponseHeadersRead` |
| URLs absolutas de MediaMTX se reescriben | Cumplido | Primera regex del nuevo `RewritePlaylistUrls` lo maneja |
| Sin memory leaks en navegacion | No cumplido | Bugs #1 (Safari) y #2 (setTimeout sin cancelar) |
| Installers pueden ver streams | No cumplido | Bug #7 bloquea el rol installer |

---

## Decision

**BLOQUEADO** — 4 bugs P1 que deben resolverse antes del commit.

Items minimos para desbloquear:
- [ ] Bug #1: Limpiar event listeners en Safari path en `retry()`
- [ ] Bug #2: Guardar handle del setTimeout en `camera-detail` y cancelarlo en `ngOnDestroy`
- [ ] Bug #3: Reemplazar `int.Parse` con `int.TryParse` en `GetCurrentUserId()`
- [ ] Bug #4: Verificar/arreglar la regex de seguridad para soportar segmentos con path (o garantizar que RewritePlaylistUrls nunca genere paths con slash)
