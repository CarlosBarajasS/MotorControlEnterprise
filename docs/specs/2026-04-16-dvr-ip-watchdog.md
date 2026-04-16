# Spec: DVR IP Watchdog — Auto-recuperación ante cambio de IP
> Estado: DRAFT
> Fecha: 2026-04-16

## Objetivo
Cuando el DVR cambia de IP en la red local, el edge-agent detecta el fallo,
re-escanea la LAN, valida las credenciales RTSP, actualiza MediaMTX y
persiste la nueva IP en `mediamtx.yml` — sin intervención manual.

## Fuera de scope
- Cambio de credenciales del DVR (usuario/contraseña)
- DVRs con múltiples subnets o VLANs
- Notificación al usuario final (solo alerta al admin vía MQTT)
- Modificar el código del servidor central (solo edge-agent y docker-compose)

## Contratos de API / MQTT

### Publicación al detectar cambio de IP
```
Topic:   gateway/{CLIENT_ID}/evt/dvr-ip-changed
Payload: {
  gatewayId: string,
  oldIp: string,
  newIp: string,
  pathsUpdated: number,
  detectedAt: ISO8601
}
```

### MediaMTX API (ya existente)
- `GET  /v3/paths/list`  → detectar paths en error
- `PATCH /v3/config/paths/patch/{name}` → actualizar source URL (vía MediamtxManagerService.addPermanentPath)

## Componentes afectados

### Nuevo: `edge-agent/services/DvrWatchdogService.js`
Responsabilidades:
1. **Monitoreo** — cada 60s consulta `GET /v3/paths/list` en MediaMTX local.
   Cuenta paths cuyo `source.type` === `"rtspSource"` y `ready === false`.
   Si ≥ 50% de paths están caídos por ≥ 3 ciclos consecutivos (3 min) → inicia scan.
   Guarda un cooldown de 10 min tras un scan exitoso para no re-escanear en loop.

2. **Scan de LAN** — deriva subnet del env var `NVR_IP` (toma el /24).
   Escanea en paralelo (20 concurrent) con TCP connect al puerto 554, timeout 2s.
   Excluye la IP actual del DVR (ya sabemos que falló).

3. **Validación RTSP** — por cada candidato con puerto 554 abierto,
   envía `OPTIONS rtsp://{ip}:554/ RTSP/1.0` con credenciales `NVR_USER:NVR_PASSWORD`.
   Acepta respuesta 200 o 401 (ambas confirman que es un servidor RTSP).
   Rechaza si no hay respuesta en 3s.

4. **Actualización** — si encuentra el DVR:
   a. PATCH en MediaMTX vía `mediamtxManager.addPermanentPath()` para cada path
      que tenga la IP antigua en su source URL.
   b. Reescribe `/config/mediamtx.yml` haciendo string replace de la IP antigua por la nueva.
   c. Publica MQTT `gateway/{CLIENT_ID}/evt/dvr-ip-changed`.
   d. Actualiza `this.currentDvrIp` en memoria.

### Modificado: `docker-compose.yml`
- Cambiar mount de mediamtx.yml en `mediamtx` service: `:ro` → `:rw`
- Agregar volume en `edge-agent` service:
  `- ./mediamtx/mediamtx.yml:/config/mediamtx.yml:rw`
- Agregar env vars en `edge-agent`:
  ```
  NVR_IP, NVR_PORT, NVR_USER, NVR_PASSWORD
  ```
  (leídas desde `.env` vía `env_file`, ya están en el .env de Six Zamora)

### Modificado: `edge-agent/server.js`
- Instanciar `DvrWatchdogService` con `{ nvrIp, nvrPort, nvrUser, nvrPassword }`
- Llamar `watchdog.start()` en el bloque de inicialización (junto a diskGuard)
- Los env vars `NVR_IP`, `NVR_USER`, `NVR_PASSWORD`, `NVR_PORT` ya existen en `.env` de Six Zamora

## Modelo de datos internos (en memoria, no persiste)
```js
{
  currentDvrIp: string,       // IP actual conocida del DVR
  failCycles: number,         // ciclos consecutivos con ≥50% paths caídos
  lastScanAt: Date | null,    // timestamp último scan (cooldown 10min)
  scanning: boolean           // mutex para no lanzar dos scans simultáneos
}
```

## Criterios de aceptación
- [ ] CA1: Si el DVR cambia de IP, en menos de 4 minutos los streams se recuperan sin intervención
- [ ] CA2: El watchdog no inicia scan si menos del 50% de los paths están caídos
        (evita falsos positivos por caída parcial de red)
- [ ] CA3: Después de un scan exitoso, no re-escanea por 10 minutos (cooldown)
- [ ] CA4: Si no encuentra el DVR en la LAN, solo loguea — no rompe nada
- [ ] CA5: `mediamtx.yml` queda con la IP nueva persistida tras reinicio del contenedor
- [ ] CA6: Se publica MQTT `dvr-ip-changed` con oldIp y newIp correctos
- [ ] CA7: Si el DVR no está en la subred /24 de `NVR_IP`, el watchdog loguea advertencia y no escanea
- [ ] CA8: El servicio arranca aunque `NVR_IP` no esté definido (log warning, watchdog deshabilitado)
