# Run locally in Windows PowerShell. No password or completed URI is printed.
& {
    $bakeryTemplate = Read-Host 'Paste the PRODUCTION Session pooler URI with its password placeholder'
    try {
        $bakeryUri = [Uri]$bakeryTemplate
        $bakeryUser = [Uri]::UnescapeDataString(($bakeryUri.UserInfo -split ':', 2)[0])
        if ($bakeryUri.Scheme -notin @('postgres', 'postgresql') -or
            $bakeryUser -ne 'postgres.sgmmiymjnqqorvtvpigw' -or
            -not $bakeryUri.Host.EndsWith('.pooler.supabase.com') -or
            $bakeryUri.Port -ne 5432 -or
            $bakeryUri.AbsolutePath -ne '/postgres' -or
            $bakeryUri.Fragment -ne '' -or
            $bakeryUri.Query -notmatch '^(|\?sslmode=(require|verify-ca|verify-full))$') {
            throw 'Unexpected connection template'
        }
    } catch {
        Write-Host 'Use the production project Session pooler URI on port 5432. No connection value was printed.'
        return
    }
    $bakeryPassword = Read-Host 'Enter your PRODUCTION database password' -AsSecureString
    if ($bakeryPassword.Length -eq 0) { return }
    $bakeryPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($bakeryPassword)
    try {
        $bakeryEncoded = [Uri]::EscapeDataString([Runtime.InteropServices.Marshal]::PtrToStringBSTR($bakeryPointer))
        $bakerySslQuery = $bakeryUri.Query
        if ($bakerySslQuery -eq '') { $bakerySslQuery = '?sslmode=require' }
        $bakeryConnection = 'postgresql://postgres.sgmmiymjnqqorvtvpigw:' + $bakeryEncoded + '@' + $bakeryUri.Host + ':5432/postgres' + $bakerySslQuery
        Set-Clipboard -Value $bakeryConnection -ErrorAction Stop
        Write-Host 'Production connection copied. Paste it only into BAKERY_PRODUCTION_DATABASE_URL in GitHub Secrets.'
    } catch {
        Write-Host 'Connection was not copied. No password or connection value was printed.'
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bakeryPointer)
        $bakeryPassword.Dispose()
    }
}
