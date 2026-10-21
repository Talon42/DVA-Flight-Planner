param(
  [Parameter(Mandatory = $true)]
  [string]$version
)

$ErrorActionPreference = "Stop"

function Fail($message) {
  Write-Host ""
  Write-Host "ERROR: $message" -ForegroundColor Red
  exit 1
}

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Description,
    [Parameter(Mandatory = $true)]
    [scriptblock]$Action
  )

  Write-Host $Description
  & $Action
  if ($LASTEXITCODE -ne 0) {
    Fail "$Description failed."
  }
}

Write-Host ""
Write-Host "Releasing version $version..." -ForegroundColor Cyan

if ($version -notmatch '^\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$') {
  Fail "Invalid version format. Use examples like 0.1.7 or 0.1.7-alpha"
}

foreach ($cmd in @("git", "node", "npm", "cargo")) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    Fail "$cmd is not available in PATH."
  }
}

$packageJsonPath = "package.json"
$packageLockPath = "package-lock.json"
$tauriPath = "src-tauri/tauri.conf.json"
$cargoPath = "src-tauri/Cargo.toml"
$cargoLockPath = "src-tauri/Cargo.lock"
$tag = "v$version"

foreach ($path in @($packageJsonPath, $packageLockPath, $tauriPath, $cargoPath, $cargoLockPath)) {
  if (-not (Test-Path $path)) {
    Fail "Missing required file: $path"
  }
}

$gitStatusPorcelain = git status --porcelain
if ($LASTEXITCODE -ne 0) {
  Fail "Failed to read git status."
}
if ($gitStatusPorcelain) {
  Fail "Working tree is not clean. Commit, stash, or discard changes before releasing."
}

$existingLocalTag = git tag --list $tag
if ($LASTEXITCODE -ne 0) {
  Fail "Failed to check local tags."
}
if ($existingLocalTag) {
  Fail "Tag $tag already exists locally."
}

$existingRemoteTag = git ls-remote --tags origin "refs/tags/$tag"
if ($LASTEXITCODE -ne 0) {
  Fail "Failed to check remote tags."
}
if ($existingRemoteTag) {
  Fail "Tag $tag already exists on origin."
}

Invoke-Step "Updating package.json and package-lock.json..." {
  npm version $version --no-git-tag-version
}

Write-Host "Updating tauri.conf.json..."
try {
  $tauriJson = Get-Content $tauriPath -Raw | ConvertFrom-Json
  $tauriJson.version = $version
  $tauriJson | ConvertTo-Json -Depth 20 | Set-Content $tauriPath
} catch {
  Fail "Failed to update $tauriPath"
}

Write-Host "Updating Cargo.toml..."
try {
  $cargoLines = Get-Content $cargoPath
  $inPackageSection = $false
  $updatedCargo = $false

  for ($i = 0; $i -lt $cargoLines.Count; $i++) {
    $line = $cargoLines[$i]

    if ($line -match '^\[package\]\s*$') {
      $inPackageSection = $true
      continue
    }

    if ($inPackageSection -and $line -match '^\[.+\]\s*$') {
      $inPackageSection = $false
    }

    if ($inPackageSection -and $line -match '^\s*version\s*=\s*".*"\s*$') {
      $cargoLines[$i] = "version = `"$version`""
      $updatedCargo = $true
      break
    }
  }

  if (-not $updatedCargo) {
    Fail "Failed to find package version line in $cargoPath"
  }

  Set-Content $cargoPath $cargoLines
} catch {
  Fail "Failed to update $cargoPath"
}

# Update only workspace packages so a release version bump preserves pinned dependency versions.
Invoke-Step "Updating Cargo.lock..." {
  cargo update --manifest-path $cargoPath --workspace --offline
}

# Match the release workflow's locked check before any commit, push, or tag can be created.
Invoke-Step "Verifying Cargo.lock is synchronized..." {
  cargo metadata --manifest-path $cargoPath --no-deps --format-version 1 --locked --offline | Out-Null
}

Write-Host "Verifying versions..."
try {
  $packageJsonVersion = (Get-Content $packageJsonPath -Raw | ConvertFrom-Json).version
  $tauriVersion = (Get-Content $tauriPath -Raw | ConvertFrom-Json).version
  $cargoVersionLine = (Get-Content $cargoPath | Select-String '^version = ' | Select-Object -First 1).Line
} catch {
  Fail "Failed while verifying updated files."
}

if ($packageJsonVersion -ne $version) {
  Fail "package.json version verification failed."
}
if ($tauriVersion -ne $version) {
  Fail "tauri.conf.json version verification failed."
}
if (-not $cargoVersionLine -or $cargoVersionLine -notmatch [regex]::Escape($version)) {
  Fail "Cargo.toml version verification failed."
}

Invoke-Step "Staging version files..." {
  git add .
}

$stagedDiff = git diff --cached --name-only
if ($LASTEXITCODE -ne 0) {
  Fail "Failed to inspect staged changes."
}
if (-not $stagedDiff) {
  Fail "No staged changes detected after version update."
}

Invoke-Step "Committing..." {
  git commit -m "Bump version to $version"
}

Invoke-Step "Pushing commit..." {
  git push
}

Invoke-Step "Creating tag $tag..." {
  git tag $tag
}

Invoke-Step "Pushing tag..." {
  git push origin $tag
}

Write-Host ""
Write-Host "Release $version complete." -ForegroundColor Green
Write-Host "GitHub Actions should now create the draft release."
Write-Host ""
