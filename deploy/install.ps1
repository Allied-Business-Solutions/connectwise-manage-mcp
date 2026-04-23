#Requires -Version 5.1
<#
.SYNOPSIS
    Installs the ConnectWise Manage MCP server for Claude Desktop.
.DESCRIPTION
    - Installs Node.js 20 LTS via winget if not already present
    - Downloads the latest release from GitHub
    - Extracts to %LOCALAPPDATA%\Programs\ConnectWiseMCP\
    - Prompts for individual CWM API credentials
    - Writes the connectwise entry into claude_desktop_config.json
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$InstallDir       = Join-Path $env:LOCALAPPDATA 'Programs\ConnectWiseMCP'
$ClaudeConfigPath = Join-Path $env:APPDATA 'Claude\claude_desktop_config.json'
$RepoOwner        = 'Allied-Business-Solutions'
$RepoName         = 'allied-mcp-servers'
$AssetPattern     = 'connectwise-mcp-*.zip'

# ── Functions ─────────────────────────────────────────────────────────────────

function Get-NodeMajorVersion {
    try {
        $output = & node --version 2>&1
        if ($LASTEXITCODE -eq 0 -and $output -match 'v(\d+)\.') {
            return [int]$Matches[1]
        }
    } catch { Write-Verbose "node --version check failed: $_" }
    return 0
}

function Install-NodeLts {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        throw "winget is not available on this system. Please install Node.js 20+ manually from https://nodejs.org and re-run this script."
    }
    Write-Host "  Installing Node.js LTS via winget..." -ForegroundColor Yellow
    winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) {
        throw "winget failed to install Node.js (exit code $LASTEXITCODE). Install manually from https://nodejs.org and re-run."
    }
    # Refresh PATH so node is available in this session
    $machinePath = [System.Environment]::GetEnvironmentVariable('PATH', 'Machine')
    $userPath    = [System.Environment]::GetEnvironmentVariable('PATH', 'User')
    $env:PATH    = "$machinePath;$userPath"
}

function Get-LatestAssetUrl {
    $apiUrl  = "https://api.github.com/repos/$RepoOwner/$RepoName/releases/latest"
    $release = Invoke-RestMethod -Uri $apiUrl -Headers @{ 'User-Agent' = 'ConnectWiseMCP-Installer' }
    $asset   = $release.assets | Where-Object { $_.name -like $AssetPattern } | Select-Object -First 1
    if (-not $asset) {
        throw "No asset matching '$AssetPattern' found in the latest release of $RepoOwner/$RepoName."
    }
    return $asset.browser_download_url
}

function Install-ReleaseFiles {
    param([string]$DownloadUrl)
    $zipPath    = Join-Path $env:TEMP 'connectwise-mcp-latest.zip'
    $stagingDir = "$InstallDir-staging"
    Write-Host "  Downloading release..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri $DownloadUrl -OutFile $zipPath -UseBasicParsing
    Write-Host "  Extracting to $InstallDir..." -ForegroundColor Yellow
    if (Test-Path $stagingDir) { Remove-Item $stagingDir -Recurse -Force }
    New-Item -ItemType Directory -Path $stagingDir -Force | Out-Null
    Expand-Archive -Path $zipPath -DestinationPath $stagingDir -Force
    Remove-Item $zipPath -ErrorAction SilentlyContinue
    if (Test-Path $InstallDir) { Remove-Item $InstallDir -Recurse -Force }
    Rename-Item $stagingDir $InstallDir
}

