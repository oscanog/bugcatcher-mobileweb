#!/usr/bin/env bash

set -euo pipefail

APP_NAME="bugcatcher-mobileweb"
REPO_DIR="${REPO_DIR:-/var/www/${APP_NAME}}"
REPO_URL="${REPO_URL:-https://github.com/oscanog/bugcatcher-mobileweb.git}"
BRANCH="${BRANCH:-main}"
WEB_ROOT="${REPO_DIR}/dist"
NGINX_AVAILABLE="/etc/nginx/sites-available/${APP_NAME}.conf"
NGINX_ENABLED="/etc/nginx/sites-enabled/${APP_NAME}.conf"
NGINX_SOURCE="${REPO_DIR}/infra/nginx/bugcatcher-mobileweb.conf"
CERT_NAME="${APP_NAME}"
CERT_FULLCHAIN="/etc/letsencrypt/live/${CERT_NAME}/fullchain.pem"

if [ ! -d "${REPO_DIR}/.git" ]; then
  sudo mkdir -p "$(dirname "${REPO_DIR}")"
  sudo git clone --branch "${BRANCH}" "${REPO_URL}" "${REPO_DIR}"
  sudo chown -R "${USER}:${USER}" "${REPO_DIR}"
fi

sudo chown -R "${USER}:${USER}" "${REPO_DIR}"
git -C "${REPO_DIR}" fetch origin
git -C "${REPO_DIR}" checkout "${BRANCH}"
git -C "${REPO_DIR}" pull --ff-only origin "${BRANCH}"

cd "${REPO_DIR}"
npm ci
npm run build

if [ ! -d "${WEB_ROOT}" ]; then
  echo "dist directory is missing after build" >&2
  exit 1
fi

if [ ! -f "${NGINX_SOURCE}" ]; then
  echo "nginx config is missing from repository" >&2
  exit 1
fi

mkdir -p "${WEB_ROOT}/.well-known/acme-challenge"
chmod -R a+rX "${WEB_ROOT}"

if [ ! -f "${CERT_FULLCHAIN}" ]; then
  BOOTSTRAP_CONFIG="$(mktemp)"

  cat <<'EOF' > "${BOOTSTRAP_CONFIG}"
server {
    listen 80;
    listen [::]:80;
    server_name m.bugcatcher.online mobile.bugcatcher.online;

    root /var/www/bugcatcher-mobileweb/dist;
    index index.html;

    location /.well-known/acme-challenge/ {
        allow all;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~ /\.(?!well-known) {
        deny all;
    }
}
EOF

  sudo install -m 644 "${BOOTSTRAP_CONFIG}" "${NGINX_AVAILABLE}"
  sudo ln -sfn "${NGINX_AVAILABLE}" "${NGINX_ENABLED}"
  rm -f "${BOOTSTRAP_CONFIG}"

  sudo nginx -t
  sudo systemctl reload nginx

  sudo certbot certonly \
    --webroot \
    -w "${WEB_ROOT}" \
    -d m.bugcatcher.online \
    -d mobile.bugcatcher.online \
    --cert-name "${CERT_NAME}" \
    --non-interactive \
    --agree-tos \
    --keep-until-expiring
fi

sudo install -m 644 "${NGINX_SOURCE}" "${NGINX_AVAILABLE}"
sudo ln -sfn "${NGINX_AVAILABLE}" "${NGINX_ENABLED}"
sudo nginx -t
sudo systemctl reload nginx
