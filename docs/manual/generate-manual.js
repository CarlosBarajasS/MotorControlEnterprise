const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'Manual_Usuario_NIRM_GROUP.pdf');
const SHOTS = path.join(__dirname, 'screenshots');

const doc = new PDFDocument({ size: 'A4', margin: 50, autoFirstPage: false });
doc.pipe(fs.createWriteStream(OUT));

// ── Colores ──────────────────────────────────────────────────────────────────
const BLUE   = '#1e3a5f';
const ACCENT = '#2563eb';
const GRAY   = '#6b7280';
const LIGHT  = '#f3f6fb';
const WHITE  = '#ffffff';

// ── Helpers ───────────────────────────────────────────────────────────────────
function addPage() {
  doc.addPage();
  // Footer
  const pageNum = doc.bufferedPageRange().count;
  doc.fontSize(9).fillColor(GRAY)
     .text(`NIRM GROUP — Manual de Usuario — Versión 1.0`, 50, 800, { align: 'left' })
     .text(`Página ${pageNum}`, 0, 800, { align: 'right' });
  doc.fillColor('#000');
  return doc;
}

function sectionHeader(title, subtitle) {
  doc.rect(50, doc.y, doc.page.width - 100, 48).fill(BLUE);
  const y = doc.y - 48;
  doc.fontSize(18).fillColor(WHITE).font('Helvetica-Bold')
     .text(title, 65, y + 8, { width: doc.page.width - 130 });
  if (subtitle) {
    doc.fontSize(10).fillColor('#a0b4cc').font('Helvetica')
       .text(subtitle, 65, y + 30, { width: doc.page.width - 130 });
  }
  doc.fillColor('#000').moveDown(1);
}

function subHeader(title) {
  doc.moveDown(0.5)
     .fontSize(13).fillColor(ACCENT).font('Helvetica-Bold')
     .text(title, { continued: false })
     .moveDown(0.3);
  doc.rect(50, doc.y, doc.page.width - 100, 1).fill('#dbeafe');
  doc.moveDown(0.5).fillColor('#000').font('Helvetica');
}

function bodyText(text) {
  doc.fontSize(10.5).fillColor('#1f2937').font('Helvetica')
     .text(text, 50, doc.y, { width: doc.page.width - 100, align: 'justify', lineGap: 3 })
     .moveDown(0.6);
}

function screenshot(filename, caption) {
  const imgPath = path.join(SHOTS, filename);
  if (!fs.existsSync(imgPath)) {
    doc.fontSize(9).fillColor('red').text(`[Imagen no encontrada: ${filename}]`).fillColor('#000');
    return;
  }
  const maxW = doc.page.width - 100;
  const maxH = 340;
  doc.image(imgPath, 50, doc.y, { fit: [maxW, maxH], align: 'center' });
  // Estimate height used
  doc.y += maxH + 5;
  if (caption) {
    doc.rect(50, doc.y, maxW, 20).fill(LIGHT);
    doc.fontSize(9).fillColor(GRAY).font('Helvetica-Oblique')
       .text(`Figura: ${caption}`, 55, doc.y - 18, { width: maxW - 10 });
    doc.fillColor('#000').font('Helvetica');
    doc.moveDown(0.8);
  }
}

function noteBox(text) {
  const bY = doc.y;
  doc.rect(50, bY, doc.page.width - 100, 36).fill('#eff6ff').stroke('#bfdbfe');
  doc.fontSize(9.5).fillColor(ACCENT).font('Helvetica-Bold')
     .text('NOTA  ', 60, bY + 8, { continued: true })
     .font('Helvetica').fillColor('#1e40af')
     .text(text, { width: doc.page.width - 130 });
  doc.fillColor('#000').moveDown(0.8);
}

function warningBox(text) {
  const bY = doc.y;
  doc.rect(50, bY, doc.page.width - 100, 36).fill('#fefce8').stroke('#fde68a');
  doc.fontSize(9.5).fillColor('#92400e').font('Helvetica-Bold')
     .text('IMPORTANTE  ', 60, bY + 8, { continued: true })
     .font('Helvetica')
     .text(text, { width: doc.page.width - 130 });
  doc.fillColor('#000').moveDown(0.8);
}

function stepList(steps) {
  steps.forEach((s, i) => {
    doc.fontSize(10.5).fillColor(ACCENT).font('Helvetica-Bold')
       .text(`${i + 1}.`, 50, doc.y, { continued: true, width: 20 })
       .fillColor('#1f2937').font('Helvetica')
       .text(`  ${s}`, { width: doc.page.width - 80, lineGap: 3 })
       .moveDown(0.3);
  });
  doc.moveDown(0.4);
}