function Read-NonEmptyString {
    param([string]$Prompt, [switch]$Masked)
    while ($true) {
        if ($Masked) {
            $secure = Read-Host $Prompt -AsSecureString
            $value  = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
                          [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
        } else {
            $value = Read-Host $Prompt
        }
        if ($value.Trim() -ne '') { return $value.Trim() }
        Write-Host "  Value cannot be empty. Please try again." -ForegroundColor Yellow
    }
}

function Merge-ClaudeConfig {
    param(
        [string]$ConfigPath,
        [PSCustomObject]$McpEntry
    )
    if (Test-Path $ConfigPath) {
        $json = Get-Content $ConfigPath -Raw | ConvertFrom-Json
    } else {
        New-Item -ItemType Directory -Path (Split-Path $ConfigPath) -Force | Out-Null
        $json = [PSCustomObject]@{}
    }
    if (-not $json.PSObject.Properties['mcpServers']) {
        $json | Add-Member -MemberType NoteProperty -Name 'mcpServers' -Value ([PSCustomObject]@{})
    }
    $json.mcpServers | Add-Member -MemberType NoteProperty -Name 'connectwise' -Value $McpEntry -Force
    [System.IO.File]::WriteAllText(
        $ConfigPath,
        ($json | ConvertTo-Json -Depth 10),
        [System.Text.UTF8Encoding]::new($false)
    )
}

# ── Main ──────────────────────────────────────────────────────────────────────
# Guard: allow dot-sourcing for tests without running main
if ($env:PESTER_TESTING -eq '1') { return }

Write-Host ""
Write-Host "ConnectWise Manage MCP Installer" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# 1. Node.js
Write-Host "Checking Node.js..." -ForegroundColor Cyan
$nodeVersion = Get-NodeMajorVersion
if ($nodeVersion -ge 20) {
    Write-Host "  Node.js v$nodeVersion found" -ForegroundColor Green
} else {
    Install-NodeLts
    $nodeVersion = Get-NodeMajorVersion
    if ($nodeVersion -lt 20) {
        Write-Error "Node.js installed but version check still failed. Open a new terminal and re-run this script."
        exit 1
    }
    Write-Host "  Node.js v$nodeVersion installed" -ForegroundColor Green
}

# 2. Download + extract
Write-Host ""
Write-Host "Downloading latest release..." -ForegroundColor Cyan
$assetUrl = Get-LatestAssetUrl
Install-ReleaseFiles -DownloadUrl $assetUrl
Write-Host "  Server files installed to $InstallDir" -ForegroundColor Green

# 3. Collect credentials
Write-Host ""
Write-Host "ConnectWise Manage API Credentials" -ForegroundColor Cyan
Write-Host "-----------------------------------"
Write-Host "Where to find these values:"
Write-Host "  Public/Private Key : CWM > System > Members > (your account) > API Keys tab"
Write-Host "  Client ID          : https://developer.connectwise.com (register a new app)"
Write-Host ""

$site       = Read-NonEmptyString "CWM site hostname (e.g. cwm.yourcompany.com)"
$companyId  = Read-NonEmptyString "Company ID"
$publicKey  = Read-NonEmptyString "Public Key"
$privateKey = Read-NonEmptyString "Private Key" -Masked
$clientId   = Read-NonEmptyString "Client ID (GUID)"

# 4. Write claude_desktop_config.json
Write-Host ""
Write-Host "Writing claude_desktop_config.json..." -ForegroundColor Cyan

$mcpEntry = [PSCustomObject]@{
    command = 'node'
    args    = @("$InstallDir\dist\index.js")
    env     = [PSCustomObject]@{
        CWM_SITE        = $site
        CWM_COMPANY_ID  = $companyId
        CWM_PUBLIC_KEY  = $publicKey
        CWM_PRIVATE_KEY = $privateKey
        CWM_CLIENT_ID   = $clientId
    }
}
Merge-ClaudeConfig -ConfigPath $ClaudeConfigPath -McpEntry $mcpEntry
Write-Host "  $ClaudeConfigPath updated" -ForegroundColor Green

# 5. Done
Write-Host ""
Write-Host "Installation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Restart Claude Desktop"
Write-Host "  2. Ask Claude: 'Run cw_ping' to verify the connection"
Write-Host "  3. If you see a 401 error, check your credentials in:"
Write-Host "       $ClaudeConfigPath"
Write-Host ""
