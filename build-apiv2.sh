#!/bin/bash
# ============================================
# Script para build da imagem Cal.com API v2
# ============================================

# Configurações
IMAGE_NAME="impa365/calcom-apiv2"
VERSION="v6.1.5"

# Variáveis de banco (necessárias para o Prisma gerar os tipos)
# Use um banco temporário ou o seu banco de produção
DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/calcom}"

echo "============================================"
echo "Building Cal.com API v2 - $VERSION"
echo "============================================"

# Build da imagem
docker build \
    --file Dockerfile.apiv2 \
    --build-arg DATABASE_URL="$DATABASE_URL" \
    --build-arg DATABASE_DIRECT_URL="$DATABASE_URL" \
    --build-arg NEXTAUTH_SECRET="build-time-secret" \
    --build-arg CALENDSO_ENCRYPTION_KEY="build-time-secret-24ch" \
    --tag "$IMAGE_NAME:$VERSION" \
    --tag "$IMAGE_NAME:latest" \
    .

# Verificar se o build foi bem sucedido
if [ $? -eq 0 ]; then
    echo ""
    echo "============================================"
    echo "✅ Build concluído com sucesso!"
    echo "============================================"
    echo ""
    echo "Imagens criadas:"
    echo "  - $IMAGE_NAME:$VERSION"
    echo "  - $IMAGE_NAME:latest"
    echo ""
    echo "Para fazer push para o Docker Hub:"
    echo "  docker push $IMAGE_NAME:$VERSION"
    echo "  docker push $IMAGE_NAME:latest"
    echo ""
else
    echo ""
    echo "============================================"
    echo "❌ Erro no build!"
    echo "============================================"
    exit 1
fi
