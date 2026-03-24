# Spec: Refactor del Wizard — Gateway-First

**Fecha:** 2026-03-24
**Estado:** Aprobado por usuario
**Autor:** Tech Lead / Brainstorming session

---

## Contexto y motivación

El Wizard actual crea el cliente, el gateway, las cámaras y el usuario web en un solo flujo de 5 pasos. Esto genera dos problemas:

1. **Duplicación de responsabilidades:** el módulo de Clientes ya existe y es donde se dan de alta clientes. El Wizard duplica ese flujo innecesariamente.
2. **Rigidez para multi-gateway:** un cliente con 2+ RPis no puede usar el Wizard para instalar el segundo gateway — no hay forma de seleccionar cuál configurar.

La solución es separar responsabilidades: **el cliente se da de alta desde Clientes; el Wizard configura exclusivamente el gateway**.

---

## Objetivo

Refactorizar el Wizard de 5 pasos a **4 pasos**, eliminando la creación de cliente y usuario web. El resultado es un flujo simple e intuitivo para instaladores (no necesariamente técnicos) que permite:

- Configurar el primer gateway de un cliente nuevo
- Agregar gateways adicionales a clientes existentes

---

## Flujo nuevo — 4 pasos

```
[1 · Cliente & Gateway] → [2 · Cámaras] → [3 · Archivos] → [4 · Despliegue]
```

### Paso 1 — Cliente & Gateway

**Propósito:** identificar a quién pertenece esta instalación y qué RPi se configura.

**Campos:**
- `Cliente` (obligatorio) — dropdown con todos los clientes existentes ordenados por nombre. Si no hay clientes: estado vacío con botón "Dar de alta un cliente" → `/clients`.
- `Gateway` (obligatorio) — selector con dos modos:
  - **Elegir existente:** dropdown con los gateways del cliente seleccionado. Útil para re-generar archivos de una RPi ya registrada.
  - **Crear nuevo:** formulario inline con:
    - `Nombre del punto` (obligatorio) — ej: "Edificio A, Planta Baja"
    - `ID del dispositivo` (obligatorio) — MAC o hostname de la RPi. Placeholder: `b8:27:eb:aa:bb:cc`
    - `Token de acceso` (obligatorio) — campo password + botón "Generar" (`crypto.randomUUID()`). El token generado se muestra en texto visible (no enmascarado) hasta que el usuario avance, para que pueda copiarlo.
    - `Ubicación` (opcional)

**Comportamiento:**
- Al seleccionar un cliente, el selector de gateway carga sus gateways vía `GET /api/clients/{id}/gateways`.
- Si el cliente no tiene gateways, el modo se fija en "Crear nuevo" automáticamente y no se muestra el toggle.
- Si tiene gateways, el modo por defecto es "Elegir existente" con un botón "＋ Crear nuevo" para cambiar.
- Al avanzar con **gateway nuevo:**
  1. Llamar `POST /api/gateways` con `{ gatewayId, name, location, clientId, edgeToken }`.
  2. Si falla (ej: ID duplicado, error de red): mostrar error inline debajo del campo `ID del dispositivo`, **no avanzar**.
  3. Si tiene éxito: guardar el `gatewayId` y el `clientId` en el estado del componente y avanzar.
- Al avanzar con **gateway existente:** solo guardar `gatewayId` y `clientId` en el estado y avanzar. No hay llamada API.

**Validación antes de avanzar:**
- Cliente seleccionado
- Modo "Elegir existente": gateway seleccionado del dropdown
- Modo "Crear nuevo": nombre, ID dispositivo y token completos

---

### Paso 2 — Cámaras

**Propósito:** registrar las cámaras físicas de esta instalación.

**Comportamiento:**
- Lista **siempre vacía** al entrar. No pre-carga cámaras existentes del cliente.
- El instalador agrega cada cámara con: ID/nombre, IP local, puerto ONVIF (default 8000), usuario ONVIF, contraseña ONVIF.
- Se puede avanzar con 0 cámaras (se registrarán después desde el módulo Cámaras).
- Al avanzar: `POST /api/cameras` por cada cámara. Si `selectedClient.cloudStorageActive` es true, también crea la cámara `-low` (grabación). El campo `clientId` viene del estado guardado en el Paso 1.
- `cloudStorageActive` está disponible en el objeto cliente devuelto por `GET /api/clients` — no requiere llamada adicional.

---

### Paso 3 — Archivos de Configuración

**Propósito:** generar y descargar los archivos de instalación para la RPi específica.

**Comportamiento:**
- Llama a `GET /api/admin/clients/{clientId}/edge-config?gatewayId={gatewayId}`.
- **Cambio en backend requerido:** el endpoint `WizardController.GetEdgeConfig` debe aceptar un parámetro opcional `?gatewayId=` para buscar el gateway específico en lugar de usar siempre `FirstOrDefault()`. Si no se pasa el parámetro, mantiene el comportamiento actual (backward-compatible).
- Muestra las pestañas `.env` / `mediamtx.yml` / `docker-compose.yml` con botones de descarga individuales.
- Si la llamada falla: mensaje de error con botón "Reintentar".

