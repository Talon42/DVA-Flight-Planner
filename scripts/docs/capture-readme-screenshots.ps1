[CmdletBinding()]
param(
  [switch]$UpdateReadme,
  [string[]]$Only,
  [string]$NativeDriverPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$ReadmePath = Join-Path $RepoRoot "README.md"
$ManifestPath = Join-Path $PSScriptRoot "docshot-manifest.json"
$OutputDirectory = Join-Path $RepoRoot "readme-images"
$ApplicationPath = $null
$DocshotApiKey = "__FLIGHT_PLANNER_DOCSHOT__"
$WebDriverElementKey = "element-6066-11e4-a52e-4f735466cecf"

function Resolve-ToolPath {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Candidates
  )

  foreach ($candidate in $Candidates) {
    $command = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($command) {
      return $command.Source
    }
  }

  throw "Unable to find required tool. Tried: $($Candidates -join ', ')"
}

function Invoke-ExternalCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,
    [string[]]$Arguments = @(),
    [string]$WorkingDirectory = $RepoRoot,
    [hashtable]$EnvironmentOverrides = @{}
  )

  Write-Host "Running: $FilePath $($Arguments -join ' ')"
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $FilePath
  $psi.Arguments = (@($Arguments) | ForEach-Object {
    $value = [string]$_
    if ($value -match '[\s"]') {
      '"' + ($value -replace '\\', '\\' -replace '"', '\"') + '"'
    }
    else {
      $value
    }
  }) -join ' '
  $psi.WorkingDirectory = $WorkingDirectory
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true

  foreach ($entry in $EnvironmentOverrides.GetEnumerator()) {
    $psi.Environment[$entry.Key] = [string]$entry.Value
  }

  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $psi
  [void]$process.Start()

  $stdout = $process.StandardOutput.ReadToEnd()
  $stderr = $process.StandardError.ReadToEnd()
  $process.WaitForExit()

  if ($stdout.Trim()) {
    Write-Host $stdout.TrimEnd()
  }

  if ($stderr.Trim()) {
    Write-Host $stderr.TrimEnd()
  }

  if ($process.ExitCode -ne 0) {
    throw "Command failed with exit code $($process.ExitCode): $FilePath $($Arguments -join ' ')"
  }
}

function Get-EntryIsManual {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Entry
  )

  return [bool](Get-EntryPropertyValue -Entry $Entry -Name "manual" -DefaultValue $false)
}

function Get-EntryPropertyValue {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Entry,
    [Parameter(Mandatory = $true)]
    [string]$Name,
    $DefaultValue = $null
  )

  $property = $Entry.PSObject.Properties[$Name]
  if (-not $property) {
    return $DefaultValue
  }

  return $property.Value
}

function Resolve-NativeDriverPath {
  param(
    [string]$ConfiguredPath
  )

  if (-not [string]::IsNullOrWhiteSpace($ConfiguredPath)) {
    if (-not (Test-Path $ConfiguredPath)) {
      throw "Native WebDriver binary was not found at '$ConfiguredPath'."
    }

    return (Resolve-Path $ConfiguredPath).Path
  }

  try {
    return Resolve-ToolPath -Candidates @("msedgedriver.exe", "msedgedriver")
  } catch {
    throw "Unable to find required tool: msedgedriver.exe. Install Edge WebDriver and add it to PATH, or rerun this script with -NativeDriverPath <full path to msedgedriver.exe>."
  }
}

function Start-BackgroundProcess {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,
    [object[]]$Arguments = @()
  )

  $sanitizedArguments = @(
    @($Arguments) | Where-Object { $null -ne $_ -and [string]::IsNullOrWhiteSpace([string]$_) -eq $false }
  )
  $stdoutPath = [System.IO.Path]::GetTempFileName()
  $stderrPath = [System.IO.Path]::GetTempFileName()
  $startProcessParams = @{
    FilePath = $FilePath
    WorkingDirectory = $RepoRoot
    PassThru = $true
    WindowStyle = "Hidden"
    RedirectStandardOutput = $stdoutPath
    RedirectStandardError = $stderrPath
  }
  if ($sanitizedArguments.Count -gt 0) {
    $startProcessParams.ArgumentList = $sanitizedArguments
  }

  $process = Start-Process @startProcessParams

  return [pscustomobject]@{
    Process = $process
    StdOutPath = $stdoutPath
    StdErrPath = $stderrPath
  }
}

