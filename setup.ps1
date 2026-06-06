# ============================================================================
#  AutoClaude one-step setup (Windows)
#  Run from the repo root:   powershell -ExecutionPolicy Bypass -File setup.ps1
#  Checks prerequisites, installs backend + frontend, and offers to log you in.
# ============================================================================
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Ok($m){ Write-Host "[OK]   $m" -ForegroundColor Green }
function Info($m){ Write-Host "[..]   $m" -ForegroundColor Cyan }
function Warn($m){ Write-Host "[!!]   $m" -ForegroundColor Yellow }
function Die($m,$fix){ Write-Host "[X]    $m" -ForegroundColor Red; if($fix){ Write-Host "       Fix: $fix" -ForegroundColor Yellow }; exit 1 }

Write-Host "`n==== AutoClaude setup ====`n" -ForegroundColor White

# ---- 1. Prerequisites ------------------------------------------------------
Info "Checking prerequisites..."

# Node >= 24
$node = (Get-Command node -ErrorAction SilentlyContinue)
if(-not $node){ Die "Node.js not found" "winget install OpenJS.NodeJS.LTS  (need v24+)" }
$nodeMajor = [int]((node -v) -replace 'v(\d+)\..*','$1')
if($nodeMajor -lt 24){ Die "Node $(node -v) is too old (need >=24)" "winget install OpenJS.NodeJS.LTS" }
Ok "Node $(node -v)"

# npm >= 10
$npmMajor = [int]((npm -v) -split '\.')[0]
if($npmMajor -lt 10){ Die "npm $(npm -v) too old (need >=10)" "npm install -g npm@latest" }
Ok "npm $(npm -v)"

# Python 3.12+
$pyOk = $false
foreach($c in @('py -3.12','py -3.13','py -3.14','python')){
  try {
    $parts = $c -split ' '
    $v = & $parts[0] $parts[1..($parts.Length-1)] --version 2>&1
    if($v -match 'Python 3\.(\d+)' -and [int]$Matches[1] -ge 12){ Ok "Python: $v ($c)"; $pyOk=$true; break }
  } catch {}
}
if(-not $pyOk){ Die "Python 3.12+ not found" "winget install Python.Python.3.12" }

# Git
if(-not (Get-Command git -ErrorAction SilentlyContinue)){ Die "Git not found" "winget install Git.Git" }
Ok "Git $((git --version) -replace 'git version ','')"

# Claude Code CLI (needed to log in)
if(-not (Get-Command claude -ErrorAction SilentlyContinue)){
  Warn "Claude Code CLI not found - needed to log in."
  Warn "Install later with:  npm install -g @anthropic-ai/claude-code"
} else { Ok "Claude Code $((claude --version))" }

# Native-build tools (frontend compiles native modules)
if(-not (Get-Command cmake -ErrorAction SilentlyContinue)){
  Warn "CMake not found - the frontend install may fail building native modules."
  Warn "If install fails below:  winget install Kitware.CMake  + Visual Studio Build Tools (Desktop C++)"
}

# ---- 2. Install ------------------------------------------------------------
Write-Host ""
Info "Installing backend (Python venv + dependencies)..."
Write-Host "    Uses uv for a fast, wheels-only install (~30-60s). Test deps are" -ForegroundColor Gray
Write-Host "    skipped; contributors can add them with: npm run install:backend -- --with-tests" -ForegroundColor Gray
npm run install:backend
if($LASTEXITCODE -ne 0){ Die "Backend install failed" "See output above. Usually a missing Python 3.12+." }
Ok "Backend installed"

Write-Host ""
Info "Installing frontend (Electron + dependencies)..."
Write-Host "    First run downloads Electron (~150 MB) and builds native modules -" -ForegroundColor Gray
Write-Host "    expect a few minutes. This is the slowest step." -ForegroundColor Gray
npm run install:frontend
if($LASTEXITCODE -ne 0){ Die "Frontend install failed" "Often missing CMake / VS Build Tools (Desktop C++). Install those, then re-run." }
Ok "Frontend installed"

# ---- 3. Login --------------------------------------------------------------
Write-Host ""
Info "Almost done - you need to log in with your own Claude account."
Write-Host "    AutoClaude uses token login (a Claude Pro/Max subscription)." -ForegroundColor Gray
if(Get-Command claude -ErrorAction SilentlyContinue){
  $ans = Read-Host "    Run 'claude setup-token' now to get your login token? (y/N)"
  if($ans -match '^[Yy]'){
    claude setup-token
    Write-Host "    Paste the token into apps\backend\.env as CLAUDE_CODE_OAUTH_TOKEN=<token>" -ForegroundColor Yellow
    if(Get-Command notepad -ErrorAction SilentlyContinue){ Start-Process notepad "apps\backend\.env" }
  }
} else {
  Warn "Install the CLI first:  npm install -g @anthropic-ai/claude-code"
  Warn "Then run:  claude setup-token   and paste it into apps\backend\.env"
}

# ---- 4. Done ---------------------------------------------------------------
Write-Host "`n==== Setup complete ====" -ForegroundColor Green
Write-Host "Launch the app with:" -ForegroundColor White
Write-Host "    npm run dev`n" -ForegroundColor Cyan
