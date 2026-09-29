$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$archivePath = Join-Path (Split-Path -Parent $projectRoot) 'catan-complete-v14.zip'
$directories = @('.github', 'app', 'demo', 'public', 'scripts', 'server', 'shared', 'src', 'tests')
$files = @('.env.example', '.gitignore', 'package.json', 'package-lock.json', 'tsconfig.json',
  'vite.config.ts', 'playwright.config.ts', 'index.html', 'demo.html', 'server.ts', 'render.yaml',
  'metadata.json', 'README.md', 'DEPLOYMENT.md', 'DEPLOYMENT-ASSET-CHECK.json',
  'EXTERNAL-KEEP-ALIVE.md', 'MOBILE-FIX-NOTES.md', 'MOBILE-VERIFICATION.md', 'BANDWIDTH-NOTES.md', 'BANDWIDTH-V13.json')
foreach ($directory in $directories) {
  foreach ($file in Get-ChildItem -LiteralPath (Join-Path $projectRoot $directory) -File -Recurse -Force) {
    if ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked files are not included' }
    $files += [IO.Path]::GetRelativePath($projectRoot, $file.FullName).Replace('\', '/')
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
