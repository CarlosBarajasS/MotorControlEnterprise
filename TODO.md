# TODO & ESTADO ACTUAL - MotorControlEnterprise (VMS Edge)

> **Actualizado:** 2026-02-23 (Fin de sesión)
> **Referencia de Diseño:** `pencil-dashboard.pen` (Usar MCP `pencil`)
> **Reglas del Proyecto:** `AI_RULES.md`

---

## 🟢 ESTADO DEL SISTEMA (Implementado y Verificado)

1. **Estilos Globales & Tema Oscuro**
   - Sistema de variables CSS implementado en `styles.scss` (`--bg: #0b1120`, `--surface: #1e293b`, `--accent: #137fec`).
   - Botones, inputs y modales estandarizados bajo el nuevo Design System.

2. **App Shell (Sidebar & Topbar)**
   - El Sidebar se oculta automáticamente en `/` y `/login`.
   - Navegación agrupada ("MONITOREO", "ADMINISTRACIÓN").
   - El "Módulo de Motores" está completamente segregado a nivel de UI y navegación (botón especial ámbar en el fondo del sidebar), cumpliendo la regla arquitectónica de NO mezclar monitoreo VMS con Motores IEC.

3. **Landing Page (`/`)**
   - Nuevo diseño B2B Glassmorphism enfocado 100% en el Sistema de Monitoreo VMS.
   - Integración con endpoint `/health` activo para mostrar el estado del servidor en tiempo real.

4. **Usuarios / IAM (`/users`)**
   - Implementado el panel de Identity & Access Management en formato moderno.

5. **Dashboard Central (`/dashboard`)**
   - Tarjetas de estadísticas de alto nivel.
   - Grid de gateways resumido.

6. **Gateways Edge (`/gateways`) [NUEVO]**
   - Segregado exitosamente del componente de Clientes.
   - Implementado como tarjetas horizontales anchas (diseño `cYce3` en Pencil) con telemetría mock (CPU, RAM, Uptime) y contadores de conectividad.

7. **Clientes Corporativos (`/clients`) [ACTUALIZADO]**
   - Remodelado desde una tabla plana genérica a un Grid Responsivo de Tarjetas interactivas (diseño `w594Q` en Pencil).
   - Acciones de edición, borrado y "Nube" mantenidas y estilizadas.

---

## 🔴 PENDIENTES PARA LA PRÓXIMA SESIÓN (MAÑANA)

### 1. Cámaras (`/cameras`)
- **Objetivo:** Refinar las tarjetas de cámaras y los controles de filtro para que coincidan con la variante interactiva final del mockup en Pencil.
- **Detalles:** 
  - Asegurar que los thumbnails de video, badges (EN VIVO, OFFLINE) y metadatos se vean premium.
  - Asegurar congruencia de grid responsivo.

### 2. Grabaciones (`/recordings/:id`)
- **Objetivo:** Reestructurar visualmente la gestión de grabaciones.
- **Detalles:**
  - Cambiar el layout a un formato "Google Drive" (Navegación por Carpetas: `Cliente > Fecha > Hora` o `Cámara > Fecha > Hora`).
  - Arreglar un bug reportado previamente donde el layout del Sidebar se rompe/descuadra al entrar a este componente.

### 3. Wizard & Settings
- **Objetivo:** Pulir y unificar el diseño de los inputs, selects y botones en el componente Wizard/Ajustes de Instalación.
  
---

## 🛠️ NOTAS TÉCNICAS RÁPIDAS
- **Ubicación Frontend:** `c:\Users\carlo\Desktop\MotorControlEnterprise\frontend`
- **Comando de Arranque:** `cd frontend && npm run dev`
- **Construcción:** `npx ng build` (Verificado: compila 100% sin errores actuales).
- **Backend Mock/Real:** Recordar referenciar APIs a `/api/...` (el proxy atiende localmente). 
- **Componentes obsoletos eliminados:** `app-telemetry-dashboard`, etc. No deben re-incorporarse al dashboard principal.
