# AutoClaude — Dboy5312's Remake

A maintained fork of **[Auto-Claude](https://github.com/AndyMik90/Auto-Claude)** by [AndyMik90](https://github.com/AndyMik90) — an Electron + React desktop app that drives a multi-phase autonomous coding agent (spec → planning → coding → QA) on top of the Claude Agent SDK, with per-task git worktrees.

This fork picks up where upstream paused: it fixes a class of Windows reliability bugs, quiets a noisy rate-limit loop, adds the latest models, and layers on a set of Claude-Desktop-style capability features (Skills, Output Styles, a global persona, scheduled tasks, a connectors catalog, and a plugin loader).

> **Status:** active dev fork. This repo currently documents the changes and ships the license + attribution. The full source publish is staged behind a credential-scrub pass (see [Publishing the code](#publishing-the-code)).

---

## Why this fork exists

Upstream Auto-Claude is excellent but hasn't shipped recent updates. This remake keeps the same architecture and license (AGPL-3.0) and continues development — bug fixes, newer Claude models, and quality-of-life features — so the community has an actively maintained build to track.

It is **not** a rewrite or a relicense. It's a fork: same AGPL-3.0 terms, full credit to the original author, all upstream history preserved when the source is published.

---

## What's fixed

| Area | Fix | Why it matters |
|---|---|---|
| **Plan-file persistence (Windows)** | `writeFileAtomicSync` had a single rename attempt with no retry. A transient Windows `EPERM` on rename (more likely with a space in the project path, or with antivirus/file-watcher holding a handle) silently dropped the phase write — and the task got auto-corrected to `human_review`, looking like a "validation failure." Added `writeFileAtomicSyncWithRetry`: backoff retry on transient errors, then a non-atomic direct-write fallback so **data is never lost**. All plan-file writers route through it. | This is the bug that made tasks mysteriously stall at validation on Windows. |
| **Usage-monitor 429 flood** | The usage poller hit the API every 30s, fanned out one call per profile, had no `429`/`Retry-After` handling, and logged `console.error` unconditionally — flooding logs with `429 Too Many Requests`. Added a global circuit-breaker that honors `Retry-After` and pauses all polling, throttled+counted logging, and a 60s + jitter base interval. | Stops log spam that masked real errors and reduces wasted API calls. |

Both fixes are covered by unit tests (47 passing across the atomic-file suites, including the retry → fallback → data-preserved path).

## What's added

- **Models:** Claude **Opus 4.8** and **Opus 4.8 (1M)** as selectable models, plus an **"Ultracode"** agent profile (Opus 4.8 1M, max thinking on every phase + feature).
- **Skills runtime:** file-based capability packs (`SKILL.md` with YAML frontmatter) discovered from `<userData>/skills/`, with a sidebar UI to list/run/toggle/create them.
- **Output Styles:** selectable response-shaping presets (concise, explanatory, markdown-tables, junior-friendly, …) for the Insights chat.
- **Persona (SOUL.md) + Global Agent Instructions:** a persistent persona for the Insights chat and a separate `AGENT_INSTRUCTIONS.md` injected into the task pipeline — deliberately split so chat-tone tweaks can't corrupt structured planning/QA phases.
- **File attachments:** attach PDFs / text / code / config files (≤10 MB) to a task; contents are processed into the task description.
- **Connectors catalog:** 15 curated MCP servers (Filesystem, GitHub, GitLab, Postgres, …) you can add to a project in a couple of clicks.
- **Plugin loader:** install file-based plugins (`plugin.json`) that contribute MCP servers to a project.
- **Scheduled tasks:** cron-based recurring tasks, persisted across restarts.
- **Preview pane:** render task-produced artifacts (HTML/markdown/etc.) from the Kanban board and task detail modal.
- **Buildbay tab (experimental):** a landing surface for an in-progress "AutoClaude for VEX robotics CAD" direction (the actual CAD harness lives in a separate project; this tab is currently a roadmap placeholder).
- **UI polish:** button micro-animations (e.g. reload affordances with a minimum-duration spinner + success toast), default model set to the newest Opus.

## What's intentionally not changed

Architecture, IPC layout, the Python multi-phase backend, and the AGPL-3.0 license are all unchanged. This is a continuation, not a divergence.

---

## Publishing the code

This repo is the documentation + license landing page. The full application source is published as a **second step**, on purpose, because the working tree contains things that must never go public:

- `.env` files and `<project>/.auto-claude/.env` (API keys, OAuth tokens)
- profile credential stores
- the maintainer's own project data under `.auto-claude/worktrees/`

Before the source goes up it gets a credential-scrub pass (gitignore audit + history check) so none of that leaks. Until then, this README is the source of truth for *what changed*.

If you want to build from the upstream base in the meantime, start at [AndyMik90/Auto-Claude](https://github.com/AndyMik90/Auto-Claude) and apply the changes described above.

---

## Credits & License

- Original work: **[Auto-Claude](https://github.com/AndyMik90/Auto-Claude)** © AndyMik90 and contributors.
- This fork: maintained by **[Dboy5312](https://github.com/Dboy5312)**.
- Licensed under the **GNU Affero General Public License v3.0** — same as upstream. See [LICENSE](./LICENSE). If you run a modified version over a network, AGPL §13 requires you to offer your users the corresponding source.

Built with [Claude Code](https://claude.com/claude-code).
