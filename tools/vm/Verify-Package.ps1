$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath($PSScriptRoot) + [System.IO.Path]::DirectorySeparatorChar
$manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'MANIFEST.json') -Raw | ConvertFrom-Json
foreach ($entry in $manifest.files) {
    $path = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot $entry.path))
    if (-not $path.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe manifest path' }
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing: $($entry.path)" }
    if ((Get-Item -LiteralPath $path).Length -ne $entry.size) { throw "Size mismatch: $($entry.path)" }
    if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ne $entry.sha256) { throw "SHA-256 mismatch: $($entry.path)" }
}
Write-Output ('Verified ' + $manifest.files.Count + ' files. This is integrity checking, not a signed manifest or GUI test.')
