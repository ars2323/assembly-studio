# The update at launch, on Windows, as a user meets it: the older release
# installed (windows-check.yml), started with nothing touched, and left to
# find the newer one, download it, install it silently and start it.
#
#   pwsh tests/e2e/update-check.ps1 <installed AssemblyStudio.exe> <expected version> <out-dir>
#
# The desktop is captured every 3 s (update-NN.png) while it goes on; then the
# updater's log and whether the installer kept its copy (differential
# downloads, from 1.4.0) are printed.  Fails
# if, within 5 minutes, the installed program is not the expected version or
# the new version is not running.

param([string]$Exe, [string]$Want, [string]$Out)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $Out | Out-Null
Add-Type -AssemblyName System.Windows.Forms, System.Drawing

function Capture([string]$name) {
  $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
  $bmp.Save((Join-Path $Out "$name.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}
function Version { (Get-Item $Exe).VersionInfo.ProductVersion }

$from = Version
"installed: $from; expecting the update to $Want"
if ($from.StartsWith($Want)) { throw "already ${Want}: nothing to update" }

Start-Process -FilePath $Exe
$end = (Get-Date).AddMinutes(5)
$n = 0; $updated = $false; $runningAfter = 0
while ((Get-Date) -lt $end) {
  Start-Sleep -Seconds 3
  $n += 1
  try { Capture ('update-{0:D2}' -f $n) } catch { "capture ${n}: $_" }
  $v = try { Version } catch { 'being replaced' }
  $running = @(Get-Process -Name AssemblyStudio -ErrorAction SilentlyContinue).Count
  "{0,3}s  installed {1}  processes {2}" -f ($n * 3), $v, $running
  if (-not $updated -and $v -and $v.StartsWith($Want)) { $updated = $true; "updated to $v" }
  # The new version started: running for a few looks in a row after the update.
  if ($updated -and $running -gt 0) { $runningAfter += 1 } else { $runningAfter = 0 }
  if ($runningAfter -ge 4) { break }
}
Capture 'update-last'
if (-not $updated) { throw "not updated to $Want within 5 minutes (installed: $(Version))" }
if ($runningAfter -lt 4) { throw "updated to $Want, but the new version is not running" }
"ok: $from -> $(Version), and running"

# What the updater said (from 1.4.0 on it keeps a log): with a differential
# download, how much of the installer it fetched ("Full: ..., To download: ...").
$log = Join-Path $env:LOCALAPPDATA 'assemblystudio-updater\update.log'
if (Test-Path $log) { "--- $log"; Get-Content $log | Select-Object -Last 30; Copy-Item $log (Join-Path $Out 'update.log') }
else { 'no update.log (the version updated from keeps none)' }
# The installer's copy of itself, the old side of the next differential download.
$copy = Join-Path $env:LOCALAPPDATA 'assemblystudio-updater\installer.exe'
if (Test-Path $copy) { "installer copy kept: {0:N1} MB, version {1}" -f ((Get-Item $copy).Length / 1MB), (Get-Item $copy).VersionInfo.ProductVersion }
else { 'no installer copy (before 1.4.0 the installer removed it)' }
Get-Process -Name AssemblyStudio -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2