// ════════════════════════════════════════════════════════════════════════════
// PORTADA
// ════════════════════════════════════════════════════════════════════════════
doc.addPage();
doc.rect(0, 0, doc.page.width, doc.page.height).fill(BLUE);
doc.rect(0, doc.page.height - 8, doc.page.width, 8).fill(ACCENT);

doc.fontSize(42).fillColor(WHITE).font('Helvetica-Bold')
   .text('NIRM GROUP', 50, 180, { align: 'center' });
doc.fontSize(22).fillColor('#a0b4cc').font('Helvetica')
   .text('Enterprise VMS', 50, 235, { align: 'center' });

doc.rect(150, 275, doc.page.width - 300, 2).fill(ACCENT);

doc.fontSize(28).fillColor(WHITE).font('Helvetica-Bold')
   .text('Manual de Usuario', 50, 295, { align: 'center' });
doc.fontSize(13).fillColor('#cbd5e1').font('Helvetica')
   .text('Portal de Seguridad — Todos los Roles', 50, 335, { align: 'center' });

doc.fontSize(10).fillColor('#94a3b8')
   .text('Versión 1.0 — Mayo 2026', 50, 395, { align: 'center' });

doc.rect(50, 460, doc.page.width - 100, 90).fill('#0f2240').stroke('#1e4080');
doc.fontSize(11).fillColor('#94a3b8').font('Helvetica-Bold')
   .text('ROLES DOCUMENTADOS', 60, 472, { align: 'center' });
doc.fontSize(10.5).fillColor(WHITE).font('Helvetica')
   .text('Administrador  ·  Instalador  ·  Cliente', 60, 495, { align: 'center' });
doc.fontSize(9).fillColor('#64748b')
   .text('URL del sistema: https://nirmgroup.net', 60, 525, { align: 'center' });

doc.fontSize(9).fillColor('#475569')
   .text('Documento confidencial — Uso interno NIRM GROUP', 50, 760, { align: 'center' });

// ════════════════════════════════════════════════════════════════════════════
// TABLA DE CONTENIDOS
// ════════════════════════════════════════════════════════════════════════════
addPage();
doc.fontSize(22).fillColor(BLUE).font('Helvetica-Bold')
   .text('Contenido', 50, 60).moveDown(0.5);
doc.rect(50, doc.y, doc.page.width - 100, 2).fill(ACCENT);
doc.moveDown(0.8);

const toc = [
  ['1.', 'Introducción y Acceso al Sistema', '3'],
  ['2.', 'ROL: ADMINISTRADOR', ''],
  ['   2.1', 'Inicio de Sesión', '4'],
  ['   2.2', 'Dashboard — Panel Principal', '5'],
  ['   2.3', 'Gateways', '6'],
  ['   2.4', 'Clientes Corporativos', '7'],
  ['   2.5', 'Cámaras IP — Vista NVR', '9'],
  ['   2.6', 'Grabaciones', '11'],
  ['   2.7', 'Control de Accesos (Usuarios)', '12'],
  ['   2.8', 'Registro de Auditoría', '13'],
  ['   2.9', 'Wizard / Alta de Gateway', '14'],
  ['3.', 'ROL: INSTALADOR', ''],
  ['   3.1', 'Dashboard del Instalador', '15'],
  ['   3.2', 'Gestión de Clientes', '16'],
  ['4.', 'ROL: CLIENTE (Portal)', ''],
  ['   4.1', 'Portal de Cámaras', '18'],
  ['   4.2', 'Mis Grabaciones', '19'],
  ['   4.3', 'Mi Cuenta', '20'],
  ['5.', 'Preguntas Frecuentes', '21'],
];

toc.forEach(([num, title, pg]) => {
  const isSec = !num.trim().startsWith('2.') && !num.trim().startsWith('3.') && !num.trim().startsWith('4.') || (num.trim() === '2.' || num.trim() === '3.' || num.trim() === '4.' || num.trim() === '1.' || num.trim() === '5.');
  const bold = isSec && !num.includes('.');
  doc.fontSize(bold ? 11 : 10).fillColor(bold ? BLUE : '#374151')
     .font(bold ? 'Helvetica-Bold' : 'Helvetica')
     .text(`${num}  ${title}`, 50, doc.y, { continued: !!pg, width: doc.page.width - 130 });
  if (pg) {
    doc.fillColor(GRAY).text(pg, { align: 'right' });
  }
  doc.moveDown(bold ? 0.5 : 0.25);
});

