#!/usr/bin/env node
/**
 * Cross-platform backend installer script
 * Handles Python venv creation and dependency installation on Windows/Mac/Linux
 */

const { execSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const isWindows = os.platform() === 'win32';
const backendDir = path.join(__dirname, '..', 'apps', 'backend');
const venvDir = path.join(backendDir, '.venv');

console.log('Installing Auto Claude backend dependencies...\n');

// Helper to run commands
function run(cmd, options = {}) {
  console.log(`> ${cmd}`);
  try {
    execSync(cmd, { stdio: 'inherit', cwd: backendDir, ...options });
    return true;
  } catch (error) {
    return false;
  }
}

// Find Python 3.12+
// Prefer 3.12 first since it has the most stable wheel support for native packages
function findPython() {
  const candidates = isWindows
    ? ['py -3.12', 'py -3.13', 'py -3.14', 'python3.12', 'python3.13', 'python3.14', 'python3', 'python']
    : ['python3.12', 'python3.13', 'python3.14', 'python3', 'python'];

  for (const cmd of candidates) {
    try {
      const result = spawnSync(cmd.split(' ')[0], [...cmd.split(' ').slice(1), '--version'], {
        encoding: 'utf8',
        shell: true,
      });
      // Accept Python 3.12+ using proper version parsing
      if (result.status === 0) {
        const versionMatch = result.stdout.match(/Python (\d+)\.(\d+)/);
        if (versionMatch) {
          const major = parseInt(versionMatch[1], 10);
          const minor = parseInt(versionMatch[2], 10);
          if (major === 3 && minor >= 12) {
            console.log(`Found Python 3.12+: ${cmd} -> ${result.stdout.trim()}`);
            return cmd;
          }
        }
      }
    } catch (e) {
      // Continue to next candidate
    }
  }
  return null;
}

// Get pip path based on platform
function getPipPath() {
  return isWindows
    ? path.join(venvDir, 'Scripts', 'pip.exe')
    : path.join(venvDir, 'bin', 'pip');
}

// Get the venv's python interpreter path
function getVenvPython() {
  return isWindows
    ? path.join(venvDir, 'Scripts', 'python.exe')
    : path.join(venvDir, 'bin', 'python');
}

// Is `uv` available globally? (uv is ~10-100x faster than pip and resolves the
// heavy graphiti/google/pandas tree without pip's slow backtracking.)
function hasGlobalUv() {
  const r = spawnSync('uv', ['--version'], { encoding: 'utf8', shell: true });
  return r.status === 0;
}

/**
 * Install a requirements file into the venv as fast as possible:
 *   1. global uv  ->  uv pip install --python <venv> (parallel, fast)
 *   2. else bootstrap uv into the venv, then use it
 *   3. else fall back to plain pip
 * Always --prefer-binary so a missing C/C++ toolchain never triggers a slow
 * (or failing) source build.
 */
function installRequirements(reqFile, label) {
  const venvPy = getVenvPython();
  const pref = '--prefer-binary';

  if (hasGlobalUv()) {
    console.log(`Installing ${label} with uv (fast)...`);
    if (run(`uv pip install --python "${venvPy}" ${pref} -r ${reqFile}`)) return true;
    console.warn('uv install failed; falling back to pip...');
  } else {
    // Bootstrap uv into the venv (small, quick) then use it for the heavy deps.
    console.log('Bootstrapping uv for a faster install...');
    if (run(`"${venvPy}" -m pip install ${pref} uv`)) {
      console.log(`Installing ${label} with uv (fast)...`);
      if (run(`"${venvPy}" -m uv pip install ${pref} -r ${reqFile}`)) return true;
      console.warn('uv install failed; falling back to pip...');
    } else {
      console.warn('Could not bootstrap uv; using pip...');
    }
  }

  console.log(`Installing ${label} with pip...`);
  return run(`"${venvPy}" -m pip install ${pref} -r ${reqFile}`);
}

// Main installation
async function main() {
  // Check for Python 3.12+
  const python = findPython();
  if (!python) {
    console.error('\nError: Python 3.12+ is required but not found.');
    console.error('Please install Python 3.12 or higher:');
    if (isWindows) {
      console.error('  winget install Python.Python.3.12');
    } else if (os.platform() === 'darwin') {
      console.error('  brew install python@3.12');
    } else {
      console.error('  sudo apt install python3.12 python3.12-venv');
    }
    process.exit(1);
  }

  // Remove existing venv if present
  if (fs.existsSync(venvDir)) {
    console.log('\nRemoving existing virtual environment...');
    fs.rmSync(venvDir, { recursive: true, force: true });
  }

  // Create virtual environment
  console.log('\nCreating virtual environment...');
  if (!run(`${python} -m venv .venv`)) {
    console.error('Failed to create virtual environment');
    process.exit(1);
  }

  // Install runtime dependencies (uv-accelerated, binary-preferred)
  console.log('\nInstalling dependencies...');
  if (!installRequirements('requirements.txt', 'runtime dependencies')) {
    console.error('Failed to install dependencies');
    process.exit(1);
  }

  // Test dependencies (mypy/pytest/coverage) are only needed for development.
  // Opt in with `--with-tests` or AC_INSTALL_TEST_DEPS=1 so normal users don't
  // wait on downloads they'll never use.
  const wantTests =
    process.argv.includes('--with-tests') ||
    process.env.AC_INSTALL_TEST_DEPS === '1';
  let testsInstalled = false;
  if (wantTests) {
    console.log('\nInstalling test dependencies...');
    if (!installRequirements('../../tests/requirements-test.txt', 'test dependencies')) {
      console.error('Failed to install test dependencies');
      process.exit(1);
    }
    testsInstalled = true;
  } else {
    console.log('\nSkipping test dependencies (run with --with-tests to include them).');
  }

  // Create .env file from .env.example if it doesn't exist
  const envPath = path.join(backendDir, '.env');
  const envExamplePath = path.join(backendDir, '.env.example');

  if (fs.existsSync(envPath)) {
    console.log('\n✓ .env file already exists');
  } else if (fs.existsSync(envExamplePath)) {
    console.log('\nCreating .env file from .env.example...');
    try {
      fs.copyFileSync(envExamplePath, envPath);
      console.log('✓ Created .env file');
      console.log('  Please configure it with your credentials:');
      console.log(`  - Run: claude setup-token`);
      console.log(`  - Or edit: ${envPath}`);
    } catch (error) {
      console.warn('Warning: Could not create .env file:', error.message);
      console.warn('You will need to manually copy .env.example to .env');
    }
  } else {
    console.warn('\nWarning: .env.example not found. Cannot auto-create .env file.');
    console.warn('Please create a .env file manually if your configuration requires it.');
  }

  console.log('\n✓ Backend installation complete!');
  console.log(`  Virtual environment: ${venvDir}`);
  console.log('  Runtime dependencies: installed');
  console.log(`  Test dependencies: ${testsInstalled ? 'installed (pytest, etc.)' : 'skipped (use --with-tests)'}`);
}

main().catch((err) => {
  console.error('Installation failed:', err);
  process.exit(1);
});
