# key2env.ps1 - Konvertiert einen privaten SSH-Key in einen base64-String fuer SSH_<ID>_KEY_B64
# Usage: .\tools\key2env.ps1 -KeyPath "C:\Users\Helm\.ssh\id_ed25519" -Id srv01
param(
  [Parameter(Mandatory)][string]$KeyPath,
  [string]$Id = "srvX"
)

if (-not (Test-Path $KeyPath)) { Write-Error "Datei nicht gefunden: $KeyPath"; exit 1 }

$raw = Get-Content -Raw -Path $KeyPath

if ($raw -match 'PuTTY-User-Key-File') {
  Write-Error "Das ist eine PuTTY .ppk-Datei. ssh2 braucht OpenSSH-PEM. In PuTTYgen oeffnen -> Conversions -> Export OpenSSH key -> diese Datei hier verwenden."
  exit 1
}

if ($raw -notmatch 'BEGIN (OPENSSH|RSA|EC|DSA) PRIVATE KEY') {
  Write-Warning "Header sieht nicht nach einem privaten SSH-Key aus. Trotzdem encodiert - pruefe das Ergebnis."
}

$bytes = [System.IO.File]::ReadAllBytes((Resolve-Path $KeyPath))
$b64 = [System.Convert]::ToBase64String($bytes)

$varName = "SSH_$($Id.ToUpper())_KEY_B64"
Write-Host ""
Write-Host "ENV-Zeile (in Dokploy einfuegen):" -ForegroundColor Green
Write-Host "$varName=$b64"
Write-Host ""
Write-Host "Laenge: $($b64.Length) Zeichen" -ForegroundColor DarkGray
