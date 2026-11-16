#!/bin/sh
set -e

echo ">> Sincronizando esquema Prisma con PostgreSQL..."
/app/node_modules/.bin/prisma db push --skip-generate --schema=/app/apps/api/prisma/schema.prisma

if [ "${AUTO_SEED:-true}" = "true" ]; then
  USER_COUNT=$(NODE_PATH=/app/node_modules node -e "import('/app/node_modules/@prisma/client/default.js').then(async ({PrismaClient})=>{const p=new PrismaClient(); try{console.log(await p.user.count())}catch{console.log(0)}finally{await p.\$disconnect()}}).catch(()=>console.log(0))")
  if [ "${USER_COUNT}" = "0" ]; then
    echo ">> Base vacía detectada: cargando datos iniciales (seed)..."
    if [ -f "/app/apps/api/dist/prisma/seed.js" ]; then
      node /app/apps/api/dist/prisma/seed.js
    elif [ -f "/app/apps/api/dist/seed.js" ]; then
      node /app/apps/api/dist/seed.js
    fi
  else
    echo ">> Base ya inicializada (${USER_COUNT} usuarios), omitiendo seed."
  fi
fi

echo ">> Iniciando TerrenoCNR API en puerto ${PORT:-4000}..."
exec node /app/apps/api/dist/src/server.js
