param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot ".."))
)

Set-Location $RepoRoot

git config core.hooksPath .githooks
Write-Host "Enabled git hooks: core.hooksPath=.githooks" -ForegroundColor Green
