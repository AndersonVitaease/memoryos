# download-extension.ps1
# Baixa os arquivos da extensao MemoryOS Browser Bridge (v0.3.1+) do backend.
# Uso: powershell -ExecutionPolicy Bypass -File download-extension.ps1 -BaseUrl "https://ever-mind-core.base44.app" -OutDir ".\memoryos-extension"

param(
    [Parameter(Mandatory=$false)]
    [string]$BaseUrl = "https://ever-mind-core.base44.app",

    [Parameter(Mandatory=$false)]
    [string]$OutDir = ".\memoryos-extension",

    [Parameter(Mandatory=$false)]
    [string]$Token
)

$ErrorActionPreference = "Stop"

# Garante que o OutDir e absoluto e existe
$OutDirFull = (Resolve-Path -LiteralPath (Split-Path -Parent $OutDir) -ErrorAction SilentlyContinue)
if (-not $OutDirFull) {
    $OutDirFull = (Get-Location).Path
}
$Target = Join-Path $OutDirFull (Split-Path -Leaf $OutDir)
if (-not (Test-Path -LiteralPath $Target)) {
    New-Item -ItemType Directory -Path $Target -Force | Out-Null
}

$Endpoint = "$($BaseUrl.TrimEnd('/'))/functions/extensionDownload"
Write-Host "Baixando de: $Endpoint" -ForegroundColor Cyan

$headers = @{ "Content-Type" = "application/json" }
if ($Token) {
    $headers["Authorization"] = "Bearer $Token"
}

# Corpo vazio — o endpoint devolve todos os arquivos
$body = "{}"
try {
    $response = Invoke-RestMethod -Uri $Endpoint -Method Post -Headers $headers -Body $body -TimeoutSec 60
} catch {
    Write-Host "ERRO ao chamar o endpoint: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $raw = $reader.ReadToEnd()
        Write-Host "Resposta do servidor: $raw" -ForegroundColor Red
    }
    exit 1
}

if (-not $response.ok) {
    Write-Host "Endpoint retornou erro: $($response.error)" -ForegroundColor Red
    exit 1
}

$version = $response.version
Write-Host "Versao no servidor: $version" -ForegroundColor Green
Write-Host "Arquivos disponiveis: $([math]::Min($response.files.PSObject.Properties.Count, 99))" -ForegroundColor Green

$saved = 0
foreach ($prop in $response.files.PSObject.Properties) {
    $name = $prop.Name
    $content = $prop.Value
    if (-not $content) { continue }
    $targetPath = Join-Path $Target $name
    # Garante subdiretorios se existirem no nome (nao esperado, mas seguro)
    $parent = Split-Path -Parent $targetPath
    if ($parent -and -not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    # Escreve como UTF-8 sem BOM (Node lê melhor assim)
    [System.IO.File]::WriteAllText($targetPath, $content, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "  OK  $name ($($content.Length) bytes)" -ForegroundColor Green
    $saved++
}

Write-Host ""
Write-Host "Concluido: $saved arquivo(s) salvos em: $Target" -ForegroundColor Cyan
Write-Host ""
Write-Host "Proximos passos:" -ForegroundColor Yellow
Write-Host "  1. Abra chrome://extensions" -ForegroundColor Yellow
Write-Host "  2. Ative 'Modo do desenvolvedor' (canto superior direito)" -ForegroundColor Yellow
Write-Host "  3. Clique 'Carregar descompactado' e selecione a pasta: $Target" -ForegroundColor Yellow
Write-Host "  4. Se ja tinha a extensao instalada, clique no botao 'Atualizar' dela" -ForegroundColor Yellow
Write-Host "  5. Abra o popup -> 'Autenticar com a aba atual do MemoryOS' (aba do app logada)" -ForegroundColor Yellow