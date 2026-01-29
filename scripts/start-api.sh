#!/bin/sh
set -x

echo "============================================"
echo "Starting Cal.com API v2"
echo "============================================"

# Aguardar banco de dados estar disponível
if [ -n "$DATABASE_HOST" ]; then
  echo "Waiting for database at $DATABASE_HOST..."
  scripts/wait-for-it.sh ${DATABASE_HOST} -- echo "Database is up!"
fi

# Rodar migrações do Prisma
echo "Running database migrations..."
npx prisma migrate deploy --schema /calcom/packages/prisma/schema.prisma

# Iniciar API
echo "Starting API server..."
yarn workspace @calcom/api-v2 start:prod
