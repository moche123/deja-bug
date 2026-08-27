# DejaBug 👻 - VSCode Extension

DejaBug captures the context of every bug fixed in your repo as a **snapshot** (why it happened, how it was fixed, in which commit) and watches new code you write in the background to detect matches against those snapshots. When it finds one, it shows a discreet warning — a "ghost" 👻 — in the gutter, with a CodeLens and a hover card summarizing the fix and linking back to it.

It's not a fixed-rule linter: it's the team's collective memory, triggered by code proximity.

**Phase 1 and Phase 2 are complete.** The full step-by-step of how Phase 1 was built lives in `MVP_FASE1.md`; the instructions plan followed for Phase 2 lives in `MVP_FASE2.md` — both at the root of the repo.

## Snapshots

### Hover feature
<img width="1178" height="479" alt="Screenshot 2026-08-21 at 6 05 40 PM" src="https://github.com/user-attachments/assets/dde31535-36eb-45c8-98c2-175fd0a47a6a" />

### Lens feature
<img width="430" height="100" alt="Screenshot 2026-08-21 at 6 06 24 PM" src="https://github.com/user-attachments/assets/15f1916b-fdd5-40d4-838c-9a41ac9b400c" />


### Manual command feature
<img width="723" height="243" alt="Screenshot 2026-08-21 at 6 05 50 PM" src="https://github.com/user-attachments/assets/29aed6aa-9f5a-4089-83e9-d6ddc52c2484" />

## Features

- **Automatic snapshot from commits.** Committing with a message that follows the `Fixes #123` / `Closes #123` convention (or `Fixes JIRA-456` for letter-prefixed trackers) makes DejaBug draft a snapshot from the fix's diff and ask you to confirm before saving anything — it never saves without you reviewing it first.
- **Location-based detection.** Saving a file again near a line that had a fix, while that line is still untouched since then, shows the ghost.
- **Symbol-based detection.** A function/class with the same name as one that had a fix, in a different file, also shows the ghost — regardless of location.
- **Structural detection.** The same bug reintroduced under a different name and in a different file still shows the ghost, if it matches one of the catalogued risky AST patterns (a `for` loop whose index is reassigned inside the body, a `===`/`==` comparison against a non-integer numeric value, or an `await` followed by an unguarded write to shared state). Runs last in the cascade, only over what location/symbol didn't already resolve.
- **Issue Tracker Connector.** When a fix commit's `Fixes #`/`Closes #` references a GitHub or GitLab issue, DejaBug fetches its title and labels (via a token you set with `DejaBug: Set GitHub Token` / `DejaBug: Set GitLab Token`, stored in the OS keychain, never in settings) to enrich the snapshot's summary and tags. Fails silently — no token, network error, or unsupported host just falls back to the plain commit message, same as Phase 1.
- **Duplicate snapshot cleanup.** `DejaBug: Find Duplicate Snapshots` groups snapshots that share a fix commit or overlapping file/line range (the typical case: two branches independently snapshotting the same fix before merging) and lets you pick which one to keep per group — nothing is deleted without that explicit choice.
- **Quick actions.** Every ghost has "👍 Useful" and "👎 Not relevant" buttons to feed back into the system (the basis for future phases' noise tuning).
- **Manual commands.** `DejaBug: Create Snapshot from Selection` (for fixes that didn't follow the commit convention) and `DejaBug: View All Snapshots` (browse `.dejabug/` without reading JSON by hand).
- **Local-first.** Detection and storage run entirely on your machine; the only outbound calls are the optional, explicitly-token-gated GitHub/GitLab issue lookups. No team backend sync yet — that's future work, always meant to be optional and self-hostable.

## Requirements

- A git repo (a workspace with `.git/`) — without this, the Git Watcher and the Proximity Detector never start.
- No extra settings or extensions required for normal use.

## Known Issues

- **Location and symbol detection isn't about logic.** A brand new function with the same name as one that had a fix will show the ghost even if its logic has nothing to do with the original bug (expected false positive).
- **The structural pattern catalog is small and syntactic, not semantic — and JS/TS only.** Only the 3 catalogued patterns are recognized; a conceptually similar bug written with a different code shape (a `for` vs. a `.reduce()`, say) still won't match. That's semantic (embeddings) detection, planned for Phase 3 — see the roadmap in `idea.md`.
- Only the first hunk per file is captured when building a snapshot from a commit that touched several change blocks in the same file (commit-diff hunks under `.dejabug/` itself, e.g. `timesShown` bumps swept in by `git commit -a`, are excluded from this — they're never treated as "fixed code").
- No Jira/Linear integration yet (GitHub/GitLab only), and no team backend sync — snapshots only travel via `.dejabug/` versioned in git.

## Release Notes

### 0.0.1

Phase 1 MVP: Snapshot Store, Git Watcher, Snapshot Generator (with human confirmation), Proximity Detector (location + symbol), Ghost Overlay UI (gutter + CodeLens + hover), manual fallback commands, and an automated test suite.

### Phase 2 — Enriched context

Structural detection (AST pattern catalog) as the cascade's third strategy, GitHub/GitLab Issue Tracker Connector (silent fallback, tokens in `context.secrets`), `DejaBug: Find Duplicate Snapshots`, and on-demand `schemaVersion` migration. See `MVP_FASE2.md` for the full build plan.