// ════════════════════════════════════════════════════════════════════════════
// 1. INTRODUCCIÓN
// ════════════════════════════════════════════════════════════════════════════
addPage();
sectionHeader('1. Introducción y Acceso al Sistema', 'NIRM GROUP Enterprise VMS — Portal de Seguridad');

bodyText('El sistema NIRM GROUP Enterprise VMS es una plataforma de videovigilancia empresarial que permite monitorear cámaras IP en tiempo real, gestionar grabaciones y administrar usuarios. El acceso se realiza desde cualquier navegador web moderno.');

subHeader('URL del sistema');
doc.fontSize(13).fillColor(ACCENT).font('Helvetica-Bold')
   .text('https://nirmgroup.net', { align: 'center' }).moveDown(0.5);
doc.font('Helvetica');

subHeader('Roles del sistema');
const roles = [
  ['Administrador', 'Acceso total: cámaras, clientes, usuarios, auditoría, wizard de alta.'],
  ['Instalador',    'Crea y gestiona sus propios clientes. Puede ver todos los clientes en modo lectura.'],
  ['Cliente',       'Portal personal: ve únicamente sus cámaras y grabaciones asignadas.'],
];
roles.forEach(([r, d]) => {
  doc.rect(50, doc.y, 4, 22).fill(ACCENT);
  doc.fontSize(10.5).fillColor(BLUE).font('Helvetica-Bold')
     .text(r, 62, doc.y - 20, { continued: true })
     .fillColor('#374151').font('Helvetica')
     .text(`  —  ${d}`).moveDown(0.4);
});
doc.moveDown(0.3);

noteBox('El sistema usa sesiones con token JWT. Si cierras el navegador, deberás iniciar sesión nuevamente.');

// ════════════════════════════════════════════════════════════════════════════
// 2. ADMINISTRADOR
// ════════════════════════════════════════════════════════════════════════════

// 2.1 Inicio de sesión
addPage();
sectionHeader('2. ROL: ADMINISTRADOR', 'Acceso completo a todas las funciones del sistema');

subHeader('2.1 Inicio de Sesión');
bodyText('Para acceder al sistema ingresa tu correo electrónico y contraseña en la pantalla de inicio. Una vez autenticado, el sistema te redirigirá automáticamente al Dashboard.');

stepList([
  'Abre tu navegador y ve a https://nirmgroup.net',
  'Ingresa tu correo electrónico (ej. admin@tuempresa.com)',
  'Ingresa tu contraseña',
  'Haz clic en el botón "Iniciar Sesión"',
]);

screenshot('01-login.png', 'Pantalla de inicio de sesión de NIRM GROUP');

warningBox('Si ves el mensaje "Credenciales inválidas", verifica que el correo y contraseña sean correctos. Contacta al administrador si olvidaste tu contraseña.');

// 2.2 Dashboard
addPage();
subHeader('2.2 Dashboard — Panel Principal');
bodyText('El Dashboard es la pantalla principal del administrador. Muestra un resumen del estado del sistema: cámaras activas, grabaciones recientes, alertas y el estado de los gateways conectados.');

bodyText('En la barra lateral izquierda encontrarás el menú de navegación con acceso a todas las secciones del sistema.');

screenshot('02-admin-dashboard.png', 'Dashboard — Panel principal del administrador');

// 2.3 Gateways
addPage();
subHeader('2.3 Gateways');
bodyText('Los Gateways son los equipos de campo (Raspberry Pi) instalados en cada ubicación del cliente. Desde esta sección puedes ver el estado de conexión de cada gateway y su última actividad.');

bodyText('Un gateway en estado verde (activo) significa que está conectado y enviando datos. Si aparece en rojo, ha perdido la conexión con el servidor central.');

screenshot('03-admin-gateways.png', 'Lista de Gateways con estado de conexión');

noteBox('Cada gateway tiene un identificador único (Gateway ID) que se configura durante el proceso de alta con el Wizard.');

// 2.4 Clientes
addPage();
subHeader('2.4 Clientes Corporativos');
bodyText('La sección de Clientes muestra todas las organizaciones registradas en el sistema. Cada cliente corporativo tiene asociadas sus cámaras, un usuario de acceso al portal y un instalador responsable.');

