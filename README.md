# DejaBug 👻 - VSCode Extension

DejaBug captures the context of every bug fixed in your repo as a **snapshot** (why it happened, how it was fixed, in which commit) and watches new code you write in the background to detect matches against those snapshots. When it finds one, it shows a discreet warning — a "ghost" 👻 — in the gutter, with a CodeLens and a hover card summarizing the fix and linking back to it.

It's not a fixed-rule linter: it's the team's collective memory, triggered by code proximity.

This is the **MVP (Phase 1)** state. The full step-by-step of how it was built lives in `MVP_FASE1.md` at the root of the repo.

## Snapshots

<img width="1178" height="479" alt="Screenshot 2026-08-21 at 6 05 40 PM" src="https://github.com/user-attachments/assets/dde31535-36eb-45c8-98c2-175fd0a47a6a" />
<img width="723" height="243" alt="Screenshot 2026-08-21 at 6 05 50 PM" src="https://github.com/user-attachments/assets/29aed6aa-9f5a-4089-83e9-d6ddc52c2484" />
<img width="430" height="100" alt="Screenshot 2026-08-21 at 6 06 24 PM" src="https://github.com/user-attachments/assets/15f1916b-fdd5-40d4-838c-9a41ac9b400c" />


## Features

- **Automatic snapshot from commits.** Committing with a message that follows the `Fixes #123` / `Closes #123` convention (or `Fixes JIRA-456` for letter-prefixed trackers) makes DejaBug draft a snapshot from the fix's diff and ask you to confirm before saving anything — it never saves without you reviewing it first.
- **Location-based detection.** Saving a file again near a line that had a fix, while that line is still untouched since then, shows the ghost.
- **Symbol-based detection.** A function/class with the same name as one that had a fix, in a different file, also shows the ghost — regardless of location.
- **Quick actions.** Every ghost has "👍 Useful" and "👎 Not relevant" buttons to feed back into the system (the basis for future phases' noise tuning).
- **Manual commands.** `DejaBug: Create Snapshot from Selection` (for fixes that didn't follow the commit convention) and `DejaBug: View All Snapshots` (browse `.dejabug/` without reading JSON by hand).
- **100% local.** Everything runs on your machine, no external API calls or team sync — that comes in future phases, always optional and self-hostable.

## Requirements

- A git repo (a workspace with `.git/`) — without this, the Git Watcher and the Proximity Detector never start.
- No extra settings or extensions required for normal use.

## Known Issues

- **Phase 1 detects by location and symbol, not by logic.** A brand new function with the same name as one that had a fix will show the ghost even if its logic has nothing to do with the original bug (expected false positive). The same bug reintroduced under a different name, somewhere else, won't be detected (expected false negative). Structural (AST) and semantic (embeddings) detection arrive in Phase 2 and Phase 3 — see the roadmap in `idea.md`.
- Only the first hunk per file is captured when building a snapshot from a commit that touched several change blocks in the same file.
- No GitHub/GitLab/Jira/Linear integration yet — an automatic snapshot's summary is just the commit message as-is, not enriched with issue data.

## Release Notes

### 0.0.1

Phase 1 MVP: Snapshot Store, Git Watcher, Snapshot Generator (with human confirmation), Proximity Detector (location + symbol), Ghost Overlay UI (gutter + CodeLens + hover), manual fallback commands, and an automated test suite.
