const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SHOTS = path.join(__dirname, 'screenshots');
const OUT = path.join(__dirname, 'Manual_Usuario_NIRM_GROUP.pdf');

// Embed screenshots as base64 so the HTML works as a standalone file
function img(filename) {
  const p = path.join(SHOTS, filename);
  if (!fs.existsSync(p)) return `<div class="img-missing">📷 Imagen no disponible: ${filename}</div>`;
  const data = fs.readFileSync(p).toString('base64');
  return `<img src="data:image/png;base64,${data}" alt="${filename}">`;
}

function figure(filename, caption) {
  return `<figure>${img(filename)}<figcaption>${caption}</figcaption></figure>`;
}

const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Manual de Usuario — NIRM GROUP Enterprise VMS</title>
<style>
  /* ── Reset & Base ─────────────────────────────────────── */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.6;
    color: #1f2937;
    background: white;
  }

  /* ── Page layout (A4) ─────────────────────────────────── */
  .page {
    width: 210mm;
    min-height: 297mm;
    padding: 18mm 16mm 22mm 16mm;
    margin: 0 auto;
    position: relative;
    page-break-after: always;
    break-after: page;
  }

  .page:last-child {
    page-break-after: avoid;
    break-after: avoid;
  }

  @page {
    size: A4;
    margin: 0;
  }

  @media print {
    body { margin: 0; }
    .page { page-break-after: always; break-after: page; }
    .page:last-child { page-break-after: avoid; break-after: avoid; }
  }

  /* ── Cover page ───────────────────────────────────────── */
  .cover {
    background: linear-gradient(160deg, #1e3a5f 0%, #0f2240 100%);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    color: white;
    padding: 0;
  }

  .cover-inner {
    padding: 40mm 20mm;
    width: 100%;
  }

  .cover-logo { font-size: 46pt; font-weight: 900; letter-spacing: 3px; color: #ffffff; margin-bottom: 4mm; }
  .cover-sub  { font-size: 18pt; color: #93c5fd; margin-bottom: 12mm; font-weight: 300; }
  .cover-divider { width: 40mm; height: 3px; background: #2563eb; margin: 0 auto 10mm; border-radius: 2px; }
  .cover-title { font-size: 28pt; font-weight: 700; color: #ffffff; margin-bottom: 3mm; }
  .cover-desc  { font-size: 12pt; color: #cbd5e1; margin-bottom: 14mm; }
  .cover-badge {
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 8px;
    padding: 8mm 12mm;
    margin: 0 auto 12mm;
    display: inline-block;
  }
  .cover-badge p { color: #94a3b8; font-size: 9pt; margin-bottom: 2mm; letter-spacing: 1px; text-transform: uppercase; }
  .cover-badge h3 { color: white; font-size: 12pt; font-weight: 600; }
  .cover-version { font-size: 9pt; color: #64748b; }
  .cover-url { font-size: 10pt; color: #475569; margin-top: 2mm; }
  .cover-footer {
    position: absolute;
    bottom: 10mm;
    left: 0; right: 0;
    text-align: center;
    font-size: 8pt;
    color: #334155;
  }

  /* ── TOC page ─────────────────────────────────────────── */
  .toc h1 { font-size: 22pt; color: #1e3a5f; border-bottom: 3px solid #2563eb; padding-bottom: 3mm; margin-bottom: 8mm; }
  .toc-list { list-style: none; }
  .toc-list li { display: flex; justify-content: space-between; align-items: baseline; padding: 2.5mm 0; border-bottom: 1px dotted #e5e7eb; }
  .toc-list li.section { font-weight: 700; color: #1e3a5f; font-size: 11.5pt; margin-top: 4mm; border-bottom: 1px solid #bfdbfe; padding-bottom: 2mm; }
  .toc-list li.subsection { padding-left: 8mm; color: #374151; font-size: 10.5pt; }
  .toc-num { color: #6b7280; font-size: 9.5pt; white-space: nowrap; min-width: 16mm; text-align: right; }

  /* ── Section header band ──────────────────────────────── */
  .section-header {
    background: #1e3a5f;
    color: white;
    padding: 5mm 6mm;
    border-radius: 4px;
    margin-bottom: 6mm;
  }
  .section-header h1 { font-size: 17pt; font-weight: 700; margin-bottom: 1mm; }
  .section-header p  { font-size: 9.5pt; color: #93c5fd; }

  /* ── Sub-headers ──────────────────────────────────────── */
  h2 {
    font-size: 13pt;
    color: #2563eb;
    font-weight: 700;
    margin: 7mm 0 3mm;
    padding-bottom: 1.5mm;
    border-bottom: 2px solid #dbeafe;
  }

  h3 {
    font-size: 11pt;
    color: #1e3a5f;
    font-weight: 700;
    margin: 5mm 0 2mm;
  }

  /* ── Body text ────────────────────────────────────────── */
  p {
    margin-bottom: 4mm;
    text-align: justify;
    hyphens: auto;
  }

  /* ── Figures / screenshots ────────────────────────────── */
  figure {
    margin: 5mm 0 6mm;
    text-align: center;
    page-break-inside: avoid;
    break-inside: avoid;
  }

  figure img {
    max-width: 100%;
    max-height: 100mm;
    object-fit: contain;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.10);
    display: block;
    margin: 0 auto;
  }

  figcaption {
    background: #f3f6fb;
    color: #6b7280;
    font-size: 8.5pt;
    font-style: italic;
    padding: 1.5mm 3mm;
    border-radius: 0 0 4px 4px;
    text-align: left;
    margin-top: 1mm;
  }

  .img-missing {
    background: #fef2f2;
    color: #ef4444;
    padding: 4mm;
    border-radius: 4px;
    font-size: 9pt;
    text-align: center;
    margin: 3mm 0;
  }

  /* ── Callout boxes ────────────────────────────────────── */
  .note {
    background: #eff6ff;
    border-left: 4px solid #2563eb;
    padding: 3mm 4mm;
    border-radius: 0 4px 4px 0;
    margin: 4mm 0;
    font-size: 10pt;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .note strong { color: #1d4ed8; }

  .warning {
    background: #fefce8;
    border-left: 4px solid #f59e0b;
    padding: 3mm 4mm;
    border-radius: 0 4px 4px 0;
    margin: 4mm 0;
    font-size: 10pt;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .warning strong { color: #92400e; }

  .success {
    background: #f0fdf4;
    border-left: 4px solid #22c55e;
    padding: 3mm 4mm;
    border-radius: 0 4px 4px 0;
    margin: 4mm 0;
    font-size: 10pt;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .success strong { color: #15803d; }

  /* ── Step lists ────────────────────────────────────────── */
  ol.steps {
    list-style: none;
    counter-reset: step-counter;
    margin: 3mm 0 5mm;
  }
  ol.steps li {
    counter-increment: step-counter;
    display: flex;
    gap: 3mm;
    margin-bottom: 2.5mm;
    align-items: flex-start;
    font-size: 10.5pt;
  }
  ol.steps li::before {
    content: counter(step-counter);
    background: #2563eb;
    color: white;
    font-weight: 700;
    font-size: 8.5pt;
    min-width: 5.5mm;
    height: 5.5mm;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-top: 0.5mm;
  }

  /* ── Role chips ────────────────────────────────────────── */
  .role-row {
    display: flex;
    gap: 3mm;
    margin: 4mm 0;
    flex-wrap: wrap;
  }
  .role-card {
    flex: 1;
    min-width: 45mm;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 3mm 4mm;
    background: #f8fafc;
  }
  .role-card .chip {
    display: inline-block;
    background: #1e3a5f;
    color: white;
    font-size: 8pt;
    font-weight: 700;
    padding: 1mm 2.5mm;
    border-radius: 3px;
    letter-spacing: 0.5px;
    margin-bottom: 1.5mm;
  }
  .role-card p { font-size: 9.5pt; color: #374151; margin: 0; text-align: left; }

  /* ── Table ─────────────────────────────────────────────── */
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10pt;
    margin: 4mm 0;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  th {
    background: #1e3a5f;
    color: white;
    padding: 2.5mm 3mm;
    text-align: left;
    font-weight: 600;
    font-size: 9.5pt;
  }
  td {
    padding: 2.5mm 3mm;
    border-bottom: 1px solid #e5e7eb;
    vertical-align: top;
  }
  tr:nth-child(even) td { background: #f8fafc; }

  /* ── Flow diagram ─────────────────────────────────────── */
  .flow {
    display: flex;
    align-items: center;
    gap: 1mm;
    flex-wrap: wrap;
    margin: 4mm 0;
    justify-content: center;
  }
  .flow-step {
    background: #1e3a5f;
    color: white;
    padding: 2.5mm 4mm;
    border-radius: 5px;
    font-size: 9pt;
    font-weight: 600;
    text-align: center;
    min-width: 22mm;
  }
  .flow-arrow { color: #2563eb; font-size: 14pt; font-weight: 700; }

  /* ── Two-column grid ──────────────────────────────────── */
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; margin: 4mm 0; }
  .two-col figure { margin: 0; }

  /* ── Footer ───────────────────────────────────────────── */
  .page-footer {
    position: absolute;
    bottom: 8mm;
    left: 16mm;
    right: 16mm;
    display: flex;
    justify-content: space-between;
    font-size: 8pt;
    color: #9ca3af;
    border-top: 1px solid #e5e7eb;
    padding-top: 2mm;
  }

  /* ── Back cover ───────────────────────────────────────── */
  .backcover {
    background: #0f172a;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    color: #475569;
    padding: 0;
  }

  /* ── Utility ──────────────────────────────────────────── */
  .text-center { text-align: center; }
  .mt-sm { margin-top: 3mm; }
  .mt-md { margin-top: 6mm; }
  .url-box {
    text-align: center;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    border-radius: 6px;
    padding: 3mm;
    font-size: 13pt;
    font-weight: 700;
    color: #1d4ed8;
    margin: 4mm 0;
    letter-spacing: 0.5px;
  }
</style>
</head>
<body>

<!-- ═══════════════════════════ PORTADA ════════════════════════════════ -->
<div class="page cover">
  <div class="cover-inner">
    <div class="cover-logo">NIRM GROUP</div>
    <div class="cover-sub">Enterprise VMS — Portal de Seguridad</div>
    <div class="cover-divider"></div>
    <div class="cover-title">Manual de Usuario</div>
    <div class="cover-desc">Guía completa de operación e instalación de clientes</div>
    <div class="cover-badge">
      <p>Roles documentados</p>
      <h3>Administrador &nbsp;·&nbsp; Instalador &nbsp;·&nbsp; Cliente</h3>
    </div>
    <div class="cover-version">Versión 1.0 &nbsp;—&nbsp; Mayo 2026</div>
    <div class="cover-url">https://nirmgroup.net</div>
  </div>
  <div class="cover-footer">Documento confidencial — Uso interno NIRM GROUP</div>
</div>

<!-- ═══════════════════════════ ÍNDICE ════════════════════════════════ -->
<div class="page toc">
  <h1>Contenido</h1>
  <ul class="toc-list">
    <li class="section"><span>1. Introducción y Acceso al Sistema</span><span class="toc-num">3</span></li>
    <li class="section"><span>2. ROL: ADMINISTRADOR</span><span class="toc-num"></span></li>
    <li class="subsection"><span>2.1 Inicio de Sesión</span><span class="toc-num">4</span></li>
    <li class="subsection"><span>2.2 Dashboard — Panel Principal</span><span class="toc-num">5</span></li>
    <li class="subsection"><span>2.3 Gateways</span><span class="toc-num">6</span></li>
    <li class="subsection"><span>2.4 Clientes Corporativos</span><span class="toc-num">7</span></li>
    <li class="subsection"><span>2.5 Cámaras IP — Vista NVR</span><span class="toc-num">9</span></li>
    <li class="subsection"><span>2.6 Grabaciones</span><span class="toc-num">10</span></li>
    <li class="subsection"><span>2.7 Control de Accesos (Usuarios)</span><span class="toc-num">11</span></li>
    <li class="subsection"><span>2.8 Registro de Auditoría</span><span class="toc-num">12</span></li>
    <li class="section"><span>3. ALTA DE NUEVO CLIENTE — FLUJO COMPLETO</span><span class="toc-num"></span></li>
    <li class="subsection"><span>3.0 Checklist — Información necesaria antes de empezar</span><span class="toc-num">13</span></li>
    <li class="subsection"><span>3.1 Crear el Cliente Corporativo</span><span class="toc-num">14</span></li>
    <li class="subsection"><span>3.2 Wizard Paso 1 — Selección de Cliente</span><span class="toc-num">16</span></li>
    <li class="subsection"><span>3.3 Wizard Paso 2 — Configurar el Gateway</span><span class="toc-num">17</span></li>
    <li class="subsection"><span>3.4 Wizard Paso 3 — Configurar DVR/Cámaras</span><span class="toc-num">19</span></li>
    <li class="subsection"><span>3.5 Wizard Paso 4 — Generación de Archivos</span><span class="toc-num">21</span></li>
    <li class="subsection"><span>3.6 Wizard Paso 5 — Despliegue y Verificación Final</span><span class="toc-num">22</span></li>
    <li class="section"><span>4. ROL: INSTALADOR</span><span class="toc-num"></span></li>
    <li class="subsection"><span>4.1 Dashboard del Instalador</span><span class="toc-num">19</span></li>
    <li class="subsection"><span>4.2 Gestión de Clientes</span><span class="toc-num">20</span></li>
    <li class="section"><span>5. ROL: CLIENTE — Portal de Seguridad</span><span class="toc-num"></span></li>
    <li class="subsection"><span>5.1 Mis Cámaras</span><span class="toc-num">21</span></li>
    <li class="subsection"><span>5.2 Mis Grabaciones</span><span class="toc-num">22</span></li>
    <li class="subsection"><span>5.3 Mi Cuenta</span><span class="toc-num">23</span></li>
    <li class="section"><span>6. Preguntas Frecuentes</span><span class="toc-num">24</span></li>
  </ul>
  <div class="page-footer"><span>NIRM GROUP — Manual de Usuario v1.0</span><span>Confidencial</span></div>
</div>

<!-- ═══════════════════════════ 1. INTRODUCCIÓN ════════════════════════ -->
<div class="page">
  <div class="section-header">
    <h1>1. Introducción y Acceso al Sistema</h1>
    <p>NIRM GROUP Enterprise VMS — Portal de Seguridad</p>
  </div>

  <p>El sistema <strong>NIRM GROUP Enterprise VMS</strong> es una plataforma de videovigilancia empresarial que permite monitorear cámaras IP en tiempo real, gestionar grabaciones y administrar usuarios desde cualquier navegador web moderno, sin necesidad de instalar software adicional.</p>

  <h2>URL del sistema</h2>
  <div class="url-box">https://nirmgroup.net</div>

  <h2>Roles del sistema</h2>
  <div class="role-row">
    <div class="role-card">
      <div class="chip">ADMINISTRADOR</div>
      <p>Acceso total: gestiona cámaras, clientes, usuarios, auditoría y el wizard de alta de nuevos sitios.</p>
    </div>
    <div class="role-card">
      <div class="chip">INSTALADOR</div>
      <p>Crea y da seguimiento a sus propios clientes. Puede consultar todos los clientes del sistema en modo lectura.</p>
    </div>
    <div class="role-card">
      <div class="chip">CLIENTE</div>
      <p>Portal personal simplificado: visualiza únicamente sus cámaras asignadas y sus grabaciones.</p>
    </div>
  </div>

  <div class="note"><strong>NOTA:</strong> El sistema usa sesiones con token JWT. Si cierras el navegador completamente, deberás iniciar sesión nuevamente al volver a abrir la página.</div>

  <h2>Flujo general del sistema</h2>
  <div class="flow">
    <div class="flow-step">Admin crea<br>cliente</div>
    <span class="flow-arrow">→</span>
    <div class="flow-step">Wizard<br>configura gateway</div>
    <span class="flow-arrow">→</span>
    <div class="flow-step">Cámaras<br>activas</div>
    <span class="flow-arrow">→</span>
    <div class="flow-step">Cliente accede<br>al portal</div>
    <span class="flow-arrow">→</span>
    <div class="flow-step">Monitoreo<br>y grabaciones</div>
  </div>

  <div class="page-footer"><span>NIRM GROUP — Manual de Usuario v1.0</span><span>Sección 1 — Introducción</span></div>
</div>

<!-- ═══════════════════════════ 2. ADMINISTRADOR ══════════════════════ -->

<!-- 2.1 Login -->
<div class="page">
  <div class="section-header">
    <h1>2. ROL: ADMINISTRADOR</h1>
    <p>Acceso completo a todas las funciones del sistema</p>
  </div>

  <h2>2.1 Inicio de Sesión</h2>
  <p>Para acceder al sistema, ingresa tu correo electrónico y contraseña en la pantalla de inicio. Una vez autenticado, el sistema te redirigirá automáticamente al Dashboard.</p>

  <ol class="steps">
    <li>Abre tu navegador y ve a <strong>https://nirmgroup.net</strong></li>
    <li>Escribe tu correo electrónico en el primer campo</li>
    <li>Escribe tu contraseña en el segundo campo</li>
    <li>Haz clic en el botón <strong>"Iniciar Sesión"</strong></li>
  </ol>

  ${figure('01-login-filled.png', 'Pantalla de inicio de sesión con credenciales ingresadas')}

  <div class="warning"><strong>IMPORTANTE:</strong> Si aparece el mensaje "Credenciales inválidas", verifica que el correo no tenga espacios y que la contraseña sea correcta. Si olvidaste tu contraseña, contacta al administrador del sistema para que te reenvíe una invitación.</div>

  <div class="page-footer"><span>NIRM GROUP — Manual de Usuario v1.0</span><span>Sección 2.1 — Inicio de Sesión</span></div>
</div>

<!-- 2.2 Dashboard -->
<div class="page">
  <h2>2.2 Dashboard — Panel Principal</h2>
  <p>El Dashboard es la pantalla principal del sistema. Muestra un resumen del estado actual: número de cámaras activas y offline, grabaciones recientes y el estado de los gateways conectados. En la barra lateral izquierda se encuentra el menú de navegación con acceso a todas las secciones.</p>

  ${figure('02-admin-dashboard.png', 'Dashboard — Panel principal del Administrador con resumen del sistema')}

  <h3>Menú de navegación</h3>
  <table>
    <tr><th>Sección</th><th>Descripción</th></tr>
    <tr><td><strong>Dashboard</strong></td><td>Resumen general del estado del sistema</td></tr>
    <tr><td><strong>Cámaras</strong></td><td>Vista NVR por cliente — monitoreo en tiempo real</td></tr>
    <tr><td><strong>Grabaciones</strong></td><td>Historial de video grabado con filtros</td></tr>
    <tr><td><strong>Gateways</strong></td><td>Estado de los equipos de campo (Raspberry Pi)</td></tr>
    <tr><td><strong>Clientes</strong></td><td>Gestión de organizaciones corporativas</td></tr>
    <tr><td><strong>Control de Accesos</strong></td><td>Administración de usuarios y permisos</td></tr>
    <tr><td><strong>Wizard / Alta</strong></td><td>Asistente para registrar nuevos gateways</td></tr>
  </table>

  <div class="page-footer"><span>NIRM GROUP — Manual de Usuario v1.0</span><span>Sección 2.2 — Dashboard</span></div>
</div>

<!-- 2.3 Gateways -->
<div class="page">
  <h2>2.3 Gateways</h2>
  <p>Los Gateways son los equipos de campo (Raspberry Pi) instalados físicamente en cada ubicación del cliente. Desde esta sección puedes verificar el estado de conexión de cada gateway y cuándo fue su última actividad registrada.</p>

  ${figure('03-admin-gateways.png', 'Lista de Gateways con indicador de estado de conexión')}

  <div class="note"><strong>NOTA:</strong> Un gateway en estado <strong style="color:#22c55e">ACTIVO</strong> (verde) está conectado y enviando datos al servidor. Un gateway en estado <strong style="color:#ef4444">OFFLINE</strong> (rojo) indica que ha perdido la conexión — puede deberse a un corte de internet en el sitio del cliente.</div>

  <div class="warning"><strong>IMPORTANTE:</strong> Si un gateway está offline durante más de 30 minutos, comunícate con el instalador responsable para verificar la conexión a internet en el sitio físico.</div>

  <div class="page-footer"><span>NIRM GROUP — Manual de Usuario v1.0</span><span>Sección 2.3 — Gateways</span></div>
</div>

<!-- 2.4 Clientes -->
<div class="page">
  <h2>2.4 Clientes Corporativos</h2>
  <p>La sección de Clientes muestra todas las organizaciones registradas en el sistema. Cada cliente corporativo tiene asociadas sus cámaras de seguridad, un usuario de acceso al portal cliente, y en su caso, el instalador responsable.</p>

  ${figure('04-admin-clients.png', 'Lista de clientes corporativos registrados en el sistema')}

  <h3>Detalle de cliente</h3>
  <p>Haz clic en el nombre de cualquier cliente para ver su información completa: datos de contacto, cámaras asignadas, estado del servicio y acceso al portal.</p>

  ${figure('05-admin-client-detail.png', 'Vista de detalle de un cliente corporativo con sus datos y cámaras')}

  <div class="page-footer"><span>NIRM GROUP — Manual de Usuario v1.0</span><span>Sección 2.4 — Clientes</span></div>
</div>

<!-- 2.5 Cámaras -->
<div class="page">
  <h2>2.5 Cámaras IP — Vista NVR</h2>
  <p>La sección de Cámaras muestra todos los clientes activos. Selecciona un cliente para ingresar a su vista NVR (Network Video Recorder), donde verás en tiempo real todas las cámaras de esa ubicación.</p>

  ${figure('06-admin-cameras.png', 'Selector de cliente para acceder a la vista NVR')}

  <h3>Vista NVR por cliente</h3>
  <p>La vista NVR muestra las cámaras en una cuadrícula. Las cámaras con indicador verde transmiten video en vivo. Haz clic en cualquier cámara para verla en pantalla completa.</p>

  ${figure('07-admin-nvr-view.png', 'Vista NVR — Cuadrícula de cámaras del cliente en tiempo real')}

  <div class="note"><strong>NOTA:</strong> Las cámaras que aparecen en gris están offline. Esto puede indicar que el gateway está desconectado o que la cámara física tiene un problema de energía o red en el sitio del cliente.</div>

  <div class="page-footer"><span>NIRM GROUP — Manual de Usuario v1.0</span><span>Sección 2.5 — Cámaras NVR</span></div>
</div>

<!-- 2.6 Grabaciones -->
<div class="page">
  <h2>2.6 Grabaciones</h2>
  <p>El módulo de grabaciones permite consultar y descargar los videos grabados por el sistema. Las grabaciones se almacenan en el servidor central y se organizan por cliente, cámara y fecha.</p>

  ${figure('08-admin-recordings.png', 'Módulo de grabaciones con filtros por cliente, cámara y rango de fechas')}

  <ol class="steps">
    <li>Selecciona el <strong>cliente</strong> en el filtro de la parte superior</li>
    <li>Elige la <strong>cámara</strong> específica o deja "Todas"</li>
    <li>Define el <strong>rango de fechas</strong> que deseas consultar</li>
    <li>Haz clic en <strong>"Buscar"</strong> para listar los clips disponibles</li>
    <li>Usa el botón de <strong>descarga</strong> junto a cada clip para guardarlo</li>
  </ol>

  <div class="warning"><strong>IMPORTANTE:</strong> El almacenamiento de grabaciones es limitado. Las grabaciones más antiguas se eliminan automáticamente cuando el disco alcanza su límite de capacidad. Descarga los clips importantes a tiempo.</div>

  <div class="page-footer"><span>NIRM GROUP — Manual de Usuario v1.0</span><span>Sección 2.6 — Grabaciones</span></div>
</div>

<!-- 2.7 Usuarios -->
<div class="page">
  <h2>2.7 Control de Accesos — Usuarios</h2>
  <p>Desde esta sección el administrador gestiona todos los usuarios del sistema: administradores, instaladores y clientes. Puedes crear nuevos usuarios, activar o desactivar cuentas, y reenviar invitaciones a quienes olvidaron su contraseña.</p>

  ${figure('09-admin-users.png', 'Panel de control de accesos — lista de todos los usuarios del sistema')}

  <h3>Crear nuevo usuario</h3>
  <ol class="steps">
    <li>Haz clic en <strong>"Nuevo Usuario"</strong> o <strong>"Invitar"</strong></li>
    <li>Ingresa el correo electrónico del nuevo usuario</li>
    <li>Selecciona el rol: <strong>admin</strong>, <strong>installer</strong> o <strong>client</strong></li>
    <li>El sistema genera automáticamente una contraseña temporal y envía un correo de invitación</li>
    <li>El usuario debe cambiar su contraseña en el primer inicio de sesión</li>
  </ol>

  <h3>Reenviar invitación</h3>
  <p>Si un usuario olvidó su contraseña o no recibió el correo de invitación, localízalo en la lista y haz clic en <strong>"Reenviar invitación"</strong>. El sistema generará una nueva contraseña temporal y la enviará a su correo.</p>

  <div class="page-footer"><span>NIRM GROUP — Manual de Usuario v1.0</span><span>Sección 2.7 — Control de Accesos</span></div>
</div>

<!-- 2.8 Auditoría -->
<div class="page">
  <h2>2.8 Registro de Auditoría</h2>
  <p>El registro de auditoría muestra un historial completo e inmutable de las acciones realizadas en el sistema: creación de clientes, cambios de acceso, consultas a clientes ajenos por instaladores, y otras operaciones sensibles.</p>

  ${figure('10-admin-audit-log.png', 'Registro de auditoría — historial de acciones con filtros por fecha y tipo')}

  <div class="note"><strong>NOTA:</strong> El log de auditoría es de solo lectura y no puede modificarse. Es la herramienta principal para saber quién realizó qué acción y en qué momento. Útil para resolución de incidencias.</div>

  <h3>Acciones registradas automáticamente</h3>
  <table>
    <tr><th>Acción</th><th>Cuándo se registra</th></tr>
    <tr><td>Crear cliente</td><td>Cuando admin o instalador crea un nuevo cliente corporativo</td></tr>
    <tr><td>Crear usuario cliente</td><td>Cuando se asigna acceso portal a un cliente</td></tr>
    <tr><td>Acceso a cliente ajeno</td><td>Cuando un instalador consulta clientes que no son suyos</td></tr>
  </table>

  <div class="page-footer"><span>NIRM GROUP — Manual de Usuario v1.0</span><span>Sección 2.8 — Auditoría</span></div>
</div>

<!-- ═══════════════════════════ 3. ALTA CLIENTE COMPLETO ══════════════ -->
<div class="page">
  <div class="section-header">
    <h1>3. Alta de Nuevo Cliente — Flujo Completo</h1>
    <p>Guía paso a paso: desde cero hasta que el cliente ve sus cámaras en vivo</p>
  </div>

  <p>Esta sección te lleva de la mano por todo el proceso para registrar un cliente nuevo, instalar su gateway y dejar sus cámaras activas. Son <strong>6 pasos en total</strong>: primero creas al cliente en el sistema y después usas el Wizard para configurar el equipo de campo.</p>

  <div class="flow">
    <div class="flow-step">① Crear<br>cliente</div>
    <span class="flow-arrow">→</span>
    <div class="flow-step">② Wizard<br>Cliente</div>
    <span class="flow-arrow">→</span>
    <div class="flow-step">③ Wizard<br>Gateway</div>
    <span class="flow-arrow">→</span>
    <div class="flow-step">④ Wizard<br>DVR/Cámaras</div>
    <span class="flow-arrow">→</span>
    <div class="flow-step">⑤ Wizard<br>Archivos</div>
    <span class="flow-arrow">→</span>
    <div class="flow-step">⑥ Wizard<br>Despliegue</div>
  </div>

  <h2>Antes de empezar — Checklist de información necesaria</h2>
  <p>Reúne estos datos antes de iniciar el proceso. Sin ellos no podrás completar la instalación:</p>

  <table>
    <tr><th>Dato necesario</th><th>Dónde obtenerlo</th><th>Ejemplo</th></tr>
    <tr><td><strong>Nombre de la empresa cliente</strong></td><td>Contrato o acuerdo de servicio</td><td>Farmacia San Miguel S.A. de C.V.</td></tr>
    <tr><td><strong>Correo del cliente</strong></td><td>Contacto del cliente — recibirá sus credenciales aquí</td><td>contacto@farmaciasanmiguel.mx</td></tr>
    <tr><td><strong>Teléfono y dirección</strong></td><td>Datos de la empresa (opcionales pero recomendados)</td><td>Tel. 555-1234, Av. Principal 10</td></tr>
    <tr><td><strong>ID del gateway (Raspberry Pi)</strong></td><td>Etiqueta física del equipo — MAC con guiones o nombre descriptivo</td><td><code>b8-27-eb-1a-2b-3c</code></td></tr>
    <tr><td><strong>IP del DVR/NVR en el sitio</strong></td><td>Configuración del router del cliente o del DVR mismo</td><td>192.168.1.154</td></tr>
    <tr><td><strong>Usuario y contraseña del DVR</strong></td><td>Manual o sticker del equipo DVR</td><td>admin / Admin2024!</td></tr>
    <tr><td><strong>Marca del DVR</strong></td><td>Etiqueta del equipo (frente o parte trasera)</td><td>Dahua, Hikvision o Genérico</td></tr>
  </table>

  <div class="warning"><strong>¡IMPORTANTE antes de instalar!</strong> La Raspberry Pi (gateway) debe estar encendida, conectada a internet y en la misma red local que el DVR del cliente antes de iniciar el Wizard. Si el gateway no tiene conexión, el despliegue final fallará.</div>

  <div class="page-footer"><span>NIRM GROUP — Manual de Usuario v1.0</span><span>Sección 3 — Alta de Nuevo Cliente</span></div>
</div>

<!-- 3.1 Crear Cliente -->
<div class="page">
  <h2>3.1 Crear el Cliente Corporativo</h2>
  <p>El primer paso es registrar a la empresa cliente en el sistema. Este registro crea el perfil corporativo y genera automáticamente las credenciales de acceso al portal web del cliente. <strong>Este paso se hace ANTES de abrir el Wizard.</strong></p>

  <ol class="steps">
    <li>En el menú lateral, haz clic en <strong>"Clientes"</strong> (ícono de personas)</li>
    <li>Haz clic en el botón <strong>"Añadir Nuevo Cliente"</strong> o <strong>"+ Nuevo"</strong> en la parte superior derecha</li>
    <li>Se abrirá un formulario de dos pasos — completa todos los campos marcados con asterisco (*)</li>
    <li>En <strong>"Paso 1 del formulario"</strong>: llena el nombre de la empresa, teléfono y dirección</li>
    <li>En <strong>"Paso 2 del formulario"</strong>: ingresa el <strong>correo electrónico del cliente</strong> — este será su usuario de acceso al portal</li>
    <li>Haz clic en <strong>"Guardar"</strong> o <strong>"Crear Cliente"</strong></li>
  </ol>

  ${figure('form-nuevo-cliente-paso1.png', 'Formulario Paso 1 — Datos de la empresa: nombre, teléfono, dirección y contacto principal')}

  <div class="note"><strong>¿Qué hace el sistema al guardar?</strong> Crea el perfil corporativo, genera una contraseña temporal segura y envía automáticamente un correo al cliente con su usuario y contraseña para acceder al portal en <strong>https://nirmgroup.net</strong>. El cliente deberá cambiar esa contraseña en su primer inicio de sesión.</div>

  <div class="page-footer"><span>NIRM GROUP — Manual de Usuario v1.0</span><span>Sección 3.1 — Crear Cliente Corporativo</span></div>
</div>

<div class="page">
  ${figure('form-nuevo-cliente-paso2.png', 'Formulario Paso 2 — Correo del cliente: este será su usuario de acceso al portal')}

  <h3>Qué significa cada campo</h3>
  <table>
    <tr><th>Campo</th><th>Qué escribir</th><th>Por qué es importante</th></tr>
    <tr><td><strong>Nombre de la empresa *</strong></td><td>Razón social completa</td><td>Aparece en el panel de administración y en los reportes</td></tr>
    <tr><td><strong>Teléfono</strong></td><td>Número de contacto del cliente</td><td>Referencia para comunicación con el cliente</td></tr>
    <tr><td><strong>Dirección</strong></td><td>Ubicación física del cliente</td><td>Ayuda a identificar el sitio en instalaciones múltiples</td></tr>
    <tr><td><strong>Correo electrónico *</strong></td><td>Email válido del cliente</td><td>Aquí llegan las credenciales — debe ser un correo que el cliente revise</td></tr>
    <tr><td><strong>Nombre del contacto</strong></td><td>Nombre de la persona responsable</td><td>Referencia interna para soporte técnico</td></tr>
  </table>

  ${figure('form-cliente-creado.png', 'Confirmación — El cliente aparece registrado en la lista de clientes del sistema')}

  <div class="success"><strong>RESULTADO ESPERADO:</strong> El cliente aparece en la lista de Clientes con su nombre y estado activo. Simultáneamente, el cliente recibe un correo con su usuario y contraseña temporal. <strong>Ya puedes continuar con el Wizard.</strong></div>

  <div class="warning"><strong>Si el correo no llega:</strong> Verifica que la dirección ingresada sea correcta. El correo puede tardar hasta 5 minutos. Si sigue sin llegar, puedes ir a <strong>"Control de Accesos"</strong>, buscar al usuario del cliente y hacer clic en <strong>"Reenviar invitación"</strong>.</div>

  <div class="page-footer"><span>NIRM GROUP — Manual de Usuario v1.0</span><span>Sección 3.1 — Crear Cliente Corporativo</span></div>
</div>

<!-- 3.2 Wizard Paso 1 -->
<div class="page">
  <h2>3.2 Wizard — Paso 1 de 5: Seleccionar Cliente</h2>
  <p>Con el cliente ya registrado, ahora abre el Wizard. Este asistente de 5 pasos te guía para vincular un gateway físico (Raspberry Pi) al cliente y configurar sus cámaras. <strong>Cada paso se desbloquea solo cuando el anterior está completo.</strong></p>

  <ol class="steps">
    <li>En el menú lateral, haz clic en <strong>"Wizard / Alta"</strong></li>
    <li>Verás la pantalla dividida en 5 pestañas en la parte superior: <em>Cliente — Gateway — Instalación — Archivos — Despliegue</em></li>
    <li>En el campo <strong>"Cliente"</strong>, haz clic en el selector y elige al cliente que acabas de crear</li>
    <li>Confirma que el nombre sea el correcto en el selector</li>
    <li>Haz clic en <strong>"Siguiente →"</strong></li>
  </ol>

  ${figure('wizard-01-cliente.png', 'Wizard Paso 1 — Selector de cliente. El indicador superior muestra en qué paso estás')}

  <h3>Barra de progreso del Wizard</h3>
  <table>
    <tr><th>Indicador</th><th>Significado</th></tr>
    <tr><td>Número en círculo azul (ej. <strong>1</strong>)</td><td>Paso actual — en el que estás trabajando ahora</td></tr>
    <tr><td>Palomita ✓ en verde</td><td>Paso completado — ya no necesitas regresar aquí</td></tr>
    <tr><td>Número en gris</td><td>Paso pendiente — todavía no disponible</td></tr>
  </table>

  <div class="note"><strong>¿Equivocaste el cliente?</strong> Mientras estés en el Paso 1, simplemente vuelve a seleccionar el correcto en el desplegable. Una vez que hayas avanzado al Paso 2, puedes regresar con el botón <strong>"← Anterior"</strong> para corregirlo.</div>

  <div class="note"><strong>¿No aparece el cliente en la lista?</strong> Significa que aún no fue creado en la sección Clientes. Cierra el Wizard, ve a Clientes, crea al cliente siguiendo el punto 3.1 y vuelve al Wizard.</div>

  <div class="page-footer"><span>NIRM GROUP — Manual de Usuario v1.0</span><span>Sección 3.2 — Wizard Paso 1: Seleccionar Cliente</span></div>
</div>

<!-- 3.3 Wizard Paso 2 -->
<div class="page">
  <h2>3.3 Wizard — Paso 2 de 5: Configurar el Gateway</h2>
  <p>En este paso registras o seleccionas la <strong>Raspberry Pi</strong> que está instalada físicamente en el sitio del cliente. Esta es la computadora de campo que captura las cámaras y las transmite al servidor.</p>

  <h3>¿Gateway nuevo o existente?</h3>
  <table>
    <tr><th>Botón</th><th>Cuándo usarlo</th></tr>
    <tr><td><strong>"Existente"</strong></td><td>La Raspberry Pi ya fue instalada antes. Solo necesitas regenerar o actualizar sus archivos de configuración (por ejemplo, si cambiaron las cámaras o la contraseña del DVR).</td></tr>
    <tr><td><strong>"+ Nuevo"</strong></td><td>Es la primera vez que se instala este gateway. Debes registrar su ID y crear un token de acceso nuevo.</td></tr>
  </table>

  <h3>Si eliges "+ Nuevo" — Cómo llenar cada campo</h3>
  <table>
    <tr><th>Campo</th><th>Qué escribir</th><th>Ejemplo</th></tr>
    <tr><td><strong>Nombre del punto *</strong></td><td>Nombre que identifique la ubicación. Usa algo descriptivo que no se confunda con otros gateways del sistema.</td><td>Farmacia San Miguel - Sucursal Centro</td></tr>
    <tr><td><strong>ID del dispositivo *</strong></td><td>La MAC address de la Raspberry Pi o un nombre descriptivo único. <strong>Si usas MAC: siempre con guiones (-), nunca con dos puntos (:).</strong></td><td><code>b8-27-eb-1a-2b-3c</code></td></tr>
    <tr><td><strong>Token de acceso *</strong></td><td>Contraseña que usa el gateway para conectarse al servidor. Haz clic en <strong>"Generar"</strong> y el sistema crea uno seguro automáticamente. <strong>Cópialo antes de continuar.</strong></td><td>(generado automáticamente)</td></tr>
    <tr><td><strong>Ubicación</strong></td><td>Descripción física opcional. Útil si hay varios equipos en el mismo edificio.</td><td>Recepción, junto al escritorio de caja</td></tr>
  </table>

  ${figure('wizard-02-gateway.png', 'Wizard Paso 2 — Formulario de nuevo gateway con nombre, ID y token generado visible')}

  <div class="page-footer"><span>NIRM GROUP — Manual de Usuario v1.0</span><span>Sección 3.3 — Wizard Paso 2: Configurar Gateway</span></div>
</div>

<div class="page">
  <h3>Regla crítica — El ID del dispositivo</h3>
  <p>El ID del gateway es la pieza más importante de esta configuración. Un error aquí hace que el gateway nunca se conecte al servidor.</p>

  <table>
    <tr><th>Formato</th><th>Resultado</th></tr>
    <tr><td><code>b8-27-eb-1a-2b-3c</code> — guiones</td><td>✅ <strong>Correcto</strong> — el sistema genera el token correctamente y el gateway se conecta</td></tr>
    <tr><td><code>b8:27:eb:1a:2b:3c</code> — dos puntos</td><td>❌ <strong>Incorrecto</strong> — el token se genera mal y el gateway nunca es detectado</td></tr>
    <tr><td><code>farmacia-san-miguel</code> — nombre descriptivo</td><td>✅ <strong>Correcto</strong> — alternativa válida si no quieres usar MAC</td></tr>
    <tr><td><code>farmacia san miguel</code> — con espacios</td><td>❌ <strong>Incorrecto</strong> — los espacios no están permitidos en el ID</td></tr>
  </table>

  <div class="warning"><strong>¿Cómo encuentro la MAC de la Raspberry Pi?</strong> Conéctate a ella por SSH y ejecuta el comando <code>cat /sys/class/net/eth0/address</code>. El resultado se ve así: <code>b8:27:eb:1a:2b:3c</code> — al copiarlo al Wizard, reemplaza los <strong>:</strong> por <strong>-</strong>.</div>

  <h3>El Token de acceso — ¡No lo pierdas!</h3>
  <p>Al hacer clic en <strong>"Generar"</strong>, el sistema crea una cadena larga de caracteres (el token). <strong>Este token solo se muestra una vez en el Wizard.</strong> Después de avanzar al siguiente paso, no hay forma de recuperarlo desde la interfaz.</p>

  <div class="warning"><strong>ACCIÓN REQUERIDA:</strong> Antes de hacer clic en "Siguiente →", copia el token generado y guárdalo en un lugar seguro (bloc de notas, hoja de instalación del cliente). Lo necesitarás si alguna vez tienes que reinstalar el gateway o configurar el equipo manualmente.</div>

  <ol class="steps">
    <li>Llena el nombre del punto y el ID del dispositivo</li>
    <li>Haz clic en <strong>"Generar"</strong> para crear el token automáticamente</li>
    <li>Copia el token generado y guárdalo — es la única oportunidad de verlo</li>
    <li>Llena la ubicación (opcional)</li>
    <li>Haz clic en <strong>"Siguiente →"</strong></li>
  </ol>

  <div class="page-footer"><span>NIRM GROUP — Manual de Usuario v1.0</span><span>Sección 3.3 — Wizard Paso 2: Gateway (continuación)</span></div>
</div>

<!-- 3.4 Wizard Paso 3 -->
<div class="page">
  <h2>3.4 Wizard — Paso 3 de 5: Configurar la Instalación de Cámaras</h2>
  <p>Aquí le dices al sistema cómo están conectadas las cámaras en el sitio del cliente. El sistema ofrece tres tipos de instalación según el equipo del cliente.</p>

  <h3>Elige el tipo de instalación correcto</h3>
  <table>
    <tr><th>Tipo</th><th>Cuándo usarlo</th><th>Qué necesitas</th></tr>
    <tr><td><strong>DVR/NVR (automático)</strong></td><td>El cliente tiene un grabador de video (DVR o NVR) al que están conectadas todas sus cámaras. <strong>Es el caso más común.</strong></td><td>IP del DVR, usuario y contraseña del DVR</td></tr>
    <tr><td><strong>NVR (manual)</strong></td><td>Tienes un NVR pero quieres agregar las cámaras una por una en lugar de detectarlas automáticamente</td><td>IP de cada cámara individualmente</td></tr>
    <tr><td><strong>Cámaras IP</strong></td><td>Las cámaras están conectadas directamente a la red, sin DVR/NVR intermedio</td><td>IP de cada cámara y sus credenciales RTSP</td></tr>
  </table>

  ${figure('wizard-03-instalacion.png', 'Wizard Paso 3 — Los tres tipos de instalación disponibles. DVR/NVR es la opción más común')}

  <h3>Configuración DVR/NVR automático (caso más frecuente)</h3>
  <p>Selecciona <strong>"DVR/NVR (automático)"</strong> y llena el formulario que aparece debajo:</p>

  ${figure('wizard-03-instalacion-dvr.png', 'Wizard Paso 3 — Formulario de DVR: IP, puerto, marca del equipo y credenciales de acceso')}

  <div class="page-footer"><span>NIRM GROUP — Manual de Usuario v1.0</span><span>Sección 3.4 — Wizard Paso 3: Instalación de Cámaras</span></div>
</div>

<div class="page">
  <h3>Qué escribir en cada campo del DVR</h3>
  <table>
    <tr><th>Campo</th><th>Qué escribir</th><th>Cómo encontrarlo</th></tr>
    <tr><td><strong>IP del DVR/NVR *</strong></td><td>Dirección IP del grabador dentro de la red del cliente</td><td>Revisa el router del cliente (tabla de dispositivos conectados) o busca la IP en el menú del DVR → Red → Configuración IP</td></tr>
    <tr><td><strong>Puerto</strong></td><td>Puerto de comunicación del DVR. El valor por defecto es <strong>80</strong> para Dahua, <strong>80</strong> para Hikvision genérico. Cambia solo si el cliente lo modificó.</td><td>Viene en la configuración de red del DVR. Si no sabes, deja el valor por defecto (80).</td></tr>
    <tr><td><strong>Marca *</strong></td><td>Selecciona la marca del equipo DVR en el desplegable: <strong>Dahua</strong>, <strong>Hikvision</strong> o <strong>Genérico</strong></td><td>Etiqueta en la parte frontal o trasera del equipo grabador</td></tr>
    <tr><td><strong>Usuario *</strong></td><td>Usuario administrador del DVR. Por defecto suele ser <code>admin</code></td><td>Manual del DVR o sticker en el equipo. Si fue modificado, pregunta al cliente.</td></tr>
    <tr><td><strong>Contraseña</strong></td><td>Contraseña del DVR. Puede ser la que viene de fábrica o una personalizada</td><td>Manual del equipo. Si el cliente no la recuerda, puede resetearse físicamente desde el DVR.</td></tr>
  </table>

  <div class="warning"><strong>¿La IP del DVR cambia sola?</strong> Los DVRs obtienen su IP por DHCP, lo que significa que puede cambiar si el router se reinicia. Para evitar problemas, pide al técnico de red del cliente que asigne una <strong>IP fija (estática)</strong> al DVR. Si no es posible, anota la IP actual y monitorea si deja de funcionar.</div>

  <ol class="steps">
    <li>Selecciona el tipo de instalación: <strong>DVR/NVR (automático)</strong></li>
    <li>Escribe la <strong>IP del DVR</strong> (ej. 192.168.1.154)</li>
    <li>Deja el puerto en <strong>80</strong> salvo que el cliente lo haya cambiado</li>
    <li>Selecciona la <strong>marca</strong> del grabador</li>
    <li>Escribe el <strong>usuario</strong> del DVR (normalmente <code>admin</code>)</li>
    <li>Escribe la <strong>contraseña</strong> del DVR</li>
    <li>Haz clic en <strong>"Siguiente →"</strong> — el sistema registra la configuración y avanza</li>
  </ol>

  <div class="note"><strong>¿El DVR no responde al ping?</strong> Muchos grabadores tienen el ICMP (ping) bloqueado por seguridad. El sistema intentará conectarse de todas formas vía RTSP. Si tienes acceso a la red del cliente, puedes verificar con <code>nmap -p 554 192.168.x.x</code> que el puerto de video esté abierto.</div>

  <div class="page-footer"><span>NIRM GROUP — Manual de Usuario v1.0</span><span>Sección 3.4 — Wizard Paso 3: Instalación (continuación)</span></div>
</div>

<!-- 3.5 Wizard Paso 4 -->
<div class="page">
  <h2>3.5 Wizard — Paso 4 de 5: Generación de Archivos de Configuración</h2>
  <p>Con los datos del gateway y el DVR registrados, el Wizard genera automáticamente todos los archivos que la Raspberry Pi necesita para funcionar. <strong>No necesitas editar nada manualmente</strong> — el sistema lo hace todo.</p>

  ${figure('wizard-04-archivos.png', 'Wizard Paso 4 — Los archivos de configuración se generan y muestran en pantalla')}

  <h3>¿Qué archivos genera el sistema?</h3>
  <table>
    <tr><th>Archivo</th><th>Para qué sirve</th></tr>
    <tr><td><strong>mediamtx.yml</strong></td><td>Controla todos los streams de video. Contiene las rutas RTSP de cada cámara del DVR, el servidor al que transmite y las credenciales de publicación. Es el archivo más importante del gateway.</td></tr>
    <tr><td><strong>.env</strong></td><td>Variables de entorno del agente edge: ID del gateway, token de acceso al servidor central, dirección del servidor MQTT y configuración de conexión.</td></tr>
  </table>

  <h3>¿Qué debes hacer en este paso?</h3>
  <ol class="steps">
    <li>Revisa en pantalla que el resumen de cámaras sea correcto (número de canales, IP del DVR)</li>
    <li>Si algo está mal, haz clic en <strong>"← Anterior"</strong> para corregir los datos en el paso anterior</li>
    <li>Si todo está correcto, haz clic en <strong>"Generar Archivos"</strong> o simplemente en <strong>"Siguiente →"</strong></li>
    <li>El sistema genera los archivos — esto toma solo unos segundos</li>
    <li>Opcionalmente descarga los archivos para guardarlos como respaldo en tu computadora</li>
  </ol>

  <div class="note"><strong>¿Para qué sirve descargar los archivos?</strong> Es útil como respaldo técnico. Si en el futuro necesitas reinstalar manualmente el gateway (por reemplazo del equipo o fallo del disco), tendrás los archivos listos sin necesidad de pasar por el Wizard nuevamente.</div>

  <div class="success"><strong>Todo automático:</strong> El sistema ya sabe la IP del DVR, las credenciales, el ID del gateway y el servidor central. Los archivos se generan correctamente sin ninguna intervención manual.</div>

  <div class="page-footer"><span>NIRM GROUP — Manual de Usuario v1.0</span><span>Sección 3.5 — Wizard Paso 4: Archivos de Configuración</span></div>
</div>

<!-- 3.6 Wizard Paso 5 -->
<div class="page">
  <h2>3.6 Wizard — Paso 5 de 5: Despliegue en el Gateway de Campo</h2>
  <p>Este es el último paso. El sistema se conecta a la Raspberry Pi vía SSH y le entrega todos los archivos de configuración. Después reinicia automáticamente los servicios de video. <strong>El gateway debe estar encendido y con internet antes de este paso.</strong></p>

  ${figure('wizard-05-despliegue.png', 'Wizard Paso 5 — Panel de despliegue con el estado de conexión al gateway y botón de aplicar configuración')}

  <h3>Antes de hacer clic en "Desplegar"</h3>
  <table>
    <tr><th>Verificación</th><th>Cómo comprobarlo</th></tr>
    <tr><td>Raspberry Pi encendida</td><td>El LED de actividad (verde) parpadea en el equipo físico</td></tr>
    <tr><td>Raspberry Pi conectada a internet</td><td>Puedes hacer ping a su IP desde la red local del cliente</td></tr>
    <tr><td>Raspberry Pi en la misma red que el DVR</td><td>Ambos están conectados al mismo router del cliente</td></tr>
    <tr><td>Puerto SSH abierto (22)</td><td>El gateway debe tener SSH habilitado — viene activo por defecto en la imagen oficial</td></tr>
  </table>

  <ol class="steps">
    <li>Confirma que la Raspberry Pi esté encendida y conectada en el sitio del cliente</li>
    <li>Haz clic en <strong>"Desplegar Configuración"</strong></li>
    <li>Observa la barra de progreso — el sistema se conecta, copia los archivos y reinicia los servicios</li>
    <li>Espera el mensaje <strong>"Despliegue exitoso"</strong> o <strong>"Configuración aplicada"</strong></li>
    <li>El proceso dura entre <strong>30 y 90 segundos</strong> dependiendo de la velocidad del internet del cliente</li>
  </ol>

  <div class="page-footer"><span>NIRM GROUP — Manual de Usuario v1.0</span><span>Sección 3.6 — Wizard Paso 5: Despliegue</span></div>
</div>

<div class="page">
  <h3>¿Qué pasa si el despliegue falla?</h3>
  <table>
    <tr><th>Error que aparece</th><th>Causa probable</th><th>Solución</th></tr>
    <tr><td>Connection refused / Timeout</td><td>La Raspberry Pi está apagada o sin internet</td><td>Verifica que el equipo esté encendido y con cable de red o WiFi activo</td></tr>
    <tr><td>Authentication failed</td><td>El ID del gateway está mal escrito o el token no coincide</td><td>Regresa al Paso 2 con "← Anterior" y verifica el ID del dispositivo (sin dos puntos, sin espacios)</td></tr>
    <tr><td>Host not found / No route to host</td><td>El gateway no está en la red o la IP configurada es incorrecta</td><td>Verifica la conectividad del equipo — intenta hacer ping desde la red del cliente</td></tr>
  </table>

  <div class="warning"><strong>El despliegue puede reintentarse las veces necesarias.</strong> Si falla, corrige el problema (enciende el gateway, verifica la red) y vuelve a hacer clic en "Desplegar". No necesitas reiniciar el Wizard desde cero.</div>

  <h3>Verificación final — ¿Quedó todo bien?</h3>
  <p>Después del despliegue exitoso, haz estas verificaciones para confirmar que la instalación está completa y funcional:</p>

  <ol class="steps">
    <li>Ve a <strong>"Gateways"</strong> en el menú lateral — el gateway del cliente debe aparecer con estado <strong style="color:#22c55e">ACTIVO</strong> (verde) en menos de 2 minutos</li>
    <li>Ve a <strong>"Cámaras"</strong> y selecciona al cliente recién instalado — sus cámaras deben aparecer con el indicador <strong>EN VIVO</strong></li>
    <li>Confirma que el cliente haya recibido su correo con las credenciales de acceso al portal</li>
    <li>Pídele al cliente que entre a <strong>https://nirmgroup.net</strong> y verifique que puede ver sus cámaras</li>
  </ol>

  <div class="success"><strong>¡Instalación completa!</strong> El gateway está activo, las cámaras transmiten en vivo al servidor central y el cliente puede acceder a su portal desde cualquier navegador. El sistema grabará automáticamente según la configuración de retención establecida.</div>

  <div class="note"><strong>¿Cuánto tiempo tarda en aparecer activo el gateway?</strong> Después del despliegue, la Raspberry Pi reinicia sus servicios. Esto toma entre 60 y 120 segundos. Si después de 3 minutos el gateway sigue OFFLINE, verifica que el equipo tenga internet y que el ID configurado sea exactamente el mismo que tiene el equipo físico.</div>

  <div class="page-footer"><span>NIRM GROUP — Manual de Usuario v1.0</span><span>Sección 3.6 — Wizard Paso 5: Despliegue (continuación)</span></div>
</div>

<!-- ═══════════════════════════ 4. INSTALADOR ══════════════════════════ -->
<div class="page">
  <div class="section-header">
    <h1>4. ROL: INSTALADOR</h1>
    <p>Gestión de clientes asignados y alta de nuevas instalaciones</p>
  </div>

  <h2>4.1 Dashboard del Instalador</h2>
  <p>El instalador accede con el mismo proceso de login que el administrador. Su Dashboard es similar pero con menú reducido: no tiene acceso a "Control de Accesos" ni al "Registro de Auditoría". Su función principal es crear y dar seguimiento a los clientes que ha instalado.</p>

  ${figure('11-installer-dashboard.png', 'Dashboard visto desde el rol de Instalador')}

  <div class="page-footer"><span>NIRM GROUP — Manual de Usuario v1.0</span><span>Sección 4.1 — Instalador Dashboard</span></div>
</div>

<!-- 4.2 Gestión clientes instalador -->
<div class="page">
  <h2>4.2 Gestión de Clientes — Mis Clientes y Todos</h2>
  <p>Al entrar a la sección <strong>Clientes</strong>, el instalador ve por defecto solo los clientes que él mismo creó (<strong>"Mis Clientes"</strong>). Puede cambiar al tab <strong>"Todos los clientes"</strong> para consultar el listado completo del sistema.</p>

  <div class="two-col">
    ${figure('12-installer-mis-clientes.png', '"Mis Clientes" — solo muestra los clientes del instalador')}
    ${figure('13-installer-todos-clientes.png', '"Todos los clientes" — vista global para el instalador')}
  </div>

  <div class="warning"><strong>IMPORTANTE:</strong> Cuando el instalador accede a <strong>"Todos los clientes"</strong>, el sistema registra automáticamente esta acción en el log de auditoría. Utiliza esta vista solo cuando sea estrictamente necesario.</div>

  <h3>El instalador sigue el mismo flujo de alta de cliente (Sección 3)</h3>
  <p>Para crear un nuevo cliente, el instalador sigue exactamente el mismo proceso descrito en la Sección 3 de este manual: crear el cliente corporativo y luego usar el Wizard para configurar el gateway y las cámaras.</p>

  <div class="note"><strong>NOTA:</strong> Los clientes creados por un instalador quedan asociados a ese instalador y aparecerán en su tab "Mis Clientes". El administrador puede ver todos los clientes independientemente de quién los creó.</div>

  <div class="page-footer"><span>NIRM GROUP — Manual de Usuario v1.0</span><span>Sección 4.2 — Instalador Clientes</span></div>
</div>

<!-- ═══════════════════════════ 5. CLIENTE PORTAL ════════════════════ -->
<div class="page">
  <div class="section-header">
    <h1>5. ROL: CLIENTE — Portal de Seguridad</h1>
    <p>Portal personal simplificado para monitoreo de cámaras y grabaciones</p>
  </div>

  <p>El portal del cliente es una vista simplificada diseñada para el usuario final. El cliente puede monitorear sus cámaras en tiempo real, revisar grabaciones anteriores y gestionar su cuenta, sin necesidad de conocimientos técnicos.</p>

  <div class="note"><strong>NOTA:</strong> El cliente recibe sus credenciales (correo y contraseña temporal) por email al momento de ser registrado. En el primer acceso, el sistema le pedirá cambiar la contraseña temporal por una personal.</div>

  <h2>5.1 Mis Cámaras</h2>
  <p>La pantalla principal del portal muestra todas las cámaras asignadas al cliente. Las cámaras con indicador verde están transmitiendo en vivo. Haz clic en cualquier cámara para verla en pantalla completa.</p>

  ${figure('14-client-cameras.png', 'Portal Cliente — Vista de cámaras asignadas en tiempo real')}

  <div class="page-footer"><span>NIRM GROUP — Manual de Usuario v1.0</span><span>Sección 5.1 — Portal Cliente Cámaras</span></div>
</div>

<!-- 5.2 Grabaciones cliente -->
<div class="page">
  <h2>5.2 Mis Grabaciones</h2>
  <p>Desde la sección <strong>Grabaciones</strong> el cliente puede acceder al historial de video grabado por sus cámaras. Puede filtrar por cámara y rango de fechas, reproducir clips directamente en el navegador y descargarlos.</p>

  ${figure('15-client-recordings.png', 'Portal Cliente — Historial de grabaciones con reproductor integrado')}

  <ol class="steps">
    <li>Toca o haz clic en <strong>"Grabaciones"</strong> en el menú lateral</li>
    <li>Selecciona la <strong>cámara</strong> que quieres consultar</li>
    <li>Elige el <strong>rango de fechas</strong> deseado</li>
    <li>Haz clic en <strong>"Buscar"</strong> para ver los clips disponibles</li>
    <li>Toca el botón de <strong>reproducción ▶</strong> para ver el video</li>
    <li>Usa el ícono de <strong>descarga ⬇</strong> para guardar el clip en tu dispositivo</li>
  </ol>

  <div class="warning"><strong>IMPORTANTE:</strong> Las grabaciones están disponibles por un período determinado. Descarga los clips que necesites conservar antes de que sean eliminados automáticamente por el sistema.</div>

  <div class="page-footer"><span>NIRM GROUP — Manual de Usuario v1.0</span><span>Sección 5.2 — Portal Cliente Grabaciones</span></div>
</div>

<!-- 5.3 Cuenta cliente -->
<div class="page">
  <h2>5.3 Mi Cuenta</h2>
  <p>En la sección <strong>Mi Cuenta</strong> el cliente puede consultar su información de perfil y cambiar su contraseña de acceso al portal en cualquier momento.</p>

  ${figure('16-client-account.png', 'Portal Cliente — Sección Mi Cuenta con opciones de perfil')}

  <h3>Cómo cambiar la contraseña</h3>
  <ol class="steps">
    <li>Ve a <strong>"Mi Cuenta"</strong> en el menú lateral</li>
    <li>Haz clic en <strong>"Cambiar Contraseña"</strong></li>
    <li>Escribe tu <strong>contraseña actual</strong></li>
    <li>Escribe la <strong>nueva contraseña</strong> (mínimo 8 caracteres)</li>
    <li>Confirma la nueva contraseña y guarda los cambios</li>
  </ol>

  <div class="note"><strong>NOTA:</strong> Si olvidaste tu contraseña actual, comunícate con el administrador o instalador de tu cuenta para que te reenvíe una nueva invitación por correo electrónico.</div>

  <div class="page-footer"><span>NIRM GROUP — Manual de Usuario v1.0</span><span>Sección 5.3 — Mi Cuenta</span></div>
</div>

<!-- ═══════════════════════════ 6. FAQ ════════════════════════════════ -->
<div class="page">
  <div class="section-header">
    <h1>6. Preguntas Frecuentes</h1>
    <p>Solución rápida a los problemas más comunes del sistema</p>
  </div>

  <h3>¿Por qué no puedo ver el video de una cámara?</h3>
  <p>Verifica que el indicador de la cámara esté en verde (en vivo). Si está en gris, la cámara o el gateway pueden estar sin energía eléctrica o sin conexión a internet. Contacta al instalador o administrador para revisar el equipo en sitio.</p>

  <h3>Olvidé mi contraseña. ¿Qué hago?</h3>
  <p>Contacta al administrador del sistema para que te reenvíe una invitación con una nueva contraseña temporal. El administrador puede hacer esto desde la sección <strong>"Control de Accesos"</strong>, buscando tu usuario y haciendo clic en "Reenviar invitación".</p>

  <h3>El sistema me pide cambiar mi contraseña al entrar. ¿Es normal?</h3>
  <p>Sí. La primera vez que inicias sesión con una cuenta nueva, el sistema te solicita crear una contraseña personal por seguridad. Es un proceso único y solo ocurre en el primer acceso.</p>

  <h3>¿Puedo acceder desde mi celular o tableta?</h3>
  <p>Sí. El portal está completamente adaptado para dispositivos móviles. Abre el navegador de tu teléfono y ve a <strong>https://nirmgroup.net</strong> para acceder con normalidad.</p>

  <h3>¿Por cuánto tiempo se guardan las grabaciones?</h3>
  <p>El período de retención depende del almacenamiento disponible en el servidor. Las grabaciones más antiguas se eliminan automáticamente cuando el disco alcanza su límite. Para grabaciones de largo plazo, descarga los clips importantes a tu dispositivo.</p>

  <h3>¿Qué hacer si una cámara lleva mucho tiempo offline?</h3>
  <p>Primero verifica que el gateway físico (Raspberry Pi) tenga electricidad y conexión a internet en el sitio. Si el problema persiste más de una hora, contacta al instalador responsable de la cuenta para revisar el equipo en campo.</p>

  <h3>¿Cómo sé qué instalador configuró mi sistema?</h3>
  <p>El administrador puede consultar la información del instalador en la sección <strong>Clientes</strong>, en el detalle de cada cliente corporativo, donde aparece el nombre del instalador que lo creó.</p>

  <div class="page-footer"><span>NIRM GROUP — Manual de Usuario v1.0</span><span>Sección 6 — Preguntas Frecuentes</span></div>
</div>

<!-- ═══════════════════════════ CONTRAPORTADA ══════════════════════════ -->
<div class="page backcover">
  <div style="padding: 60mm 20mm; text-align:center;">
    <div style="font-size:20pt;font-weight:900;color:#475569;letter-spacing:3px;margin-bottom:4mm;">NIRM GROUP</div>
    <div style="font-size:11pt;color:#334155;margin-bottom:3mm;">Enterprise VMS — Portal de Seguridad</div>
    <div style="width:30mm;height:2px;background:#1e3a5f;margin:5mm auto;border-radius:2px;"></div>
    <div style="font-size:9pt;color:#374151;margin-bottom:2mm;">Este documento es de uso interno y confidencial.</div>
    <div style="font-size:9pt;color:#374151;margin-bottom:6mm;">Prohibida su reproducción sin autorización expresa.</div>
    <div style="font-size:10pt;color:#2563eb;font-weight:600;">https://nirmgroup.net</div>
  </div>
</div>

</body>
</html>`;

fs.writeFileSync(path.join(__dirname, 'manual.html'), html);
console.log('HTML generado. Abriendo con Playwright para exportar PDF...');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.setViewportSize({ width: 794, height: 1123 }); // A4 px
  await page.goto('file:///' + path.join(__dirname, 'manual.html').replace(/\\/g, '/'), {
    waitUntil: 'networkidle'
  });

  await page.waitForTimeout(1000); // Esperar que carguen las imágenes base64

  await page.pdf({
    path: OUT,
    format: 'A4',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' }
  });

  await browser.close();
  const stat = require('fs').statSync(OUT);
  console.log(`✅ PDF generado: ${OUT}`);
  console.log(`   Tamaño: ${(stat.size / 1024 / 1024).toFixed(1)} MB`);
})();