screenshot('04-admin-clients.png', 'Lista de clientes corporativos');

subHeader('Detalle de Cliente');
bodyText('Al hacer clic en un cliente puedes ver su información completa: datos de contacto, cámaras asignadas, estado del servicio y el usuario de acceso al portal del cliente.');

screenshot('05-admin-client-detail.png', 'Detalle de un cliente corporativo');

subHeader('Crear Nuevo Cliente');
stepList([
  'Haz clic en el botón "Añadir Nuevo Cliente"',
  'Completa el nombre, tipo de negocio y datos de contacto',
  'Ingresa el correo electrónico del cliente (se creará su acceso al portal)',
  'Guarda. El sistema enviará automáticamente un email de bienvenida al cliente.',
]);

// 2.5 Cámaras
addPage();
subHeader('2.5 Cámaras IP — Vista NVR');
bodyText('La sección de Cámaras muestra todos los clientes con sus equipos de videovigilancia. Selecciona un cliente para ver su vista NVR (grabador de video en red) con todas las cámaras activas.');

screenshot('06-admin-cameras.png', 'Selector de cliente para vista NVR');

subHeader('Vista NVR por Cliente');
bodyText('La vista NVR muestra las cámaras de un cliente en una cuadrícula. Las cámaras con transmisión activa muestran el video en tiempo real. Puedes hacer clic en cualquier cámara para ver su detalle.');

screenshot('07-admin-nvr-view.png', 'Vista NVR — Cámaras del cliente en tiempo real');

noteBox('Las cámaras que aparecen en gris están offline. Esto puede indicar que el gateway está desconectado o que la cámara física tiene un problema de energía o red.');

// 2.6 Grabaciones
addPage();
subHeader('2.6 Grabaciones');
bodyText('El módulo de grabaciones permite consultar y descargar los videos grabados por el sistema. Las grabaciones se almacenan en el servidor central y se organizan por cliente, cámara y fecha.');

stepList([
  'Selecciona el cliente en el filtro superior',
  'Elige la cámara y el rango de fechas',
  'Haz clic en "Buscar" para listar las grabaciones disponibles',
  'Haz clic en el ícono de descarga para obtener el archivo de video',
]);

screenshot('08-admin-recordings.png', 'Módulo de grabaciones con filtros por cliente y fecha');

warningBox('El almacenamiento de grabaciones es limitado. Las grabaciones más antiguas se eliminan automáticamente cuando el disco alcanza su límite de capacidad.');

// 2.7 Usuarios
addPage();
subHeader('2.7 Control de Accesos (Usuarios)');
bodyText('Desde esta sección el administrador gestiona todos los usuarios del sistema: administradores, instaladores y sus accesos. Puedes crear nuevos usuarios, activar/desactivar cuentas y reenviar invitaciones.');

screenshot('09-admin-users.png', 'Panel de control de accesos y usuarios del sistema');

subHeader('Crear Nuevo Usuario');
stepList([
  'Haz clic en "Nuevo Usuario" o "Invitar"',
  'Ingresa el correo electrónico y selecciona el rol (admin/installer)',
  'El sistema genera una contraseña temporal y envía un email de invitación',
  'El usuario deberá cambiar su contraseña en el primer inicio de sesión',
]);

subHeader('Roles disponibles');
doc.fontSize(10.5).font('Helvetica');
[
  ['admin',     'Acceso total al sistema. Puede crear y eliminar usuarios.'],
  ['installer', 'Puede crear clientes y ver todas las instalaciones.'],
  ['client',    'Solo accede al portal de cliente (sus cámaras y grabaciones).'],
].forEach(([r, d]) => {
  doc.rect(50, doc.y, 4, 18).fill(ACCENT);
  doc.fillColor(BLUE).font('Helvetica-Bold').text(r, 62, doc.y - 16, { continued: true })
     .fillColor('#374151').font('Helvetica').text(`  ${d}`).moveDown(0.35);
});

// 2.8 Auditoría
addPage();
subHeader('2.8 Registro de Auditoría');
bodyText('El registro de auditoría muestra un historial completo de las acciones realizadas en el sistema: creación de clientes, cambios de acceso, visualización de clientes ajenos por parte de instaladores, y otras acciones sensibles.');

bodyText('Este registro es solo de lectura y no puede ser modificado. Es útil para rastrear quién hizo qué y cuándo.');

screenshot('10-admin-audit-log.png', 'Registro de auditoría con historial de acciones');

