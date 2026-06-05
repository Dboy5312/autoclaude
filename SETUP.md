# Setup Guide

Get AutoClaude running in a few minutes. **Windows** has a one-command installer; macOS/Linux use the manual steps (they're short).

---

## The fast way (Windows)

```powershell
git clone https://github.com/Dboy5312/autoclaude.git
cd autoclaude
powershell -ExecutionPolicy Bypass -File setup.ps1
```

`setup.ps1` checks your prerequisites, installs the backend + frontend, and offers to log you in. When it finishes:

```powershell
npm run dev
```

That's it. If a prerequisite is missing, the script tells you the exact command to install it, then just re-run it.

---

## Prerequisites

You need these installed first (the installer checks for them):

| Tool | Version | Install (Windows) |
|---|---|---|
| Node.js | **≥ 24** | `winget install OpenJS.NodeJS.LTS` |
| npm | **≥ 10** | comes with Node |
| Python | **≥ 3.12** | `winget install Python.Python.3.12` |
| Git | any | `winget install Git.Git` |
| Claude Code CLI | latest | `npm install -g @anthropic-ai/claude-code` |
| CMake + VS Build Tools | for native modules | `winget install Kitware.CMake` + [VS Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (Desktop C++ workload) |

> **You also need a Claude Pro or Max subscription.** AutoClaude logs in with a token from your subscription (not a pay-as-you-go API key).

---

## The manual way (any OS)

```bash
# 1. Clone
git clone https://github.com/Dboy5312/autoclaude.git
cd autoclaude

# 2. Install BOTH backend and frontend.
#    Do NOT run a bare `npm install` — it skips the Python backend
#    and the frontend's native-binary setup.
npm run install:all

# 3. Log in with YOUR Claude account (token-based):
claude setup-token
#    Copy the token it prints, then paste it into apps/backend/.env as:
#    CLAUDE_CODE_OAUTH_TOKEN=your-token-here
#    (install:all already created apps/backend/.env from the template.)

# 4. Launch the desktop app:
npm run dev
```

---

## Configuration (all optional except login)

Everything lives in **`apps/backend/.env`** (created for you from `apps/backend/.env.example`). Nothing here is committed — it's your local, private config.

- **Required:** `CLAUDE_CODE_OAUTH_TOKEN` — from `claude setup-token`.
- **Optional integrations** (only set what you use): `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `OPENROUTER_API_KEY`, `GITLAB_TOKEN`, `LINEAR_API_KEY`, plus the memory/Graphiti and Sentry options. The app runs fine with none of them.

`apps/frontend/.env` is optional too (dev/telemetry flags only).

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Python 3.12+ is required but not found` | Install Python 3.12+ and make sure `py -3.12` or `python` works in a new terminal. |
| Frontend install fails building native modules (`node-gyp` errors) | Install **CMake** and **Visual Studio Build Tools** (Desktop development with C++), then re-run `npm run install:frontend`. |
| `claude: command not found` | `npm install -g @anthropic-ai/claude-code`, then `claude setup-token`. |
| Engine warning about Node/npm version | You're below Node 24 / npm 10. Update Node. |
| App opens but agent calls fail | Check `apps/backend/.env` has a valid `CLAUDE_CODE_OAUTH_TOKEN` and your Claude subscription is active. |

---

## Headless / CLI (no desktop UI)

```bash
cd apps/backend
python runners/spec_runner.py --interactive   # create a spec
python run.py --spec 001                       # run an autonomous build
```

See [`README.upstream.md`](./README.upstream.md) for the full CLI reference.
