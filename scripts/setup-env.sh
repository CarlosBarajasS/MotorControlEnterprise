#!/bin/bash
# =============================================================
# setup-env.sh — Generador de .env con credenciales seguras
# Uso: bash scripts/setup-env.sh
# =============================================================

set -e

ENV_FILE=".env"

if [ -f "$ENV_FILE" ]; then
  echo "⚠️  Ya existe un .env. Para regenerarlo bórralo primero."
  exit 1
fi

# Genera una cadena aleatoria segura
gen_secret() {
  openssl rand -base64 48 | tr -d '/+=' | head -c "$1"
}

POSTGRES_USER="motor_ent"
POSTGRES_PASSWORD=$(gen_secret 32)
POSTGRES_DB="MotorControlEnterprise"
JWT_SECRET=$(gen_secret 64)

echo "📧 Email del primer admin:"
read -r ADMIN_EMAIL
if [ -z "$ADMIN_EMAIL" ]; then
  ADMIN_EMAIL="admin@motorcontrol.com"
fi

echo "🔑 Contraseña del primer admin (mín. 8 chars, Enter para generar automáticamente):"
read -rs ADMIN_PASSWORD
if [ -z "$ADMIN_PASSWORD" ]; then
  ADMIN_PASSWORD=$(gen_secret 16)
  echo "(generada automáticamente)"
fi

cat > "$ENV_FILE" << EOF
# =============================================
# MotorControl Enterprise — Credenciales
# Generado el $(date '+%Y-%m-%d %H:%M')
# ⚠️  NUNCA subas este archivo a git
# =============================================

# --- Base de datos ---
POSTGRES_USER=${POSTGRES_USER}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=${POSTGRES_DB}

# --- JWT ---
JWT_SECRET_KEY=${JWT_SECRET}

# --- MQTT ---
MQTT_HOST=mosquitto
MQTT_PORT=1883

# --- Puertos expuestos ---
BACKEND_PORT=8090
POSTGRES_PORT=5433

# --- Primer admin (eliminar después del primer login) ---
Seed__AdminEmail=${ADMIN_EMAIL}
Seed__AdminPassword=${ADMIN_PASSWORD}
EOF

chmod 600 "$ENV_FILE"

echo ""
echo "✅ .env creado con credenciales seguras."
echo ""
echo "┌─────────────────────────────────────────┐"
echo "│  Guarda estos datos en un lugar seguro  │"
echo "├─────────────────────────────────────────┤"
printf "│  Admin email:    %-24s│\n" "$ADMIN_EMAIL"
printf "│  Admin password: %-24s│\n" "$ADMIN_PASSWORD"
echo "└─────────────────────────────────────────┘"
echo ""
echo "⚠️  Elimina Seed__AdminEmail y Seed__AdminPassword del .env"
echo "    una vez que hayas iniciado sesión por primera vez."
echo ""
echo "🚀 Siguiente paso:"
echo "    docker compose up -d --build"
