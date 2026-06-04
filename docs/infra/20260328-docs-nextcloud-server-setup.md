# Infraestructura — Servidor Nextcloud + Preparación de Migración
**Fecha de inicio:** 2026-03-28
**Última actualización:** 2026-03-30
**Autor:** Equipo NIRM GROUP
**Estado:** ✅ Nextcloud operativo en red local · WAF activo · HTTPS pendiente para IP pública

---

## Índice

1. [¿Qué es este servidor y para qué sirve?](#1-qué-es-este-servidor-y-para-qué-sirve)
2. [Topología de infraestructura](#2-topología-de-infraestructura)
3. [Especificaciones del servidor](#3-especificaciones-del-servidor)
4. [Preparación del disco de datos](#4-preparación-del-disco-de-datos)
5. [Hardening del sistema operativo](#5-hardening-del-sistema-operativo)
6. [Stack de servicios instalados](#6-stack-de-servicios-instalados)
7. [Instalación de Nextcloud](#7-instalación-de-nextcloud)
8. [Configuración de seguridad Nextcloud](#8-configuración-de-seguridad-nextcloud)
9. [WAF — Web Application Firewall](#9-waf--web-application-firewall)
10. [Estado final verificado](#10-estado-final-verificado)
11. [Checklist de migración a IP pública](#11-checklist-de-migración-a-ip-pública)
12. [Comandos de administración frecuentes](#12-comandos-de-administración-frecuentes)
13. [Referencias rápidas](#13-referencias-rápidas)

---

## 1. ¿Qué es este servidor y para qué sirve?

### Contexto del proyecto

NIRM GROUP opera el sistema **MotorControlEnterprise**: una plataforma de control remoto de cámaras y motores industriales. Actualmente ese sistema corre en producción en la casa del profesor (`nirmgroup.net` → IP `177.247.175.4`).

Se adquirió un **nuevo servidor físico HP ProLiant** para mover el sistema a infraestructura propia. Ese servidor está instalado en una red institucional universitaria mientras se prepara para ser reubicado.

### ¿Por qué no migramos producción todavía?

La red institucional donde está el servidor **no permite abrir puertos hacia internet**. Esto significa que nadie externo puede conectarse al servidor desde fuera de la universidad. Para exponer el sistema al mundo se necesita que el servidor esté en una ubicación con IP pública (la casa del profesor).

### ¿Qué hicimos mientras tanto?

Aprovechamos el tiempo para:
1. Instalar y configurar **Nextcloud** (almacenamiento de videos — requerimiento prioritario de negocio)
2. Aplicar **hardening de seguridad completo** (firewall, fail2ban, SELinux, WAF)
3. Dejar todo listo para que cuando llegue a IP pública, solo se haga la migración del sistema productivo

### Decisión de arquitectura — ¿cómo se almacenan los videos?

Se eligió un esquema de **volumen compartido**: el backend del sistema escribe videos directamente en una carpeta del servidor (`/data/nextcloud/data/`), y Nextcloud indexa esos archivos para que los usuarios puedan verlos desde el navegador. Esto evita la necesidad de modificar el código existente del sistema.

```
Backend Docker  ──escribe──▶  /data/nextcloud/data/videos/
                                        │
                                        ▼
                          Nextcloud indexa via occ files:scan
                                        │
                                        ▼
                          Usuario ve los videos en el navegador
```

---

## 2. Topología de infraestructura

### Diagrama completo

```
═══════════════════════════════════════════════════════════════════
  RED INSTITUCIONAL — 10.27.34.x  (sin salida a internet)
═══════════════════════════════════════════════════════════════════

  Servidor Físico HP ProLiant MicroServer Gen11
  └── Hypervisor: XCP-ng (gestión de máquinas virtuales)
      │
      ├── VM 1: Xen Orchestra (XOA)          IP: 10.27.34.28
      │   ┌──────────────────────────────────────────────────┐
      │   │ Panel web de administración de las VMs           │
      │   │ OS: Debian 12 | 2 vCPU | 4 GiB RAM              │
      │   │ Acceso: https://10.27.34.28                      │
      │   └──────────────────────────────────────────────────┘
      │
      └── VM 2: AlmaLinux 10                 IP: 10.27.34.20
          ┌──────────────────────────────────────────────────┐
          │ Servidor de aplicaciones principal               │
          │ OS: AlmaLinux 10.1 | 7.5 GiB RAM                │
          │ Disco sistema:  150 GiB (xvda)                   │
          │ Disco de datos:   2 TiB (xvdb) → /data/nextcloud│
          │                                                  │
          │ Servicios activos:                               │
          │   · Apache 2.4  + PHP-FPM 8.3  → Nextcloud      │
          │   · PostgreSQL 16              → Base de datos   │
          │   · KeyDB (Redis compatible)   → Caché           │
          │   · fail2ban                   → Anti fuerza bruta│
          │   · ModSecurity + OWASP CRS    → WAF             │
          │   · SELinux enforcing          → Control de acceso│
          └──────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════
  PRODUCCIÓN VIGENTE — No tocar hasta completar migración
═══════════════════════════════════════════════════════════════════

  nirmgroup.net → 177.247.175.4 (casa del profesor)
  └── Docker Compose:
        postgres · backend .NET · frontend Angular
        nginx · mosquitto MQTT · mediamtx WebRTC
```

### ¿Qué es XCP-ng y XOA?

- **XCP-ng** es el sistema de virtualización (hypervisor) que corre directamente en el servidor físico. Permite crear varias máquinas virtuales independientes dentro de un mismo servidor.
- **XOA (Xen Orchestra)** es el panel web desde donde se administran esas VMs: crear, apagar, hacer snapshots, etc.

---

## 3. Especificaciones del servidor

| Parámetro | Valor |
|-----------|-------|
| Hardware | HP ProLiant MicroServer Gen11 |
| OS de la VM principal | AlmaLinux 10.1 (Heliotrope Lion) |
| Soporte del OS hasta | 2035-06-01 |
| Kernel | 6.12.0-124.45.1.el10_1.x86_64 |
| RAM total | 7.5 GiB |
| Disco sistema (xvda) | 150 GiB — LVM |
| Disco datos (xvdb) | 2 TiB — XFS |
| IP en red institucional | 10.27.34.20 |
| Usuario administrador | `Vyepez` |
| Acceso SSH | Por llave ed25519 (sin contraseña) |
| SELinux | enforcing (máxima seguridad) |

### Layout de discos

```
xvda (150 GiB — sistema operativo)
├── xvda1   1 MiB        BIOS boot
├── xvda2   1 GiB        /boot
└── xvda3   149 GiB      LVM
    ├── almalinux-root   70 GiB   /
    ├── almalinux-swap   7.9 GiB  [SWAP]
    └── almalinux-home   71.1 GiB /home

xvdb (2 TiB — datos Nextcloud)
└── xvdb1   2 TiB        XFS → /data/nextcloud
```

> **¿Por qué XFS?** Es el sistema de archivos recomendado para almacenar archivos grandes (como videos). Es más eficiente que ext4 en ese escenario.

---

## 4. Preparación del disco de datos

### Particionado y formateo

```bash
# Crear tabla de particiones y partición única
sudo parted /dev/xvdb --script mklabel gpt mkpart primary xfs 0% 100%

# Formatear con XFS
sudo mkfs.xfs /dev/xvdb1

# Crear punto de montaje
sudo mkdir -p /data/nextcloud
```

### Montaje permanente (`/etc/fstab`)

```
UUID=088f87f0-638e-4482-8e7f-c9cd2ff650e0 /data/nextcloud xfs defaults,nofail 0 2
```

> El flag `nofail` es crítico: si el disco fallara al arrancar, el servidor no se queda bloqueado esperando el disco — arranca igualmente.

---

## 5. Hardening del sistema operativo

El hardening es el proceso de configurar el sistema para minimizar la superficie de ataque antes de exponerlo a internet.

### 5.1 Actualización completa del sistema

```bash
sudo dnf upgrade -y
sudo systemctl daemon-reload
```

### 5.2 Firewall (firewalld)

El firewall controla qué tráfico puede entrar al servidor. Solo se permiten los puertos estrictamente necesarios.

```bash
sudo systemctl enable --now firewalld
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

**Puertos abiertos actualmente:**

| Servicio | Puerto | Protocolo | Propósito |
|---------|--------|-----------|-----------|
| SSH | 22 | TCP | Administración remota del servidor |
| HTTP | 80 | TCP | Acceso web a Nextcloud |
| HTTPS | 443 | TCP | Acceso web seguro (pendiente Let's Encrypt) |
| Cockpit | 9090 | TCP | Panel de gestión web del SO |

**Puertos adicionales a abrir cuando haya IP pública:**

| Servicio | Puerto | Propósito |
|---------|--------|-----------|
| MQTT | 1885 | Comunicación con gateways Raspberry Pi |
| WebRTC/WHEP | 8889 | Streaming de cámaras en tiempo real |

### 5.3 fail2ban — protección contra fuerza bruta

fail2ban monitorea los logs de Nextcloud y bloquea automáticamente IPs que intentan adivinar contraseñas.

**Configuración del jail** (`/etc/fail2ban/jail.d/nextcloud.conf`):

```ini
[nextcloud]
enabled  = true
port     = 80,443
filter   = nextcloud
logpath  = /var/log/nextcloud/nextcloud.log
maxretry = 5        # banear tras 5 intentos fallidos
bantime  = 3600     # ban por 1 hora
findtime = 600      # ventana de 10 minutos
```

**Filtro** (`/etc/fail2ban/filter.d/nextcloud.conf`):

```ini
[Definition]
failregex = ^{"reqId":".*","level":2,"time":".*","remoteAddr":"<HOST>","user":".*","app":"core","method":".*","url":".*","message":"Login failed:.*"}$
```

### 5.4 SELinux

SELinux es el sistema de control de acceso del kernel de Linux. Permanece en modo `enforcing` (activo y bloqueante). Se aplicaron los contextos necesarios para que Apache pueda leer/escribir en los directorios de Nextcloud:

```bash
# Apache puede acceder a los datos de Nextcloud
sudo semanage fcontext -a -t httpd_sys_rw_content_t "/data/nextcloud(/.*)?"
sudo restorecon -Rv /data/nextcloud

# Apache puede acceder al código de Nextcloud
sudo semanage fcontext -a -t httpd_sys_rw_content_t "/var/www/nextcloud(/.*)?"
sudo restorecon -Rv /var/www/nextcloud

# El log de Nextcloud es legible por fail2ban
sudo semanage fcontext -a -t var_log_t "/data/nextcloud/data/nextcloud.log"

# Permisos booleanos de Apache
sudo setsebool -P httpd_unified 1
sudo setsebool -P httpd_can_network_connect 1
sudo setsebool -P httpd_can_network_connect_db 1
```

---

## 6. Stack de servicios instalados

Todos estos servicios corren juntos en la VM `10.27.34.20`:

| Servicio | Versión | Puerto | Función |
|---------|---------|--------|---------|
| Apache HTTP (`httpd`) | 2.4.63 | 80 / 443 | Servidor web que sirve Nextcloud |
| PHP-FPM | 8.3.29 | socket Unix | Ejecuta el código PHP de Nextcloud |
| PostgreSQL | 16.13 | 5432 | Base de datos de Nextcloud |
| KeyDB | 6.3.4 | 6379 | Caché de sesiones y bloqueo de archivos |
| fail2ban | 1.1.0 | — | Protección contra ataques de fuerza bruta |
| ModSecurity | 2.9.9 | — | WAF integrado en Apache |

> **¿Por qué KeyDB en lugar de Redis?** En AlmaLinux 10, el paquete Redis no está disponible en los repositorios base. KeyDB es un fork multihilo de Redis, 100% compatible con su protocolo. Nextcloud no distingue diferencia entre ambos.

### Configuración PHP optimizada (`/etc/php.d/99-nextcloud.ini`)

```ini
memory_limit        = 512M
upload_max_filesize = 16G    # videos grandes
post_max_size       = 16G
max_execution_time  = 3600   # 1 hora para transferencias largas
max_input_time      = 3600
output_buffering    = off
```

---

## 7. Instalación de Nextcloud

### 7.1 Descarga y extracción

```bash
cd /tmp
wget https://download.nextcloud.com/server/releases/latest.tar.bz2
sudo tar -xjf /tmp/latest.tar.bz2 -C /var/www/
sudo chown -R apache:apache /var/www/nextcloud
sudo chmod -R 755 /var/www/nextcloud
```

### 7.2 Directorio de datos en el disco de 2 TB

```bash
sudo mkdir -p /data/nextcloud/data
sudo chown -R apache:apache /data/nextcloud
sudo chmod -R 750 /data/nextcloud
```

### 7.3 VirtualHost Apache (`/etc/httpd/conf.d/nextcloud.conf`)

```apache
<VirtualHost *:80>
    DocumentRoot /var/www/nextcloud/
    ServerName 10.27.34.20

    <Directory /var/www/nextcloud/>
        Require all granted
        AllowOverride All
        Options FollowSymLinks MultiViews
        <IfModule mod_dav.c>
            Dav off
        </IfModule>
    </Directory>

    # Cabeceras de seguridad HTTP
    Header always set Strict-Transport-Security "max-age=15552000; includeSubDomains"
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set X-XSS-Protection "1; mode=block"
    Header always set Referrer-Policy "no-referrer"
    Header always set Permissions-Policy "camera=(), microphone=(), geolocation=()"

    ErrorLog  /var/log/httpd/nextcloud_error.log
    CustomLog /var/log/httpd/nextcloud_access.log combined
</VirtualHost>
```

### 7.4 Base de datos PostgreSQL

```sql
CREATE USER nextcloud WITH PASSWORD '***';
CREATE DATABASE nextcloud OWNER nextcloud ENCODING 'UTF8';
```

En `/var/lib/pgsql/data/pg_hba.conf` se cambió la autenticación local de `peer` a `md5` para que Nextcloud pueda conectarse con usuario y contraseña.

### 7.5 Instalación completada via web

Acceso: `http://10.27.34.20`

| Campo | Valor |
|-------|-------|
| Cuenta admin | `NirmGroup` |
| Carpeta de datos | `/data/nextcloud/data` |
| Motor de BD | PostgreSQL |
| Usuario BD | `nextcloud` |
| BD | `nextcloud` |
| Host BD | `localhost` |

---

## 8. Configuración de seguridad Nextcloud

### 8.1 Caché KeyDB (`/var/www/nextcloud/config/config.php`)

```php
'memcache.local'   => '\\OC\\Memcache\\Redis',
'memcache.locking' => '\\OC\\Memcache\\Redis',
'redis' => [
  'host' => '127.0.0.1',
  'port' => 6379,
],
```

### 8.2 Dominios de confianza

```php
'trusted_domains' =>
array (
  0 => 'localhost',
  1 => '10.27.34.20',
  // Agregar nirmgroup.net cuando esté en IP pública
),
```

### 8.3 Logging centralizado

```bash
sudo -u apache php /var/www/nextcloud/occ log:file --enable
sudo -u apache php /var/www/nextcloud/occ log:file \
  --file=/var/log/nextcloud/nextcloud.log
```

Rotación automática a 100 MB. Este log es el que usa fail2ban para detectar ataques.

### 8.4 Cron job (tareas automáticas de mantenimiento)

```bash
# /var/spool/cron/apache
*/5 * * * * php -f /var/www/nextcloud/cron.php
```

Modo configurado en el panel de administración: **Cron (Recomendado)**

---

## 9. WAF — Web Application Firewall

### ¿Qué es un WAF y por qué lo necesitamos?

Un WAF (Web Application Firewall) es una capa de protección que analiza cada petición HTTP antes de que llegue a Nextcloud. A diferencia del firewall normal (que solo filtra por IP y puerto), el WAF entiende el protocolo HTTP y puede detectar ataques como:

- **Inyección SQL**: intentos de manipular la base de datos
- **XSS (Cross-Site Scripting)**: inyección de código JavaScript malicioso
- **Fuerza bruta sobre la API**: ataques automatizados a endpoints
- **Path traversal**: intentos de acceder a archivos del sistema

fail2ban protege el **login**. El WAF protege **toda la aplicación**.

### Componentes instalados

| Componente | Versión | Función |
|---|---|---|
| **ModSecurity** | 2.9.9 | Motor WAF integrado en Apache |
| **OWASP Core Rule Set (CRS)** | 4.9.0 | 46 archivos de reglas de detección de ataques |

### Ubicación de los archivos de configuración

| Archivo | Propósito |
|---|---|
| `/etc/httpd/conf.d/mod_security.conf` | Configuración principal del WAF |
| `/etc/httpd/modsecurity.d/activated_rules/crs.conf` | Carga las reglas OWASP CRS |
| `/etc/httpd/modsecurity.d/local_rules/nextcloud-exclusions.conf` | Exclusiones para Nextcloud |
| `/etc/httpd/crs/` | Directorio con las 46 reglas OWASP instaladas |
| `/var/log/httpd/modsec_audit.log` | Log de eventos del WAF |

### Configuración principal (`/etc/httpd/conf.d/mod_security.conf`)

Parámetros clave aplicados:

```apache
SecRuleEngine On                    # Modo BLOQUEO activo
SecRequestBodyAccess On             # Analizar cuerpo de peticiones
SecRequestBodyLimit 1073741824      # Límite 1 GB (uploads grandes van por WebDAV, excluidos)
SecRequestBodyInMemoryLimit 131072  # 128 KB en RAM, el resto a disco temporal
SecResponseBodyAccess Off           # No analizar respuestas (ahorra CPU)
SecAuditEngine RelevantOnly         # Log solo de eventos relevantes
SecAuditLog /var/log/httpd/modsec_audit.log
SecTmpDir /var/cache/httpd/modsecurity   # Directorio temporal para uploads
```

### Exclusiones específicas para Nextcloud

Nextcloud usa funcionalidades avanzadas del protocolo HTTP que pueden disparar falsas alarmas en el WAF. Se configuraron exclusiones precisas:

| Exclusión | Ruta / Regla | Motivo |
|---|---|---|
| Sin inspección de cuerpo | `/remote.php/dav` y `/remote.php/webdav` | Uploads de archivos grandes del cliente de escritorio |
| Reglas de inyección desactivadas | `/ocs/` | La API envía JSON con caracteres que parecen código |
| Reglas SQL desactivadas | `/index.php/apps/files`, `/index.php/settings` | El panel admin puede disparar falsos positivos |
| Cabecera Authorization ignorada | Reglas 920170 y 920180 | El token Bearer de sesión parece sospechoso sin esta exclusión |
| WebDAV methods permitidos | `tx.allowed_methods` | PROPFIND, MKCOL, COPY, MOVE, LOCK, UNLOCK son necesarios para sync |
| Regla 920350 desactivada | IP como Host header | El servidor se accede por IP, no por dominio (temporal) |

> **Nota sobre la regla 920350:** Esta exclusión se debe **eliminar** cuando se configure `nirmgroup.net`. La regla detecta accesos por IP en lugar de dominio, lo cual será correcto una vez haya DNS real.

### Resultado de las pruebas realizadas

Se hicieron pruebas de uso real con Nextcloud en modo detección (DetectionOnly) durante una sesión completa:
- Login de usuario ✅ sin alertas
- Subida de imágenes ✅ sin alertas
- Subida de documentos de texto ✅ sin alertas
- Navegación por carpetas ✅ sin alertas
- Único evento registrado: regla 920350 (IP como host) — falso positivo esperado, excluido

**Score de anomalía máximo registrado: 3/5** — el umbral de bloqueo es 5, por lo que en ningún momento el tráfico legítimo habría sido bloqueado.

### SELinux — contextos aplicados para el WAF

```bash
# CRS accesible por Apache
sudo semanage fcontext -a -t httpd_config_t '/etc/httpd/crs(/.*)?'
sudo restorecon -Rv /etc/httpd/crs/

# Directorio temporal del WAF
sudo semanage fcontext -a -t httpd_tmp_t '/var/cache/httpd/modsecurity(/.*)?'
sudo restorecon -Rv /var/cache/httpd/modsecurity
```

### Comandos de administración del WAF

```bash
# Ver eventos en tiempo real
sudo tail -f /var/log/httpd/modsec_audit.log

# Ver qué reglas se disparan con más frecuencia
sudo grep '"id"' /var/log/httpd/modsec_audit.log | sort | uniq -c | sort -rn | head -20

# Verificar que el WAF está activo
sudo httpd -M 2>/dev/null | grep security
# Debe mostrar: security2_module (shared)

# Ver el modo actual
grep 'SecRuleEngine' /etc/httpd/conf.d/mod_security.conf
```

---

## 10. Estado final verificado

### Servicios activos (verificado 2026-03-30)

```
httpd.service          active (running)  ← Apache + ModSecurity WAF
php-fpm.service        active (running)
postgresql.service     active (running)
keydb.service          active (running)
fail2ban.service       active (running)
firewalld.service      active (running)
mariadb.service        active (running)  ← instalado, no usado por Nextcloud
```

### Capas de seguridad activas

```
Internet
    │
    ▼
┌─────────────────────────────────────────┐
│  firewalld                              │  ← Capa 1: solo puertos 22/80/443
│  Bloquea todo excepto SSH, HTTP, HTTPS  │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  ModSecurity + OWASP CRS 4.9.0          │  ← Capa 2: WAF (bloquea ataques HTTP)
│  SecRuleEngine On — modo BLOQUEO        │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  Apache 2.4 + Headers de seguridad      │  ← Capa 3: cabeceras HTTP seguras
│  HSTS, X-Frame-Options, CSP, etc.       │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  Nextcloud                              │  ← Capa 4: aplicación
│  fail2ban monitorea login               │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  SELinux enforcing                      │  ← Capa 5: control de acceso del kernel
│  Apache no puede acceder fuera de       │
│  sus directorios autorizados            │
└─────────────────────────────────────────┘
```

### Nextcloud accesible en

```
http://10.27.34.20   (red institucional)
```

### Capacidad de almacenamiento

```
Filesystem: /dev/xvdb1
Size: 2.0T | Used: 39G (overhead XFS) | Available: 2.0T
Mounted on: /data/nextcloud
```

---

## 11. Checklist de migración a IP pública

Cuando el servidor sea reubicado en la casa del profesor, ejecutar estos pasos **en orden**. No saltarse ninguno.

---

### FASE 1 — Red y conectividad

- [ ] Conectar el servidor físico a la red de la casa del profesor
- [ ] Verificar que el servidor arranca y responde: `ping 10.27.34.20` (o la nueva IP)
- [ ] Abrir puertos en el router de la casa del profesor:

```
Puerto 22   → SSH (administración)
Puerto 80   → HTTP (redirección a HTTPS)
Puerto 443  → HTTPS (Nextcloud + sistema)
Puerto 1885 → MQTT (gateways Raspberry Pi)
Puerto 8889 → WebRTC/WHEP (streaming de cámaras)
```

- [ ] Confirmar que la IP pública es estable o configurar DDNS

---

### FASE 2 — HTTPS con Let's Encrypt

- [ ] Actualizar DNS: `nirmgroup.net` → nueva IP pública
- [ ] Esperar propagación DNS (hasta 24h): `nslookup nirmgroup.net`
- [ ] Instalar certbot y obtener certificado:

```bash
sudo dnf install -y certbot python3-certbot-apache
sudo certbot --apache -d nirmgroup.net
# Certbot modifica el VirtualHost automáticamente para HTTPS
```

- [ ] Agregar el dominio a Nextcloud como trusted_domain:

```bash
sudo -u apache php /var/www/nextcloud/occ config:system:set \
  trusted_domains 2 --value=nirmgroup.net
```

- [ ] Configurar renovación automática del certificado:

```bash
sudo systemctl enable --now certbot-renew.timer
# Verificar:
sudo certbot renew --dry-run
```

---

### FASE 3 — Ajustar WAF para dominio real

- [ ] Eliminar la exclusión temporal de la regla 920350 (ya no aplica con dominio):

```bash
sudo sed -i '/SecRuleRemoveById 920350/d' \
  /etc/httpd/modsecurity.d/local_rules/nextcloud-exclusions.conf
```

- [ ] Recargar Apache:

```bash
sudo apachectl configtest && sudo systemctl reload httpd
```

- [ ] Hacer pruebas de uso real y revisar logs:

```bash
sudo tail -f /var/log/httpd/modsec_audit.log
```

---

### FASE 4 — Migración del sistema MotorControlEnterprise

- [ ] En el servidor viejo (`177.247.175.4`), hacer backup de la base de datos:

```bash
pg_dump -U motor_ent MotorControlEnterprise > backup_prod_$(date +%Y%m%d).sql
```

- [ ] Copiar el backup al nuevo servidor:

```bash
scp backup_prod_*.sql Vyepez@<nueva-ip>:/tmp/
```

- [ ] En el nuevo servidor, instalar Docker Engine:

```bash
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl enable --now docker
```

- [ ] Copiar el `docker-compose.yml` del proyecto al nuevo servidor
- [ ] Restaurar la base de datos:

```bash
# Crear usuario y base de datos primero
sudo -u postgres psql -c "CREATE USER motor_ent WITH PASSWORD '***';"
sudo -u postgres psql -c "CREATE DATABASE \"MotorControlEnterprise\" OWNER motor_ent;"

# Restaurar datos
psql -U motor_ent MotorControlEnterprise < /tmp/backup_prod_*.sql
```

- [ ] Levantar el stack Docker:

```bash
docker compose up -d
```

- [ ] Verificar que todos los servicios responden
- [ ] Actualizar la configuración de las Raspberry Pi con la nueva IP de MQTT
- [ ] Ejecutar pruebas de UI con `/webapp-testing`
- [ ] Verificar streaming de cámaras con WebRTC/WHEP
- [ ] **Solo si todo funciona:** apagar el servidor viejo

---

### FASE 5 — Integración Nextcloud ↔ Sistema de Videos

- [ ] Agregar el volumen compartido en `docker-compose.yml` del backend:

```yaml
services:
  backend:
    volumes:
      - /data/nextcloud/data/videos:/app/recordings
```

- [ ] Crear la carpeta en Nextcloud como usuario admin
- [ ] Reiniciar el backend: `docker compose restart backend`
- [ ] Subir un video de prueba y verificar que aparece en Nextcloud
- [ ] Configurar escaneo automático de archivos:

```bash
# Agregar al crontab de apache (complementa el cron de Nextcloud)
sudo crontab -u apache -e
# Agregar:
0 * * * * php /var/www/nextcloud/occ files:scan --all --quiet
```

---

## 12. Comandos de administración frecuentes

### Estado general del sistema

```bash
# Ver todos los servicios de un vistazo
sudo systemctl status httpd php-fpm postgresql keydb fail2ban --no-pager

# Ver si el WAF está cargado
sudo httpd -M 2>/dev/null | grep security

# Ver modo del WAF (On = bloqueo, DetectionOnly = solo detección)
grep 'SecRuleEngine' /etc/httpd/conf.d/mod_security.conf
```

### Nextcloud

```bash
# Ver logs en tiempo real
sudo tail -f /var/log/nextcloud/nextcloud.log

# Escanear archivos nuevos (tras agregar videos desde el backend)
sudo -u apache php /var/www/nextcloud/occ files:scan --all

# Ejecutar mantenimiento manual
sudo -u apache php /var/www/nextcloud/occ maintenance:repair

# Ver estado de Nextcloud
sudo -u apache php /var/www/nextcloud/occ status
```

### WAF (ModSecurity)

```bash
# Ver eventos del WAF en tiempo real
sudo tail -f /var/log/httpd/modsec_audit.log

# Ver qué reglas se disparan más (para detectar falsos positivos)
sudo grep -o '"id":"[0-9]*"' /var/log/httpd/modsec_audit.log | \
  sort | uniq -c | sort -rn | head -20

# Cambiar entre modo detección y bloqueo
sudo sed -i 's/SecRuleEngine On/SecRuleEngine DetectionOnly/' /etc/httpd/conf.d/mod_security.conf
sudo systemctl reload httpd
```

### fail2ban

```bash
# Ver IPs actualmente baneadas
sudo fail2ban-client status nextcloud

# Desbanear una IP manualmente (si alguien se bloqueó por error)
sudo fail2ban-client set nextcloud unbanip <IP>
```

### Apache

```bash
# Ver logs de error
sudo tail -f /var/log/httpd/nextcloud_error.log

# Verificar sintaxis antes de reiniciar
sudo apachectl configtest

# Reiniciar todo el stack
sudo systemctl restart postgresql keydb php-fpm httpd
```

### Disco de datos

```bash
# Ver espacio disponible
df -h /data/nextcloud

# Ver los archivos más grandes
sudo du -sh /data/nextcloud/data/* | sort -rh | head -20
```

### Base de datos

```bash
# Acceder a la BD de Nextcloud
sudo -u postgres psql nextcloud

# Ver tamaño de la base de datos
sudo -u postgres psql -c "\l+" | grep nextcloud
```

---

## 13. Referencias rápidas

| Recurso | Dirección |
|---------|-----------|
| **Nextcloud (red local)** | `http://10.27.34.20` |
| **Panel XOA (gestión VMs)** | `https://10.27.34.28` |
| **Cockpit (gestión SO)** | `https://10.27.34.20:9090` |
| **Producción actual** | `victormanuel@177.247.175.4:2222` |

| Archivo | Propósito |
|---------|-----------|
| `/var/www/nextcloud` | Código de Nextcloud |
| `/data/nextcloud/data` | Archivos de los usuarios |
| `/var/www/nextcloud/config/config.php` | Configuración de Nextcloud |
| `/var/log/nextcloud/nextcloud.log` | Log de la aplicación |
| `/etc/httpd/conf.d/nextcloud.conf` | VirtualHost de Apache |
| `/etc/httpd/conf.d/mod_security.conf` | Config principal del WAF |
| `/etc/httpd/modsecurity.d/local_rules/nextcloud-exclusions.conf` | Exclusiones WAF para Nextcloud |
| `/etc/httpd/crs/` | Reglas OWASP CRS 4.9.0 |
| `/var/log/httpd/modsec_audit.log` | Log de eventos del WAF |
| `/etc/fail2ban/jail.d/nextcloud.conf` | Config de fail2ban |
| `/etc/php.d/99-nextcloud.ini` | Config PHP optimizada |
| `/var/lib/pgsql/data/pg_hba.conf` | Autenticación PostgreSQL |
| `/etc/fstab` | Montaje del disco de datos |
