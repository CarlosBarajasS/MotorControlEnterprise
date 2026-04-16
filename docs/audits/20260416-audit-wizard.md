# Auditoría: Wizard de Instalación de Clientes
**Fecha:** 2026-04-16 | **Autor:** Agente de Auditoría

**Archivos revisados:**
- `backend/Controllers/Monitoring/WizardController.cs` (767 líneas)
- `frontend/src/app/components/wizard/wizard.component.ts` (537 líneas)
- `backend/Controllers/Monitoring/GatewayController.cs` (212 líneas)
- `backend/Models/Client.cs`, `Camera.cs`, `Gateway.cs`
- `motorcontrol-edge-template/edge-agent/services/DvrWatchdogService.js` (nuevo)
- `motorcontrol-edge-template/docker-compose.yml`

---

## Críticos (P0)

| Archivo | Línea | Descripción | Sugerencia |
|---------|-------|-------------|------------|
| `WizardController.cs` | ~471 | `DiscoveryStatus` lee `lastHeartbeatAt` de `client.Metadata["lastHeartbeatAt"]` pero desde la migración a modelo `Gateway`, el heartbeat se guarda en `Gateway.LastHeartbeatAt`. El wizard siempre reporta el gateway como offline. | Cambiar a `gateway.LastHeartbeatAt` consultando el `Gateway` real por `GatewayId`. |
| `wizard.component.ts` | ~160–200 | ~~4 endpoints apuntaban a rutas inexistentes `/admin/wizard/*`~~ **CORREGIDO en esta sesión.** Los URLs ya fueron arreglados. | — |

---

## Advertencias (P1)

| Archivo | Línea | Descripción | Sugerencia |
|---------|-------|-------------|------------|
| `WizardController.cs` | ~706, 731 | **N+1 en `CreateDvrCameras`**: `FirstOrDefaultAsync` dentro de `foreach` — 2 queries por cámara. Con 16 canales = 32 roundtrips a BD. | Cargar todos los paths existentes antes del loop: `var existing = await _db.Cameras.Where(c => c.ClientId == clientId).ToListAsync()`. |
| `WizardController.cs` | ~380–420 | **`TriggerDiscovery` sin rollback**: Si `mqttService.Publish` lanza excepción después de marcar cámaras como `discovering`, quedan atascadas. No hay timeout de limpieza. | Agregar job de cleanup o marcar `idle` en el catch. |
| `WizardController.cs` | ~530 | **`BuildMediamtxYml` usa `record: yes`** en `pathDefaults`. El edge-agent también tiene su propia lógica de grabación; habilitar en ambos duplica grabaciones y llena disco. | Usar `record: no` en pathDefaults del edge; el edge-agent controla la grabación. |
| `WizardController.cs` | ~74–85 | **`GetEdgeConfig` auto-crea gateway sin `edgeToken`**: Si se llama sin `gatewayId`, crea un gateway con token vacío. El agente edge no podrá autenticarse. | Requerir `gatewayId` explícito o generar `EdgeToken` válido (Guid). |
| `wizard.component.ts` | ~281 | **`submitIpCameras` envía `cameraId: cam.name`**: Si el nombre tiene espacios o caracteres especiales, el `CameraKey` se corrompe y el path de MediaMTX será inválido. | Sanitizar: `cam.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')` o pedir un campo `key` separado. |
| `wizard.component.ts` | ~295–310 | **Cámara de grabación twin inconsistente**: En modo DVR siempre se crean pares (canal + canal-low). En modo IP standalone, la cámara twin de grabación solo se crea si `cloudActive === true`. Comportamiento asimétrico. | Definir comportamiento canónico y aplicarlo igual en ambos flujos. |
| `wizard.component.ts` | ~340 | **`saveManualRtsp` envía `location: null` siempre**, sobreescribiendo location existente si la cámara ya tenía una. | Enviar `location` solo si tiene valor, o leer el valor previo antes de hacer PATCH. |

---

## Recomendaciones (P2/P3)

