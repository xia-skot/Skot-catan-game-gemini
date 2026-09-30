param(
  [ValidatePattern('^v[0-9]+$')][string]$Version = 'v16',
  [switch]$CompleteOnly
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$archivePath = Join-Path (Split-Path -Parent $projectRoot) "catan-complete-$Version.zip"
$directories = @('.github', 'app', 'demo', 'gateway', 'public', 'render-entry', 'scripts', 'server', 'shared', 'src', 'tests')
$files = @('.env.example', '.gitignore', 'package.json', 'package-lock.json', 'tsconfig.json',
  'vite.config.ts', 'playwright.config.ts', 'index.html', 'demo.html', 'server.ts', 'render.yaml',
  'metadata.json', 'README.md', 'DEPLOYMENT.md', 'DEPLOYMENT-ASSET-CHECK.json',
  'EXTERNAL-KEEP-ALIVE.md', 'GATEWAY-DEPLOYMENT.md', 'BANDWIDTH-DEPLOYMENT.md', 'MOBILE-FIX-NOTES.md', 'MOBILE-VERIFICATION.md', 'BANDWIDTH-NOTES.md', 'BANDWIDTH-V13.json')
foreach ($directory in $directories) {
  foreach ($file in Get-ChildItem -LiteralPath (Join-Path $projectRoot $directory) -File -Recurse -Force) {
    if ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked files are not included' }
    $relative = [IO.Path]::GetRelativePath($projectRoot, $file.FullName).Replace('\', '/')
    if ($relative.StartsWith('tests/generated-')) { continue }
    $files += $relative
  }
}
$files = @($files | Sort-Object -Unique)
$manifest = 'FULL-PACKAGE-FILES.txt'
$files += $manifest
[IO.File]::WriteAllLines((Join-Path $projectRoot $manifest), $files, [Text.UTF8Encoding]::new($false))
$zip = [IO.Compression.ZipArchive]::new([IO.File]::Open($archivePath, [IO.FileMode]::CreateNew), [IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($relative in $files) {
    $source = [IO.Path]::GetFullPath((Join-Path $projectRoot $relative))
    if (!$source.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Path escapes the project' }
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $source, $relative, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $zip.Dispose() }
$sha = [Security.Cryptography.SHA256]::Create()
$check = [IO.Compression.ZipFile]::OpenRead($archivePath)
try {
  if ($check.Entries.Count -ne $files.Count) { throw 'Archive entry count differs' }
  foreach ($entry in $check.Entries) {
    $stream = $entry.Open()
    try { $archivedHash = [Convert]::ToHexString($sha.ComputeHash($stream)) } finally { $stream.Dispose() }
    $expectedHash = (Get-FileHash -LiteralPath (Join-Path $projectRoot $entry.FullName) -Algorithm SHA256).Hash
    if ($archivedHash -ne $expectedHash) { throw "File verification failed: $($entry.FullName)" }
  }
} finally { $check.Dispose(); $sha.Dispose() }
Get-Item -LiteralPath $archivePath | Select-Object FullName,Length
Write-Output "Verified files: $($files.Count)"
if ($CompleteOnly) { return }

$gatewayArchivePath = Join-Path (Split-Path -Parent $projectRoot) 'catan-gateway-v16.zip'
$gatewayFiles = @{'gateway/worker.js' = 'worker.js'; 'gateway/wrangler.jsonc' = 'wrangler.jsonc'; 'GATEWAY-DEPLOYMENT.md' = 'GATEWAY-DEPLOYMENT.md'; 'BANDWIDTH-DEPLOYMENT.md' = 'BANDWIDTH-DEPLOYMENT.md'}
$gatewayZip = [IO.Compression.ZipArchive]::new([IO.File]::Open($gatewayArchivePath, [IO.FileMode]::CreateNew), [IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($relative in $gatewayFiles.Keys) {
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($gatewayZip, (Join-Path $projectRoot $relative), $gatewayFiles[$relative], [IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $gatewayZip.Dispose() }
$gatewayCheck = [IO.Compression.ZipFile]::OpenRead($gatewayArchivePath)
$gatewaySha = [Security.Cryptography.SHA256]::Create()
try {
  if ($gatewayCheck.Entries.Count -ne $gatewayFiles.Count) { throw 'Gateway archive entry count differs' }
  foreach ($relative in $gatewayFiles.Keys) {
    $stream = $gatewayCheck.GetEntry($gatewayFiles[$relative]).Open()
    try { $hash = [Convert]::ToHexString($gatewaySha.ComputeHash($stream)) } finally { $stream.Dispose() }
    if ($hash -ne (Get-FileHash -LiteralPath (Join-Path $projectRoot $relative) -Algorithm SHA256).Hash) { throw 'Gateway archive verification failed' }
  }
} finally { $gatewayCheck.Dispose(); $gatewaySha.Dispose() }
Get-Item -LiteralPath $gatewayArchivePath | Select-Object FullName,Length

$renderEntryArchivePath = Join-Path (Split-Path -Parent $projectRoot) 'catan-render-entry-v2.zip'
$renderEntryFiles = @('package.json', 'server.js', 'server.test.js', 'render.yaml', 'README.md')
$renderEntryZip = [IO.Compression.ZipArchive]::new([IO.File]::Open($renderEntryArchivePath, [IO.FileMode]::CreateNew), [IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($relative in $renderEntryFiles) {
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($renderEntryZip, (Join-Path $projectRoot "render-entry/$relative"), $relative, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $renderEntryZip.Dispose() }
$renderEntryCheck = [IO.Compression.ZipFile]::OpenRead($renderEntryArchivePath)
try {
  if ($renderEntryCheck.Entries.Count -ne $renderEntryFiles.Count) { throw 'Render entry archive entry count differs' }
} finally { $renderEntryCheck.Dispose() }
Get-Item -LiteralPath $renderEntryArchivePath | Select-Object FullName,Length
