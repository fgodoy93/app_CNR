#!/bin/bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/app_CNR}"
ENV_FILE="${APP_DIR}/apps/api/.env"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/terreno-cnr}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP=$(date +"%Y-%m-%d_%H%M")

mkdir -p "${BACKUP_DIR}"

if [ -f "${ENV_FILE}" ]; then
  # Cargar DATABASE_URL y STORAGE_DIR sin exportar comentarios
  DATABASE_URL=$(grep -E '^DATABASE_URL=' "${ENV_FILE}" | head -n1 | cut -d'=' -f2-)
  STORAGE_DIR=$(grep -E '^STORAGE_DIR=' "${ENV_FILE}" | head -n1 | cut -d'=' -f2-)
fi

STORAGE_DIR="${STORAGE_DIR:-${APP_DIR}/apps/api/storage}"

if [ -n "${DATABASE_URL:-}" ]; then
  echo ">> Respaldando PostgreSQL..."
  pg_dump "${DATABASE_URL}" | gzip > "${BACKUP_DIR}/db-${STAMP}.sql.gz"
else
  echo "ADVERTENCIA: No se encontró DATABASE_URL en ${ENV_FILE}"
fi

if [ -d "${STORAGE_DIR}" ]; then
  echo ">> Respaldando evidencias y PDFs (${STORAGE_DIR})..."
  tar -czf "${BACKUP_DIR}/storage-${STAMP}.tar.gz" -C "$(dirname "${STORAGE_DIR}")" "$(basename "${STORAGE_DIR}")"
fi

echo ">> Limpiando respaldos anteriores a ${RETENTION_DAYS} días..."
find "${BACKUP_DIR}" -type f \( -name "db-*.sql.gz" -o -name "storage-*.tar.gz" \) -mtime +"${RETENTION_DAYS}" -delete

echo ">> Backup completado en ${BACKUP_DIR} (${STAMP})"
