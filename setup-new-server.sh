#!/usr/bin/env bash
# =============================================================================
# setup-new-server.sh — Primer despliegue en servidor nuevo
# =============================================================================
# Uso:  chmod +x setup-new-server.sh && sudo ./setup-new-server.sh
#
# Qué hace:
#   1. Verifica que existe el archivo .env
#   2. Crea la red Docker compartida con edge devices
#   3. Genera el archivo de contraseñas de Mosquitto
#   4. Levanta todos los contenedores
# =============================================================================
set -e

# ── Colores ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[!!]${NC} $1"; }
fail() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

echo "================================================================"
echo " MotorControl Enterprise — Setup inicial"
echo "================================================================"

# ── 1. Verificar .env ────────────────────────────────────────────────────────
if [ ! -f .env ]; then
    fail ".env no encontrado. Copia .env.example como .env y rellena los valores."
fi

source .env

REQUIRED_VARS=(POSTGRES_PASSWORD JWT_SECRET_KEY MEDIAMTX_EDGE_PASS MEDIAMTX_RELAY_PASS MQTT_BACKEND_PASS)
for var in "${REQUIRED_VARS[@]}"; do
    val="${!var}"
    if [ -z "$val" ] || [[ "$val" == CHANGE_THIS* ]]; then
        fail "La variable $var no está configurada correctamente en .env"
    fi
done
ok ".env verificado"

# ── 2. Red Docker compartida ─────────────────────────────────────────────────
if ! docker network ls | grep -q shared-edge-network; then
    docker network create shared-edge-network
    ok "Red Docker 'shared-edge-network' creada"
else
    warn "Red 'shared-edge-network' ya existe — omitiendo creación"
fi

# ── 3. Archivo de contraseñas Mosquitto ──────────────────────────────────────
echo ""
echo "Generando archivo de contraseñas de Mosquitto..."

# Crear passwd vacío si no existe
touch mosquitto-passwd

# Usar el contenedor de mosquitto para generar los hashes de contraseñas
# Usuario: enterprise-server  (usado por el backend .NET)
docker run --rm \
    -v "$(pwd)/mosquitto-passwd:/mosquitto/config/passwd" \
    eclipse-mosquitto:2.0 \
    mosquitto_passwd -b /mosquitto/config/passwd enterprise-server "${MQTT_BACKEND_PASS}"

# Usuario: edge-client (usado por los edge gateways remotos)
# Cada edge puede usar su propio usuario — este es el genérico para el template
docker run --rm \
    -v "$(pwd)/mosquitto-passwd:/mosquitto/config/passwd" \
    eclipse-mosquitto:2.0 \
    mosquitto_passwd -b /mosquitto/config/passwd edge-client "${MQTT_BACKEND_PASS}"

ok "Archivo mosquitto-passwd generado con usuarios: enterprise-server, edge-client"

# ── 4. Rutas NAS ─────────────────────────────────────────────────────────────
NAS_RECS="${NAS_RECORDINGS_PATH:-/mnt/nas/recordings}"
NAS_BKPS="${NAS_BACKUPS_PATH:-/mnt/nas/backups}"

mkdir -p "$NAS_RECS" "$NAS_BKPS"
ok "Directorios NAS asegurados: $NAS_RECS | $NAS_BKPS"

# ── 5. Construir y levantar ──────────────────────────────────────────────────
echo ""
echo "Construyendo e iniciando contenedores..."
docker compose up -d --build

echo ""
echo "================================================================"
ok "Setup completado. Contenedores activos:"
docker compose ps --format "table {{.Name}}\t{{.Status}}"
echo ""
echo -e "${YELLOW}IMPORTANTE:${NC}"
echo "  - Borra 'Seed__AdminEmail' y 'Seed__AdminPassword' de .env después del primer login"
echo "  - El panel estará disponible en http://<IP_SERVIDOR>"
echo "================================================================"
