---
'@astryxdesign/cli': patch
'@astryxdesign/core': patch
---

[fix] `astryx init` writes the agent docs so that Codex, Gemini CLI, Copilot CLI and Claude Code each read the block once, from the project root or any folder below it. It writes them at the project root instead of the folder it ran in, and never into the home folder.
@josephfarina

- `AGENTS.md` holds the block.
- Gemini CLI reads only `GEMINI.md`: init adds a one-line import, `@./AGENTS.md`, creating `GEMINI.md` when it is missing.
- Claude Code skips `AGENTS.md` in a folder that has a `CLAUDE.md` or `.claude/CLAUDE.md`. In such a project init also writes the block to `.claude/CLAUDE.md`, creating it when missing, and removes it from a root `CLAUDE.md`. Copilot CLI reads a root `CLAUDE.md` as well as `AGENTS.md`, so a block there reached it twice. `astryx upgrade` refreshes both copies.
- Before, a project with only `CLAUDE.md` got the block only there, so Codex and Gemini CLI never saw it, and a project with `AGENTS.md` and `CLAUDE.md` got two copies that Copilot CLI read twice. Run `astryx init` again to move a project to the new layout.
- Run from a subfolder, init writes at the project root, the nearest folder at or above it with a `package.json`. The search stops at a repository root and never reaches the home folder. `docsWritten` still lists each file relative to where init ran, for example `../../AGENTS.md`.
- `--agent` and `--agent-docs-path` still write the full block to the files they name; `--agent-docs-path` stays relative to where init ran.
- In the home folder, init writes no agent docs, reports `docsError` as `install-failed` with the reason, and still exits 0. Agents read the files there in every project. Run `astryx init --remove-agents` in the home folder to remove a block an earlier version wrote into `~/.claude/CLAUDE.md`.
- The install-time setup check in `@astryxdesign/core` also looks at `GEMINI.md`.