function Stop-BackgroundProcess {
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Handle
  )

  if ($Handle.Process -and -not $Handle.Process.HasExited) {
    Stop-Process -Id $Handle.Process.Id -Force
    $Handle.Process.WaitForExit()
  }
}

function Read-BackgroundProcessLogs {
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Handle
  )

  $stdout = if (Test-Path $Handle.StdOutPath) { Get-Content $Handle.StdOutPath -Raw } else { "" }
  $stderr = if (Test-Path $Handle.StdErrPath) { Get-Content $Handle.StdErrPath -Raw } else { "" }

  return (@($stdout, $stderr) -join [Environment]::NewLine).Trim()
}

function Resolve-ApplicationBinaryPath {
  $preferredPath = Join-Path $RepoRoot "src-tauri\target\debug\DVAFlightPlanner.exe"
  if (Test-Path $preferredPath) {
    return $preferredPath
  }

  $candidates = @(
    Get-ChildItem (Join-Path $RepoRoot "src-tauri\target\debug") -Filter *.exe -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -notmatch "^fetch_" } |
      Sort-Object Name
  )

  if ($candidates.Count -eq 1) {
    return $candidates[0].FullName
  }

  throw "Unable to resolve the built Tauri application binary under src-tauri\target\debug."
}

function Wait-ForPort {
  param(
    [Parameter(Mandatory = $true)]
    [int]$Port,
    [Parameter(Mandatory = $true)]
    [pscustomobject]$ProcessHandle,
    [int]$TimeoutSeconds = 30
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    if ($ProcessHandle.Process.HasExited) {
      $logs = Read-BackgroundProcessLogs -Handle $ProcessHandle
      throw "Background process exited before port $Port was ready.`n$logs"
    }

    try {
      $client = New-Object System.Net.Sockets.TcpClient
      $asyncResult = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
      if ($asyncResult.AsyncWaitHandle.WaitOne(250) -and $client.Connected) {
        $client.Close()
        return
      }
      $client.Close()
    } catch {
    }

    Start-Sleep -Milliseconds 250
  }

  $logs = Read-BackgroundProcessLogs -Handle $ProcessHandle
  throw "Timed out waiting for port $Port.`n$logs"
}

function Invoke-WebDriver {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Method,
    [Parameter(Mandatory = $true)]
    [string]$Uri,
    [object]$Body
  )

  $requestArgs = @{
    Method = $Method
    Uri = $Uri
    ContentType = "application/json"
  }

  if ($PSBoundParameters.ContainsKey("Body")) {
    $requestArgs.Body = ($Body | ConvertTo-Json -Depth 12)
  }

  return Invoke-RestMethod @requestArgs
}

function New-WebDriverSession {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Application
  )

  $response = Invoke-WebDriver `
    -Method "POST" `
    -Uri "http://127.0.0.1:4444/session" `
    -Body @{
      capabilities = @{
        alwaysMatch = @{
          browserName = "wry"
          "tauri:options" = @{
            application = $Application
          }
        }
      }
    }

  $sessionId = [string](Get-EntryPropertyValue -Entry $response -Name "sessionId" -DefaultValue "")
  if ([string]::IsNullOrWhiteSpace($sessionId)) {
    $responseValue = Get-EntryPropertyValue -Entry $response -Name "value" -DefaultValue $null
    if ($responseValue) {
      $sessionId = [string](Get-EntryPropertyValue -Entry $responseValue -Name "sessionId" -DefaultValue "")
    }
  }

  if ([string]::IsNullOrWhiteSpace($sessionId)) {
    $serializedResponse = ($response | ConvertTo-Json -Depth 12)
    throw "WebDriver session creation returned no session id.`n$serializedResponse"
  }

  return $sessionId
}

function Remove-WebDriverSession {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SessionId
  )

  Invoke-WebDriver -Method "DELETE" -Uri "http://127.0.0.1:4444/session/$SessionId" | Out-Null
}

function Invoke-WebDriverAsyncScript {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SessionId,
    [Parameter(Mandatory = $true)]
    [string]$Script,
    [object[]]$Arguments = @()
  )

  $response = Invoke-WebDriver `
    -Method "POST" `
    -Uri "http://127.0.0.1:4444/session/$SessionId/execute/async" `
    -Body @{
      script = $Script
      args = $Arguments
    }

  return $response.value
}

function Set-WebDriverWindowRect {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SessionId,
    [Parameter(Mandatory = $true)]
    [int]$Width,
    [Parameter(Mandatory = $true)]
    [int]$Height
  )

  Invoke-WebDriver `
    -Method "POST" `
    -Uri "http://127.0.0.1:4444/session/$SessionId/window/rect" `
    -Body @{
      width = $Width
      height = $Height
      x = 20
      y = 20
    } | Out-Null
}

