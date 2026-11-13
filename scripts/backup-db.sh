#!/usr/bin/env bash
set -euo pipefail

BACKUP_ROOT="${BACKUP_ROOT:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
STAMP="$(date +%Y%m%d-%H%M%S)"
TARGET_DIR="${BACKUP_ROOT}/${STAMP}"
mkdir -p "${TARGET_DIR}"

echo "[1/3] Respaldando PostgreSQL..."
if command -v pg_dump >/dev/null 2>&1 && [ -n "${DATABASE_URL:-}" ]; then
  pg_dump "${DATABASE_URL}" --format=custom --file "${TARGET_DIR}/terreno_cnr.dump"
else
  docker exec terreno-postgres pg_dump -U postgres -Fc terreno_cnr > "${TARGET_DIR}/terreno_cnr.dump"
fi

echo "[2/3] Respaldando evidencias y documentos..."
if [ -d "./apps/api/storage" ]; then
  tar -czf "${TARGET_DIR}/storage.tar.gz" -C "./apps/api/storage" .
fi

echo "[3/3] Limpiando respaldos mayores a ${RETENTION_DAYS} días..."
find "${BACKUP_ROOT}" -mindepth 1 -maxdepth 1 -type d -mtime +"${RETENTION_DAYS}" -exec rm -rf {} +

echo "Respaldo completado en: ${TARGET_DIR}"
