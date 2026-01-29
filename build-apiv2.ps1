# ============================================
# Script para build da imagem Cal.com API v2
# PowerShell para Windows
# ============================================

param(
    [string]$DatabaseUrl = "postgresql://postgres:postgres@localhost:5432/calcom"
)

# Configurações
$ImageName = "impa365/apiv2calcom"
$Version = "v6.1.5-new"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Building Cal.com API v2 - $Version" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# Build da imagem
docker build `
    --file Dockerfile.apiv2 `
    --build-arg DATABASE_URL="$DatabaseUrl" `
    --build-arg DATABASE_DIRECT_URL="$DatabaseUrl" `
    --build-arg NEXTAUTH_SECRET="build-time-secret" `
    --build-arg CALENDSO_ENCRYPTION_KEY="build-time-secret-24ch" `
    --tag "${ImageName}:${Version}" `
    --tag "${ImageName}:latest" `
    .

# Verificar se o build foi bem sucedido
if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Green
    Write-Host "✅ Build concluído com sucesso!" -ForegroundColor Green
    Write-Host "============================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Imagens criadas:"
    Write-Host "  - ${ImageName}:${Version}"
    Write-Host "  - ${ImageName}:latest"
    Write-Host ""
    Write-Host "Para fazer push para o Docker Hub:"
    Write-Host "  docker push ${ImageName}:${Version}"
    Write-Host "  docker push ${ImageName}:latest"
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Red
    Write-Host "❌ Erro no build!" -ForegroundColor Red
    Write-Host "============================================" -ForegroundColor Red
    exit 1
}