function Find-WebElement {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SessionId,
    [Parameter(Mandatory = $true)]
    [string]$Selector
  )

  $response = Invoke-WebDriver `
    -Method "POST" `
    -Uri "http://127.0.0.1:4444/session/$SessionId/element" `
    -Body @{
      using = "css selector"
      value = $Selector
    }

  $elementProperty = $response.value.PSObject.Properties[$WebDriverElementKey]
  if (-not $elementProperty) {
    throw "No element id returned for selector: $Selector"
  }

  return [string]$elementProperty.Value
}

function Get-WebElementScreenshotBytes {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SessionId,
    [Parameter(Mandatory = $true)]
    [string]$ElementId
  )

  $response = Invoke-WebDriver `
    -Method "GET" `
    -Uri "http://127.0.0.1:4444/session/$SessionId/element/$ElementId/screenshot"

  return [Convert]::FromBase64String([string]$response.value)
}

function New-RoundedRectanglePath {
  param(
    [Parameter(Mandatory = $true)]
    [float]$X,
    [Parameter(Mandatory = $true)]
    [float]$Y,
    [Parameter(Mandatory = $true)]
    [float]$Width,
    [Parameter(Mandatory = $true)]
    [float]$Height,
    [Parameter(Mandatory = $true)]
    [float]$Radius
  )

  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $Radius * 2

  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()

  return $path
}

function Convert-DocshotImage {
  param(
    [Parameter(Mandatory = $true)]
    [byte[]]$SourceBytes,
    [Parameter(Mandatory = $true)]
    [string]$OutputPath
  )

  $canvasWidth = 1600
  $canvasHeight = 960
  $outerPadding = 52
  $framePadding = 26
  $frameWidth = $canvasWidth - ($outerPadding * 2)
  $frameHeight = $canvasHeight - ($outerPadding * 2)
  $contentWidth = $frameWidth - ($framePadding * 2)
  $contentHeight = $frameHeight - ($framePadding * 2)

  $memoryStream = New-Object System.IO.MemoryStream(,$SourceBytes)
  $sourceImage = [System.Drawing.Image]::FromStream($memoryStream)
  $canvas = New-Object System.Drawing.Bitmap($canvasWidth, $canvasHeight)
  $graphics = [System.Drawing.Graphics]::FromImage($canvas)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml("#dfe8f2"))

  $shadowPath = New-RoundedRectanglePath -X ($outerPadding + 10) -Y ($outerPadding + 16) -Width $frameWidth -Height $frameHeight -Radius 34
  $shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(34, 10, 24, 43))
  $graphics.FillPath($shadowBrush, $shadowPath)

  $framePath = New-RoundedRectanglePath -X $outerPadding -Y $outerPadding -Width $frameWidth -Height $frameHeight -Radius 34
  $frameBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#f8fbff"))
  $frameBorderPen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml("#c7d5e6"), 2)
  $graphics.FillPath($frameBrush, $framePath)
  $graphics.DrawPath($frameBorderPen, $framePath)

  $scale = [Math]::Min($contentWidth / $sourceImage.Width, $contentHeight / $sourceImage.Height)
  $drawWidth = [int][Math]::Round($sourceImage.Width * $scale)
  $drawHeight = [int][Math]::Round($sourceImage.Height * $scale)
  $drawX = $outerPadding + $framePadding + [int][Math]::Floor(($contentWidth - $drawWidth) / 2)
  $drawY = $outerPadding + $framePadding + [int][Math]::Floor(($contentHeight - $drawHeight) / 2)

  $graphics.DrawImage($sourceImage, $drawX, $drawY, $drawWidth, $drawHeight)

  $outputDirectory = Split-Path -Parent $OutputPath
  if (-not (Test-Path $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
  }

  $canvas.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)

  $frameBorderPen.Dispose()
  $frameBrush.Dispose()
  $shadowBrush.Dispose()
  $shadowPath.Dispose()
  $framePath.Dispose()
  $graphics.Dispose()
  $canvas.Dispose()
  $sourceImage.Dispose()
  $memoryStream.Dispose()
}

function Get-ReadmeDocshotMarkers {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ReadmeText
  )

  $pattern = "<!--\s*docshot:\s*(?<id>[a-z0-9-]+)\s*-->\s*(?<image><img\b[^>]*\bsrc=""(?<src>[^""]+)""[^>]*>)"
  $matches = [regex]::Matches($ReadmeText, $pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)

  return @(
    foreach ($match in $matches) {
      [pscustomobject]@{
        Id = $match.Groups["id"].Value
        CurrentSource = $match.Groups["src"].Value
      }
    }
  )
}

function Update-ReadmeImageSources {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ReadmeText,
    [Parameter(Mandatory = $true)]
    [object[]]$Entries
  )

  $updatedText = $ReadmeText

  foreach ($entry in $Entries) {
    $shouldUpdateReadme = [bool](Get-EntryPropertyValue -Entry $entry -Name "updateReadme" -DefaultValue $false)
    $outputFile = [string](Get-EntryPropertyValue -Entry $entry -Name "outputFile" -DefaultValue "")
    if (-not $shouldUpdateReadme -or [string]::IsNullOrWhiteSpace($outputFile)) {
      continue
    }

    $escapedId = [regex]::Escape([string]$entry.id)
    $nextSource = "./readme-images/$outputFile"
    $pattern = "(<!--\s*docshot:\s*$escapedId\s*-->\s*<img\b[^>]*\bsrc="")([^""]+)(""[^>]*>)"
    $updatedText = [regex]::Replace($updatedText, $pattern, "`$1$nextSource`$3", 1)
  }

  return $updatedText
}

function Get-SelectedManifestEntries {
  param(
    [Parameter(Mandatory = $true)]
    [object[]]$ManifestEntries,
    [Parameter(Mandatory = $true)]
    [object[]]$ReadmeMarkers
  )

  $selectedIds = @(
    @($Only) | Where-Object { $null -ne $_ -and [string]::IsNullOrWhiteSpace([string]$_) -eq $false }
  )
  $manifestById = @{}
  foreach ($entry in $ManifestEntries) {
    $manifestById[[string]$entry.id] = $entry
  }

  foreach ($marker in $ReadmeMarkers) {
    if (-not $manifestById.ContainsKey($marker.Id)) {
      throw "README docshot marker '$($marker.Id)' is missing from scripts/docs/docshot-manifest.json"
    }
  }

  foreach ($entry in $ManifestEntries) {
    if (-not ($ReadmeMarkers | Where-Object { $_.Id -eq $entry.id })) {
      throw "Manifest entry '$($entry.id)' is not referenced in README.md"
    }

    if (-not (Get-EntryIsManual -Entry $entry)) {
      if (-not $entry.scenarioId -or -not $entry.selector -or -not $entry.outputFile) {
        throw "Automated manifest entry '$($entry.id)' is missing a required field."
      }

      if (-not ($entry.windowWidth -as [int]) -or -not ($entry.windowHeight -as [int])) {
        throw "Automated manifest entry '$($entry.id)' must declare windowWidth and windowHeight."
      }
    }
  }

  $entries = @(
    foreach ($marker in $ReadmeMarkers) {
      $entry = $manifestById[$marker.Id]
      if ($selectedIds.Count -gt 0 -and $selectedIds -notcontains $entry.id) {
        continue
      }

      $entry
    }
  )

  return $entries
}

$npmPath = Resolve-ToolPath -Candidates @("npm.cmd", "npm")
$tauriDriverPath = Resolve-ToolPath -Candidates @("tauri-driver.exe", "tauri-driver")
$edgeDriverPath = Resolve-NativeDriverPath -ConfiguredPath $NativeDriverPath

$manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json
$readmeText = Get-Content $ReadmePath -Raw
$readmeMarkers = Get-ReadmeDocshotMarkers -ReadmeText $readmeText
$selectedEntries = Get-SelectedManifestEntries -ManifestEntries $manifest -ReadmeMarkers $readmeMarkers
$captureEntries = @($selectedEntries | Where-Object { -not (Get-EntryIsManual -Entry $_) })

if (@($captureEntries).Count -eq 0) {
  throw "No automated docshot entries matched the current selection."
}

if (-not (Test-Path $OutputDirectory)) {
  New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
}

Invoke-ExternalCommand `
  -FilePath $npmPath `
  -Arguments @("run", "tauri", "--", "build", "--debug", "--no-bundle") `
  -EnvironmentOverrides @{ VITE_DOCSHOT = "true" }

