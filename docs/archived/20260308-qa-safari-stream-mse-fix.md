# QA Report: Safari iOS stream auth + MSE recording fix
**Fecha:** 2026-03-08
**Agente:** QA Engineer
**Archivos revisados:**
- `frontend/src/app/components/camera-viewer/camera-viewer.component.ts`
- `frontend/src/app/components/cameras/camera-detail.component.ts`
- `frontend/src/app/components/client-portal/client-recordings.component.ts`
- `backend/Program.cs` (verificación de soporte `?token=`)
- `backend/Controllers/Monitoring/RecordingController.cs` (verificación de Range support)

**Veredicto:** ✅ APROBADO CON OBSERVACIONES

---

## Criterios de aceptación validados

| Criterio | Estado | Notas |
|----------|--------|-------|
| Safari iOS no entra en loop error/reconexión en stream en vivo | ✅ | `?token=` agregado en ruta nativa Safari de ambos viewers |
| Backend acepta `?token=` como query param | ✅ | `OnMessageReceived` en `Program.cs` línea 85-89 confirmado |
| Grabaciones popup carga y reproduce video | ✅ | MSE eliminado; URL directa con `?token=` + `enableRangeProcessing` |
| Spinner se oculta cuando el video está listo | ✅ | `(loadeddata)="onVideoLoaded()"` correctamente registrado |
| Spinner se oculta en caso de error de red | ✅ | `(error)="loadingVideo.set(false)"` como safety net |
| Timeline click / seek funciona después del fix | ✅ | `pendingSeek` preservado, `onTimeUpdate` aplica seek con `duration > 0` |
| Auto-advance al siguiente segmento al terminar | ✅ | `onVideoEnded()` llama `playRecording(list[idx+1])` — intacto |
| TypeScript compila sin errores | ✅ | `tsc --noEmit` sin salida de errores |
| No quedan referencias a métodos/propiedades eliminados | ✅ | grep confirma: 0 referencias a `cancelCurrent`, `streamMSE`, `streamBlob`, `blobUrl`, `abortCtrl`, `mediaSource` |

---

## Bugs encontrados

Ninguno (P0 / P1).

---

## Observaciones (P2 — no bloquean deploy)

| # | Severidad | Archivo | Descripción |
|---|-----------|---------|-------------|
| 1 | P2 | `camera-viewer.component.ts` | Token JWT expuesto en URL (query param `?token=`). Patrón aceptado en el proyecto (ya existía en `recordings.component.ts`). JWT de corta duración mitiga el riesgo. |
| 2 | P2 | `camera-detail.component.ts` | La ruta Safari no tiene recovery automático: si el stream falla post-autenticación, no hay `scheduleReconnect`. Este comportamiento existía antes del fix — no es una regresión. |
| 3 | P2 | `client-recordings.component.ts` | `loadingVideo` no se resetea a `false` en `closePopup()`. No causa bug visual porque `popupVisible=false` oculta el popup. El próximo `playRecording` lo reinicia explícitamente. |

---

## Análisis de edge cases

| Caso | Resultado |
|------|-----------|
| Token vacío (no logueado) | URL sin `&token=`, backend devuelve 401, `(error)` oculta spinner — sin crash |
| Cambio rápido de segmentos (click múltiple) | El browser cancela la carga anterior al cambiar `video.src` nativamente |
| Popup cerrado mientras carga | `currentVideo.set('')` elimina el elemento video, browser detiene descarga |
| `seekToSec` fuera de duración del segmento | `Math.min(pendingSeek, v.duration - 1)` en `onTimeUpdate` — protegido |
| Safari iOS en modo cliente y administrador | Ambos components corregidos (`camera-viewer` y `camera-detail`) |
| `loadeddata` nunca dispara (archivo corrupto) | `(error)` actúa como fallback para ocultar spinner |

---

## Decisión

**APROBADO CON OBSERVACIONES** — puede proceder al deploy. Las observaciones P2 se registran para el backlog pero no bloquean producción.
