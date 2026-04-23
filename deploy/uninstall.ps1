#Requires -Version 5.1
<#
.SYNOPSIS
    Removes the ConnectWise Manage MCP server and its Claude Desktop config entry.
.DESCRIPTION
    - Deletes %LOCALAPPDATA%\Programs\ConnectWiseMCP\
    - Removes the 'connectwise' key from claude_desktop_config.json
    - Does NOT remove Node.js
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$InstallDir       = Join-Path $env:LOCALAPPDATA 'Programs\ConnectWiseMCP'
$ClaudeConfigPath = Join-Path $env:APPDATA 'Claude\claude_desktop_config.json'

Write-Host ""
Write-Host "ConnectWise Manage MCP Uninstaller" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""

# Remove server files
if (Test-Path $InstallDir) {
    Remove-Item $InstallDir -Recurse -Force
    Write-Host "  Removed $InstallDir" -ForegroundColor Green
} else {
    Write-Host "  Server not found at $InstallDir — skipping" -ForegroundColor Yellow
}

# Remove entry from claude_desktop_config.json
if (Test-Path $ClaudeConfigPath) {
    $json = Get-Content $ClaudeConfigPath -Raw | ConvertFrom-Json
    if ($json.PSObject.Properties['mcpServers'] -and
        $json.mcpServers.PSObject.Properties['connectwise']) {
        $json.mcpServers.PSObject.Properties.Remove('connectwise')
        $json | ConvertTo-Json -Depth 10 | Set-Content $ClaudeConfigPath -Encoding UTF8
        Write-Host "  Removed 'connectwise' from claude_desktop_config.json" -ForegroundColor Green
    } else {
        Write-Host "  No 'connectwise' entry in claude_desktop_config.json — skipping" -ForegroundColor Yellow
    }
} else {
    Write-Host "  claude_desktop_config.json not found — skipping" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Uninstall complete. Restart Claude Desktop." -ForegroundColor Green
Write-Host ""