$ApplicationPath = Resolve-ApplicationBinaryPath

$driverArguments = @("--native-driver", [string]$edgeDriverPath)

$driverHandle = $null
$driverHandle = Start-BackgroundProcess -FilePath $tauriDriverPath -Arguments $driverArguments
$sessionId = $null

try {
  Wait-ForPort -Port 4444 -ProcessHandle $driverHandle
  $sessionId = New-WebDriverSession -Application $ApplicationPath

  $runtimeReady = Invoke-WebDriverAsyncScript `
    -SessionId $sessionId `
    -Script @"
const done = arguments[arguments.length - 1];
let attempts = 0;
function waitForRuntime() {
  if (window.$DocshotApiKey && document.body?.dataset?.appReady === "true") {
    done({ ready: true });
    return;
  }

  attempts += 1;
  if (attempts > 200) {
    done({ error: "Docshot runtime did not become ready in time." });
    return;
  }

  window.setTimeout(waitForRuntime, 100);
}
waitForRuntime();
"@

  $runtimeReadyError = [string](Get-EntryPropertyValue -Entry $runtimeReady -Name "error" -DefaultValue "")
  if (-not [string]::IsNullOrWhiteSpace($runtimeReadyError)) {
    throw $runtimeReadyError
  }

  $activeScenario = ""
  $activeWindowSize = ""
  foreach ($entry in $captureEntries) {
    $nextWindowSize = "$($entry.windowWidth)x$($entry.windowHeight)"
    if ($nextWindowSize -ne $activeWindowSize) {
      Set-WebDriverWindowRect `
        -SessionId $sessionId `
        -Width ([int]$entry.windowWidth) `
        -Height ([int]$entry.windowHeight)
      $activeWindowSize = $nextWindowSize
    }

    if ($entry.scenarioId -ne $activeScenario) {
      Write-Host "Applying scenario: $($entry.scenarioId)"
      $result = Invoke-WebDriverAsyncScript `
        -SessionId $sessionId `
        -Script @"
const done = arguments[arguments.length - 1];
Promise.resolve(window.$DocshotApiKey.applyScenario(arguments[0]))
  .then((value) => done(value))
  .catch((error) => done({ error: String(error && (error.stack || error.message) || error) }));
"@ `
        -Arguments @([string]$entry.scenarioId)

      $scenarioError = [string](Get-EntryPropertyValue -Entry $result -Name "error" -DefaultValue "")
      if (-not [string]::IsNullOrWhiteSpace($scenarioError)) {
        throw $scenarioError
      }

      $activeScenario = [string]$entry.scenarioId
    }

    $captureModeResult = Invoke-WebDriverAsyncScript `
      -SessionId $sessionId `
      -Script @"
const done = arguments[arguments.length - 1];
Promise.resolve(window.$DocshotApiKey.setCaptureMode(true))
  .then((value) => done(value))
  .catch((error) => done({ error: String(error && (error.stack || error.message) || error) }));
"@

    $captureModeError = [string](Get-EntryPropertyValue -Entry $captureModeResult -Name "error" -DefaultValue "")
    if (-not [string]::IsNullOrWhiteSpace($captureModeError)) {
      throw $captureModeError
    }

    $elementId = Find-WebElement -SessionId $sessionId -Selector ([string]$entry.selector)
    $screenshotBytes = Get-WebElementScreenshotBytes -SessionId $sessionId -ElementId $elementId
    $outputPath = Join-Path $OutputDirectory ([string]$entry.outputFile)
    Convert-DocshotImage -SourceBytes $screenshotBytes -OutputPath $outputPath
    Write-Host "Saved $outputPath"
  }

  Invoke-WebDriverAsyncScript `
    -SessionId $sessionId `
    -Script @"
const done = arguments[arguments.length - 1];
Promise.resolve(window.$DocshotApiKey.setCaptureMode(false))
  .then((value) => done(value))
  .catch((error) => done({ error: String(error && (error.stack || error.message) || error) }));
"@ | Out-Null

  if ($UpdateReadme) {
    $updatedReadme = Update-ReadmeImageSources -ReadmeText $readmeText -Entries $selectedEntries
    Set-Content -Path $ReadmePath -Value $updatedReadme -Encoding utf8
    Write-Host "Updated README image sources."
  }
} finally {
  if ($sessionId) {
    try {
      Remove-WebDriverSession -SessionId $sessionId
    } catch {
    }
  }

  if ($driverHandle) {
    Stop-BackgroundProcess -Handle $driverHandle
  }
}
