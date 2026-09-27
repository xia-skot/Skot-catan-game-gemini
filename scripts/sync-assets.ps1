$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$text = (Get-Content (Join-Path $projectRoot 'src/images.ts') -Raw) + (Get-Content (Join-Path $projectRoot 'src/audioService.ts') -Raw)
$urls = @([regex]::Matches($text, 'https://fastly\.jsdelivr\.net/gh/xia-skot/Catan_Pics/(?:img|audio)/[^''"\s`]+\.(?:png|jpg|mp3)') | ForEach-Object { $_.Value } | Sort-Object -Unique)
$urls += @([regex]::Matches($text, "'%[0-9A-F][^']+\.mp3'") | ForEach-Object { 'https://fastly.jsdelivr.net/gh/xia-skot/Catan_Pics/audio/' + $_.Value.Trim("'") })
$manifestPath = Join-Path $projectRoot 'src/assetManifest.json'
if (Test-Path -LiteralPath $manifestPath) { $urls += (Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json).sources }
$urls = @($urls | Sort-Object -Unique)
if ($urls.Count -eq 0) { throw 'No asset sources found' }
$manifest = [ordered]@{ version = ''; images = [ordered]@{}; audio = [ordered]@{}; sources = $urls }
$tree = Invoke-RestMethod 'https://api.github.com/repos/xia-skot/Catan_Pics/git/trees/main?recursive=1'
$hashes = @()
function Get-RemoteJson($uri) {
    for ($attempt = 0; $attempt -lt 4; $attempt++) {
        try { return Invoke-RestMethod -Uri $uri -TimeoutSec 20 } catch { if ($attempt -eq 3) { throw }; Start-Sleep -Seconds 1 }
    }
}
foreach ($url in $urls) {
    $match = [regex]::Match($url, 'Catan_Pics/(img|audio)/(.+)$')
    $group = $match.Groups[1].Value
    $name = $match.Groups[2].Value
    $sourcePath = $group + '/' + [Uri]::UnescapeDataString($name)
    $entry = $tree.tree | Where-Object { $_.path -eq $sourcePath } | Select-Object -First 1
    if (-not $entry) { throw "Asset not found: $sourcePath" }
    $blob = Get-RemoteJson $entry.url
    $bytes = [Convert]::FromBase64String($blob.content)
    $hash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant().Substring(0,16)
    $targetGroup = if ($group -eq 'img') { 'images' } else { 'audio' }
    $relativePath = '/assets/' + $targetGroup + '/' + $hash + [IO.Path]::GetExtension($name)
    $targetPath = Join-Path $projectRoot ('public' + $relativePath)
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($targetPath)) | Out-Null
    [IO.File]::WriteAllBytes($targetPath, $bytes)
    $manifest[$targetGroup][$name] = $relativePath
    $hashes += $hash
    Write-Output "$sourcePath : $($bytes.Length) bytes"
}
$versionBytes = [Text.Encoding]::UTF8.GetBytes(($hashes | Sort-Object) -join '')
$manifest.version = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($versionBytes)).ToLowerInvariant().Substring(0,12)
[IO.File]::WriteAllText((Join-Path $projectRoot 'src/assetManifest.json'), ($manifest | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
Write-Output "Saved $($urls.Count) assets"
