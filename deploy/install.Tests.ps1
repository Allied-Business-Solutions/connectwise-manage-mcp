#Requires -Modules Pester
BeforeAll {
    $env:PESTER_TESTING = '1'
    . "$PSScriptRoot\install.ps1"
    Remove-Item Env:\PESTER_TESTING
}

Describe 'Merge-ClaudeConfig' {
    BeforeEach {
        $TestConfigPath = Join-Path $TestDrive 'claude_desktop_config.json'
    }

    It 'creates the file with mcpServers if it does not exist' {
        $entry = [PSCustomObject]@{ command = 'node'; args = @('C:\test\index.js') }
        Merge-ClaudeConfig -ConfigPath $TestConfigPath -McpEntry $entry

        Test-Path $TestConfigPath | Should -BeTrue
        $result = Get-Content $TestConfigPath -Raw | ConvertFrom-Json
        $result.mcpServers.connectwise.command | Should -Be 'node'
    }

    It 'merges into existing file without removing other mcp servers' {
        $existing = @{ mcpServers = @{ other_server = @{ command = 'python' } } }
        $existing | ConvertTo-Json -Depth 5 | Set-Content $TestConfigPath -Encoding UTF8

        $entry = [PSCustomObject]@{ command = 'node'; args = @('C:\test\index.js') }
        Merge-ClaudeConfig -ConfigPath $TestConfigPath -McpEntry $entry

        $result = Get-Content $TestConfigPath -Raw | ConvertFrom-Json
        $result.mcpServers.connectwise.command | Should -Be 'node'
        $result.mcpServers.other_server.command | Should -Be 'python'
    }

    It 'overwrites the connectwise entry on re-run' {
        $first = [PSCustomObject]@{ command = 'node'; args = @('C:\old\index.js') }
        Merge-ClaudeConfig -ConfigPath $TestConfigPath -McpEntry $first

        $second = [PSCustomObject]@{ command = 'node'; args = @('C:\new\index.js') }
        Merge-ClaudeConfig -ConfigPath $TestConfigPath -McpEntry $second

        $result = Get-Content $TestConfigPath -Raw | ConvertFrom-Json
        $result.mcpServers.connectwise.args[0] | Should -Be 'C:\new\index.js'
    }

    It 'creates parent directory if Claude config dir does not exist' {
        $nestedPath = Join-Path $TestDrive 'Claude\claude_desktop_config.json'
        $entry = [PSCustomObject]@{ command = 'node'; args = @() }
        Merge-ClaudeConfig -ConfigPath $nestedPath -McpEntry $entry
        Test-Path $nestedPath | Should -BeTrue
    }
}