noteBox('Las acciones quedan registradas automáticamente. No es necesario hacer nada especial para activar la auditoría.');

// 2.9 Wizard
addPage();
subHeader('2.9 Wizard — Alta de Nuevo Gateway');
bodyText('El Wizard es el asistente de configuración para dar de alta un nuevo sitio (cliente + gateway + cámaras). Guía al instalador paso a paso a través del proceso completo.');

screenshot('11-admin-wizard.png', 'Wizard de alta de nuevo gateway y configuración de cámaras');

stepList([
  'Paso 1: Datos del cliente (nombre, dirección, contacto)',
  'Paso 2: Configuración del gateway (IP, credenciales del DVR)',
  'Paso 3: Detección automática de cámaras',
  'Paso 4: Nombre y configuración de cada cámara',
  'Paso 5: Generación del archivo de configuración mediamtx.yml',
  'Paso 6: Instalación del archivo en el gateway de campo',
]);

// ════════════════════════════════════════════════════════════════════════════
// 3. INSTALADOR
// ════════════════════════════════════════════════════════════════════════════
addPage();
sectionHeader('3. ROL: INSTALADOR', 'Gestión de clientes y alta de nuevas instalaciones');

subHeader('3.1 Dashboard del Instalador');
bodyText('El instalador tiene acceso a las mismas secciones que el administrador, pero con permisos limitados. No puede gestionar otros usuarios ni ver el registro de auditoría. Su función principal es crear y dar seguimiento a sus clientes asignados.');

screenshot('12-installer-dashboard.png', 'Dashboard visto desde el rol de instalador');

// 3.2 Gestión de clientes
addPage();
subHeader('3.2 Gestión de Clientes — Mis Clientes');
bodyText('La vista "Mis Clientes" muestra únicamente los clientes que el instalador creó directamente. Este es el modo predeterminado al entrar a la sección Clientes.');

screenshot('13-installer-mis-clientes.png', 'Tab "Mis Clientes" — solo muestra los clientes propios del instalador');

subHeader('Todos los Clientes');
bodyText('El instalador puede cambiar al tab "Todos los clientes" para ver el listado completo de clientes del sistema. Esta acción queda registrada en el log de auditoría como "acceso a cliente ajeno".');

screenshot('14-installer-todos-clientes.png', 'Tab "Todos los clientes" — vista global para el instalador');

warningBox('Cuando el instalador accede a "Todos los clientes", el sistema registra automáticamente esta acción en el log de auditoría. Solo usar cuando sea estrictamente necesario.');

subHeader('Crear un Nuevo Cliente');
stepList([
  'Ve a la sección "Clientes" y haz clic en "Añadir Nuevo Cliente"',
  'Completa el formulario: nombre de la empresa, ciudad, tipo de negocio',
  'Ingresa el correo del contacto principal (será el acceso al portal del cliente)',
  'Guarda el cliente. El sistema enviará automáticamente un correo de bienvenida.',
  'El cliente recibe sus credenciales y puede acceder al portal de cliente.',
]);

noteBox('Una vez creado el cliente, usa el Wizard (sección 2.9) para configurar el gateway y las cámaras en el sitio físico.');

// ════════════════════════════════════════════════════════════════════════════
// 4. CLIENTE
// ════════════════════════════════════════════════════════════════════════════
addPage();
sectionHeader('4. ROL: CLIENTE — Portal de Seguridad', 'Acceso al monitoreo de sus cámaras y grabaciones');

bodyText('El portal del cliente es una vista simplificada del sistema, diseñada para que el usuario final pueda monitorear sus cámaras en tiempo real y revisar grabaciones anteriores sin necesidad de conocimientos técnicos.');

subHeader('Acceso al Portal');
bodyText('El cliente accede con el correo y contraseña que recibió por email al ser registrado. Al primer inicio de sesión, el sistema solicitará cambiar la contraseña temporal por una personal.');

subHeader('4.1 Mis Cámaras');
bodyText('La sección principal del portal muestra todas las cámaras asignadas al cliente. Cada cámara muestra su estado (en vivo / offline) y un thumbnail de la transmisión activa.');

screenshot('15-client-cameras.png', 'Portal cliente — Vista de cámaras en tiempo real');

stepList([
  'Haz clic en cualquier cámara para ver el video en pantalla completa',
  'Las cámaras con indicador verde están transmitiendo en vivo',
  'Las cámaras en gris están temporalmente sin señal',
]);