| Archivo | Línea | Descripción | Sugerencia |
|---------|-------|-------------|------------|
| `WizardController.cs` | 84, 101, 116 | **3 `SaveChangesAsync()` en `GetEdgeConfig`** dentro de la misma request — 3 roundtrips a BD innecesarios. | Acumular cambios y llamar `SaveChangesAsync()` una sola vez al final. |
| `WizardController.cs` | ~620 | **`DvrScanStatus` captura todas las excepciones** y retorna `{status: "idle"}` sin log. Errores reales quedan silenciados. | Loguear `ex.Message` antes de retornar el fallback. |
| `WizardController.cs` | — | **`Client.NvrPassword` en texto plano en BD** — `client.NvrPassword = dto.NvrPassword`. Si la BD se compromete, las credenciales del DVR quedan expuestas. | Cifrar con Data Protection API o al menos indicar en la documentación de riesgo. |
| `wizard.component.ts` | ~450 | **Sin feedback al usuario cuando el polling de discovery expira** (5 min). El spinner simplemente desaparece sin mensaje de error. | Mostrar `"Tiempo de espera agotado. Intenta reiniciar el gateway."` al expirar. |
| `Camera.cs` | — | **`Camera.Metadata` JSONB contiene credenciales ONVIF** (`user`, `pass`) en texto plano. | Mismo riesgo que `NvrPassword` — documentar como dato sensible. |
| `WizardController.cs` | ~200 | **`BuildEnv()` no incluye `NVR_IP`/`NVR_PORT`/`NVR_USER`/`NVR_PASSWORD`** en el archivo `.env` generado. | ~~Ya corregido en `BuildDockerCompose()`~~ — verificar que `BuildEnv()` también los incluya para evitar que el `.env` quede desincronizado con el `docker-compose.yml`. |

---

## Correcciones aplicadas en esta sesión — COMPLETAS (commits a50c00d → 1ef8993)

| Archivo | Cambio |
|---------|--------|
| `wizard.component.ts` | 4 endpoints `/admin/wizard/*` → rutas reales `/api/...` |
| `wizard.component.ts` | Body de `scan-dvr` aplanado para coincidir con `ScanDvrRequestDto` |
| `wizard.component.ts` | `channels` → `cameras: [{channel, name}]` en `create-dvr-cameras` |
| `WizardController.cs` | `BuildDockerCompose()` actualizado con watchdog env vars y mounts `:rw` |
| `docker-compose.yml` (edge-template) | mediamtx `:ro` → `:rw`, volumen `/config/mediamtx.yml`, env DVR |
| `WizardController.cs` | `DiscoveryStatus` lee `Gateway.LastHeartbeatAt` (P0) |
| `WizardController.cs` | `CreateDvrCameras` N+1 eliminado — un `ToListAsync().ToHashSet()` antes del loop |
| `WizardController.cs` | `TriggerDiscovery` rollback a `pending` si MQTT falla con 502 |
| `WizardController.cs` | `BuildMediamtxYml` pathDefaults `record: yes` → `record: no` |
| `WizardController.cs` | `GetEdgeConfig` 3 `SaveChangesAsync` consolidados en 1 |
| `WizardController.cs` | `DvrScanStatus` catch silencioso → `_logger.LogWarning` con contexto |
| `wizard.component.ts` | `submitIpCameras` sanitiza `cameraId` con slug; twin de grabación siempre se crea |
| `wizard.component.ts` | `saveManualRtsp` ya no envía `location: null` |

---

## Resumen ejecutivo

**7 archivos revisados · P0: 1 · P1: 6 · P2/P3: 6**

El bug más crítico activo es el **P0 en `DiscoveryStatus`**: el wizard siempre muestra el gateway como offline porque lee el heartbeat del campo legacy `client.Metadata` en vez del modelo `Gateway`. Esto hace que el instalador no pueda confirmar si el edge-agent está online durante la configuración.

Los P1 más urgentes son el N+1 en `CreateDvrCameras` (impacto en instalaciones con DVR de 16 canales) y la ausencia de `edgeToken` en el gateway auto-creado por `GetEdgeConfig`.