---

### Paso 4 — Despliegue

**Propósito:** guiar al instalador para poner en marcha la RPi y verificar la conexión.

**Comportamiento:**
- Instrucciones paso a paso: clonar repo, copiar archivos, `docker compose up -d`.
- Panel de discovery: polling a `GET /api/admin/clients/{clientId}/discovery-status` cada 3 segundos.
- Muestra estado del gateway (online/offline) y estado de cada cámara (pending / discovering / discovered / failed).
- Sin cambios funcionales respecto al paso 4 actual.
- Al finalizar: botón "Ir a Clientes" → `/clients`.

---

## Lo que se elimina

| Eliminado | Alternativa |
|-----------|-------------|
| Paso "Datos del Cliente" (creación) | Módulo Clientes (`/clients`) |
| Paso "Acceso Web" (crear usuario) | Módulo Clientes → acción "Crear acceso" |
| Auto-generación de `gatewayId` desde nombre del cliente | El instalador lo escribe explícitamente |
| `clientData` en el estado del componente | Reemplazado por `selectedClient` y `selectedGateway` signals |

---

## Cambios en archivos

### Frontend

| Archivo | Cambio |
|---------|--------|
| `frontend/src/app/components/wizard/wizard.component.ts` | Reescritura completa del estado y lógica (de 5 a 4 pasos) |
| `frontend/src/app/components/wizard/wizard.component.html` | Reescritura completa de la plantilla |
| `frontend/src/app/components/wizard/wizard.component.scss` | Ajustes si los estilos actuales lo requieren |

### Backend

| Archivo | Cambio |
|---------|--------|
| `backend/Controllers/Monitoring/WizardController.cs` | Agregar parámetro `?gatewayId=` opcional a `GetEdgeConfig`. Si se pasa, busca ese gateway específico; si no, usa `FirstOrDefault()` (backward-compatible). |

---

## Diseño UI/UX — Principios

- **Usuarios objetivo:** instaladores sin conocimiento técnico profundo.
- **Tono:** instrucciones claras en cada paso, tooltips donde hay terminología técnica (ID dispositivo, token).
- **Progreso visual:** barra de 4 pasos siempre visible con labels: "Cliente", "Cámaras", "Archivos", "Despliegue".
- **Estado vacío (sin clientes):** mensaje explicativo con botón de acción directo — no un error genérico.
- **Feedback inmediato:** errores inline por campo, no al final del paso.
- **Token visible:** al generarlo, mostrar en texto plano (no `type="password"`) hasta avanzar, para que el instalador pueda copiarlo.
- **Implementar con `/frontend-design`** para mantener calidad visual y patrones del design system (variables CSS: `--surface`, `--outline`, `--accent`, `--muted`, `--green`, `--red`; componentes Angular 17 standalone).

---

## Criterios de aceptación

- [ ] CA-1: El Wizard ya no muestra ni solicita datos de creación de cliente.
- [ ] CA-2: El paso 1 carga el listado de clientes desde `GET /api/clients`.
- [ ] CA-3: Al seleccionar un cliente, carga sus gateways desde `GET /api/clients/{id}/gateways`.
- [ ] CA-4: Si el cliente no tiene gateways, el modo "Crear nuevo" se activa automáticamente sin mostrar toggle.
- [ ] CA-5: Si el cliente tiene gateways, se puede alternar entre "Elegir existente" y "Crear nuevo".
- [ ] CA-6: Al avanzar con gateway nuevo, `POST /api/gateways` se llama antes de continuar. Si falla, se muestra error inline y no se avanza.
- [ ] CA-7: El token generado se muestra en texto visible (no enmascarado) mientras se está en el paso 1.
- [ ] CA-8: El paso 2 siempre inicia con lista vacía de cámaras.
- [ ] CA-9: Es posible avanzar del paso 2 sin agregar cámaras.
- [ ] CA-10: Los archivos `.env`, `docker-compose.yml` y `mediamtx.yml` se generan para el gateway específico seleccionado en paso 1 (no siempre el primero del cliente).
- [ ] CA-11: El discovery polling funciona igual que en el wizard actual.
- [ ] CA-12: El Wizard no tiene paso 5 (Acceso Web).
- [ ] CA-13: El botón final del paso 4 lleva a `/clients`.
- [ ] CA-14: Si no hay clientes registrados, el paso 1 muestra estado vacío con botón "Dar de alta un cliente".
- [ ] CA-15: El diseño sigue el design system (variables CSS, componentes standalone Angular 17, uso de `/frontend-design`).