// 4.2 Grabaciones
addPage();
subHeader('4.2 Mis Grabaciones');
bodyText('Desde esta sección el cliente puede acceder al historial de video grabado por sus cámaras. Puede filtrar por cámara y rango de fechas, y descargar cualquier clip.');

screenshot('16-client-recordings.png', 'Portal cliente — Historial de grabaciones');

stepList([
  'Selecciona la cámara en el filtro superior',
  'Elige el rango de fechas que quieres consultar',
  'Haz clic en "Buscar" para ver los clips disponibles',
  'Haz clic en el botón de reproducción para ver el video',
  'Usa el ícono de descarga para guardar el clip en tu computadora',
]);

noteBox('Las grabaciones están disponibles por un período determinado según el plan contratado. Descarga los clips importantes antes de que expiren.');

// 4.3 Mi Cuenta
addPage();
subHeader('4.3 Mi Cuenta');
bodyText('En la sección "Mi Cuenta" el cliente puede ver su información de perfil y cambiar su contraseña de acceso al portal.');

screenshot('17-client-account.png', 'Portal cliente — Sección Mi Cuenta');

subHeader('Cambiar Contraseña');
stepList([
  'Ve a "Mi Cuenta" en el menú lateral',
  'Haz clic en "Cambiar Contraseña"',
  'Ingresa tu contraseña actual',
  'Escribe la nueva contraseña (mínimo 8 caracteres)',
  'Confirma la nueva contraseña y guarda los cambios',
]);

// ════════════════════════════════════════════════════════════════════════════
// 5. FAQ
// ════════════════════════════════════════════════════════════════════════════
addPage();
sectionHeader('5. Preguntas Frecuentes', 'Solución a problemas comunes del sistema');

const faqs = [
  ['¿Por qué no puedo ver el video de una cámara?',
   'Verifica que el indicador de la cámara esté en verde (en vivo). Si está en gris, la cámara o el gateway pueden estar sin conexión a internet. Contacta al instalador o administrador.'],
  ['Olvidé mi contraseña. ¿Qué hago?',
   'Contacta al administrador del sistema para que te reenvíe una invitación con nueva contraseña temporal. El administrador puede hacer esto desde la sección "Control de Accesos".'],
  ['¿Por cuánto tiempo se guardan las grabaciones?',
   'El tiempo de retención depende del almacenamiento disponible en el servidor. Las grabaciones más antiguas se eliminan automáticamente. Descarga los clips importantes lo antes posible.'],
  ['El sistema me pide cambiar mi contraseña al entrar. ¿Es normal?',
   'Sí. La primera vez que inicias sesión con una cuenta nueva, el sistema te pide crear una contraseña personal por seguridad. Es un proceso de un solo uso.'],
  ['¿Puedo acceder desde mi celular?',
   'Sí. El portal está optimizado para dispositivos móviles. Abre el navegador de tu teléfono y ve a https://nirmgroup.net para acceder normalmente.'],
  ['¿Qué hacer si una cámara está offline por mucho tiempo?',
   'Primero verifica que el gateway físico tenga electricidad y conexión a internet. Si el problema persiste, contacta al instalador responsable de la cuenta para revisar el equipo en sitio.'],
];

faqs.forEach(([q, a]) => {
  const bY = doc.y;
  doc.rect(50, bY, 4, 14).fill(ACCENT);
  doc.fontSize(11).fillColor(BLUE).font('Helvetica-Bold')
     .text(q, 62, bY - 12, { width: doc.page.width - 112 }).moveDown(0.3);
  doc.fontSize(10).fillColor('#374151').font('Helvetica')
     .text(a, 62, doc.y, { width: doc.page.width - 112, lineGap: 3 }).moveDown(0.8);
});

// ── Contraportada ────────────────────────────────────────────────────────────
addPage();
doc.rect(0, 0, doc.page.width, doc.page.height).fill('#0f172a');
doc.fontSize(16).fillColor('#94a3b8').font('Helvetica')
   .text('NIRM GROUP', 50, 360, { align: 'center' });
doc.fontSize(11).fillColor('#475569')
   .text('Este documento es de uso interno y confidencial.', 50, 390, { align: 'center' })
   .text('Prohibida su reproducción sin autorización.', 50, 408, { align: 'center' });
doc.fontSize(10).fillColor('#334155')
   .text('https://nirmgroup.net', 50, 440, { align: 'center' });

doc.end();
console.log('PDF generado:', OUT);
