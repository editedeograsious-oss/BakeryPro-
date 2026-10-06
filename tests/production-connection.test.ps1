$ErrorActionPreference = 'Stop'
$helper = Join-Path $PSScriptRoot '..\recovery\cloud\prepare-production-connection.ps1'
$script:FixtureTemplate = ''
$script:FixturePassword = 'TEST_ONLY_A@B:C/?#& %[]'
$script:Copied = $null
$script:SecureReads = 0

function global:Read-Host {
    param([string]$Prompt, [switch]$AsSecureString)
    if ($AsSecureString) {
        $script:SecureReads++
        return (ConvertTo-SecureString $script:FixturePassword -AsPlainText -Force)
    }
    return $script:FixtureTemplate
}
function global:Set-Clipboard {
    [CmdletBinding()]
    param([string]$Value)
    $script:Copied = $Value
}
function Assert-Check {
    param([bool]$Condition, [string]$Reason)
    if (-not $Condition) { throw $Reason }
}

# These are fictional credentials. This test opens no database/network connection
# and intercepts clipboard writes; it reads no repository secret.
$template = 'postgresql://postgres.sgmmiymjnqqorvtvpigw:[YOUR-PASSWORD]@aws-1-eu-central-1.pooler.supabase.com:5432/postgres'
$expected = 'postgresql://postgres.sgmmiymjnqqorvtvpigw:TEST_ONLY_A%40B%3AC%2F%3F%23%26%20%25%5B%5D@aws-1-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require'
foreach ($suffix in @('', '?sslmode=require', '?sslmode=verify-full')) {
    $script:FixtureTemplate = $template + $suffix
    $script:Copied = $null
    $script:SecureReads = 0
    $output = (. $helper *>&1 | Out-String)
    $wanted = $expected
    if ($suffix -eq '?sslmode=verify-full') { $wanted = $expected.Replace('sslmode=require','sslmode=verify-full') }
    Assert-Check ($script:Copied -ceq $wanted) 'Production URI or password-symbol encoding did not match'
    Assert-Check ($script:SecureReads -eq 1) 'The private password prompt did not run exactly once'
    Assert-Check (-not $output.Contains($script:FixturePassword)) 'Private password printed'
    Assert-Check (-not $output.Contains($script:Copied)) 'Completed private URI printed'
}
foreach ($invalid in @(
    $template.Replace('sgmmiymjnqqorvtvpigw','kymadepeuqhcsjwbrgqq'),
    $template.Replace(':5432/',':6543/'),
    $template.Replace('.pooler.supabase.com','.example.com'),
    $template.Replace('/postgres','/other_database'),
    $template.Replace('postgresql://','https://'),
    ($template + '?sslmode=disable'),
    ($template + '?options=PRIVATE-UNSUPPORTED-OVERRIDE'),
    ($template + '#PRIVATE-UNSUPPORTED-FRAGMENT'),
    'PRIVATE-MALFORMED-CONNECTION'
)) {
    $script:FixtureTemplate = $invalid
    $script:Copied = $null
    $script:SecureReads = 0
    $output = (. $helper *>&1 | Out-String)
    Assert-Check ($null -eq $script:Copied) 'Unsafe template reached the clipboard'
    Assert-Check ($script:SecureReads -eq 0) 'Password requested for an unsafe template'
    Assert-Check (-not $output.Contains('PRIVATE-')) 'Rejected private template value printed'
}
Write-Host 'PASS: Windows PowerShell production URI parsing, password-symbol encoding, TLS, project/port/host guards and private-output suppression. Fictional input only; no database or real clipboard use.'
