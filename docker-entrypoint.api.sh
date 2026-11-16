#!/bin/sh
set -e

echo ">> Sincronizando esquema Prisma con PostgreSQL..."
npx prisma db push --skip-generate

if [ "${AUTO_SEED:-true}" = "true" ]; then
  USER_COUNT=$(node -e "import('@prisma/client').then(async ({PrismaClient})=>{const p=new PrismaClient(); try{console.log(await p.user.count())}catch{console.log(0)}finally{await p.\$disconnect()}})")
  if [ "${USER_COUNT}" = "0" ]; then
    echo ">> Base vacía detectada: cargando datos iniciales (seed)..."
    if [ -f "dist/prisma/seed.js" ]; then
      node dist/prisma/seed.js
    elif [ -f "dist/seed.js" ]; then
      node dist/seed.js
    fi
  else
    echo ">> Base ya inicializada (${USER_COUNT} usuarios), omitiendo seed."
  fi
fi

echo ">> Iniciando TerrenoCNR API en puerto ${PORT:-4000}..."
exec node dist/src/server.js
