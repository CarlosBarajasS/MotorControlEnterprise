# Landing Page v2 — Diseño

**Fecha:** 2026-03-16
**Scope:** `frontend/src/app/components/landing/landing.component.html` (copy únicamente — sin cambios de CSS ni layout)
**Objetivo:** Transformar el landing de jerga técnica a lenguaje de negocio orientado a prospectos que quieren contratar instalación de cámaras de videovigilancia.

---

## Contexto

El landing actual habla de "flujos RTSP", "IAM de confianza cero", "gateways distribuidos" y "NVR Nativo en HLS". El público objetivo son dueños de negocio o particulares que buscan contratar un servicio de instalación de cámaras — no ingenieros. Además, HLS fue migrado a WebRTC y ese copy está desactualizado.

El canal de conversión es el **contacto directo** (WhatsApp, email, teléfono), no el registro en la plataforma. El login existe pero es para clientes ya activos, no para prospectos.

---

## Cambios por sección

### 1. Navbar
- Botón "Acceso Clientes →" → renombrar a **"Ya soy cliente →"**
- Sin cambios estructurales ni de estilos

### 2. Hero
| Elemento | Antes | Después |
|---|---|---|
| Badge | `✦ PLATAFORMA EDGE-FIRST` | `✦ SERVICIO DE VIDEOVIGILANCIA PROFESIONAL` |
| Título | `Videovigilancia inteligente al borde` | `Protege tu negocio con cámaras que nunca descansan` |
| Subtítulo | `Unifica tus flujos RTSP, gestiona gateways distribuidos y blinda el acceso con IAM de confianza cero...` | `Instalamos, configuramos y monitoreamos tu sistema de cámaras. Tú ves todo desde tu celular o computadora, en tiempo real, desde cualquier lugar.` |
| CTA primario | `Portal de Clientes` (→ /login, con ícono SVG de cámara) | `Solicitar información →` (→ `href="#contacto"`, sin ícono SVG — eliminar el SVG de este botón) |
| CTA secundario | `Explorar Plataforma` (→ #plataforma) | `¿Ya eres cliente? Ingresa aquí` (→ /login, estilo ghost discreto) |

### 3. Trust Bar
- Label: `LA INFRAESTRUCTURA ELEGIDA POR LÍDERES INDUSTRIALES` → `EMPRESAS Y NEGOCIOS QUE NOS CONFÍAN SU SEGURIDAD`
- Logos: sin cambio (placeholders actuales se mantienen hasta tener nombres reales)

### 4. Features (sección #edge)
Label de sección: `ARQUITECTURA MODULAR` → `LO QUE INCLUYE EL SERVICIO`
Título: `Arquitectura de Próxima Generación` → `Todo lo que necesitas para estar tranquilo`
Subtítulo: `Tres pilares diseñados para operar donde la conexión cloud no llega.` → `Nos encargamos de todo, de principio a fin.`

**Tarjeta 1 — Video (era HLS, ahora WebRTC)**
- Título: `NVR Nativo en HLS` → `Video en vivo desde cualquier lugar`
- Descripción: `Ve tus cámaras en tiempo real desde tu teléfono o computadora. Sin retrasos, sin complicaciones.`
- Tag: `Video HD en Vivo`

**Tarjeta 2 — Instalación**
- Título: `Gateways Distribuidos` → `Instalación y soporte incluido`
- Descripción: `Nos encargamos de todo: instalación, configuración y mantenimiento. Tú solo disfruta la tranquilidad.`
- Tag: `Servicio Completo`

**Tarjeta 3 — Seguridad (era IAM)**
- Título: `IAM de Confianza Cero` → `Acceso seguro y privado`
- Descripción: `Solo tú y las personas que autorices pueden ver tus cámaras. Tu privacidad es nuestra prioridad.`
- Tag: `Privacidad Garantizada`

### 5. Filosofía (#filosofia)
Sin cambio de estructura. Solo simplificación del copy:

**Misión:** `Darte la tranquilidad de saber que tu negocio está protegido, sin que tengas que ser un experto en tecnología.`

**Visión:** `Ser la empresa de videovigilancia más confiable de la región, combinando tecnología moderna con atención humana.`

**Políticas:** `Trabajamos con discreción, honestidad y respeto por tu privacidad. Tus imágenes son tuyas.`

### 6. Sección de Contacto (nueva — reemplaza el CTA final)
**ID:** `#contacto` — cambiar el atributo `id="acceso"` del `<section class="lp-cta-section">` existente a `id="contacto"`.
**Anchor nav:** el link "Plataforma" en navbar no cambia; se agrega `Contacto` en los nav links apuntando a `#contacto`.

Estructura HTML (dentro del patrón visual existente `.lp-cta-card`):

```
Label:  CONTÁCTANOS
Título: ¿Listo para proteger tu negocio?
Subtítulo: Respondemos en menos de 24 horas. Sin compromisos.

[ 📱 WhatsApp ]   [ ✉️ Correo ]   [ 📞 Llamada ]

Nota pie: ¿Ya tienes servicio activo? Accede a tu portal aquí →
```

**Datos de contacto (placeholders — rellenar antes de deploy):**
- WhatsApp: `https://wa.me/XXXXXXXXXX`
- Email: `mailto:contacto@nirmgroup.com`
- Teléfono: `tel:+XXXXXXXXXX` (opcional, puede omitirse si no aplica)

Los botones usan clases existentes `.lp-btn-primary` y `.lp-btn-ghost`. El link de portal al pie usa `routerLink="/login"`.

El botón de teléfono es opcional — si el placeholder no se rellena antes del deploy, se omite.

### 7. Footer
- Descripción brand: `Plataforma de videovigilancia IoT y monitoreo edge distribuido.` → `Servicio profesional de instalación y monitoreo de cámaras de seguridad.`
- Link footer "NVR en Vivo" → `Video en Vivo`
- Link footer "Seguridad IAM" → `Privacidad y Acceso`
- Agregar `Contacto` como link en columna PLATAFORMA apuntando a `#contacto`

### 8. Nav links (desktop + mobile)
- Renombrar link "Edge" (`href="#edge"`) → `Servicios` (mantiene el mismo anchor `#edge`)
- Renombrar link "Seguridad" (`href="#seguridad"`) → `Privacidad` (mantiene el mismo anchor `#seguridad`)
- Agregar `Contacto` como último link en ambos menús, apuntando a `#contacto`
- Aplicar los mismos cambios al menú mobile (`.lp-mobile-link`)

---

## Lo que NO cambia
- Ningún archivo `.scss` — cero cambios de estilos
- El componente TypeScript `landing.component.ts` — no se requiere ningún cambio; `href="#contacto"` funciona como anchor nativo en HTML sin lógica TypeScript adicional
- El mockup del dashboard en el hero (imágenes CCTV, grid animado)
- La estructura de secciones y el orden
- El sistema de tema claro/oscuro

---

## Datos pendientes antes de go-live
- [ ] Número de WhatsApp real
- [ ] Email de contacto real
- [ ] Teléfono (confirmar si se incluye)
- [ ] Nombres reales de clientes para el trust bar (opcional)
