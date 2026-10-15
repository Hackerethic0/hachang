$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$rt = Join-Path $root 'runtime'
New-Item -ItemType Directory -Force -Path $rt | Out-Null
$arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'win-arm64' } else { 'win-x64' }
$base = 'https://nodejs.org/dist/latest-v22.x'
Write-Host 'Checking the latest Node.js 22 release...'
$sums = (Invoke-WebRequest -Uri "$base/SHASUMS256.txt" -UseBasicParsing).Content -split "`n"
$line = $sums | Where-Object { $_ -match "node-v[\d\.]+-$arch\.zip\s*$" } | Select-Object -First 1
if (-not $line) { throw 'Could not find the download file name.' }
$parts = $line.Trim() -split '\s+'
$hash = $parts[0].ToUpper(); $name = $parts[1]
$zip = Join-Path $rt $name
Write-Host "Downloading $name (about 30 MB). Please wait..."
Invoke-WebRequest -Uri "$base/$name" -OutFile $zip -UseBasicParsing
$actual = (Get-FileHash -Algorithm SHA256 -Path $zip).Hash.ToUpper()
if ($actual -ne $hash) { Remove-Item $zip -Force; throw 'SHA256 does not match nodejs.org. The file was discarded.' }
Write-Host 'Checksum OK. Extracting...'
$tmp = Join-Path $rt 'extract'
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
Expand-Archive -Path $zip -DestinationPath $tmp -Force
$inner = Get-ChildItem $tmp -Directory | Select-Object -First 1
$dest = Join-Path $rt 'node'
if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
Move-Item $inner.FullName $dest
Remove-Item $tmp -Recurse -Force
Remove-Item $zip -Force
Write-Host 'Done.'
