# DejaBug 👻 - VSCode Extension

DejaBug captures the context of every bug fixed in your repo as a **snapshot** (why it happened, how it was fixed, in which commit) and watches new code you write in the background to detect matches against those snapshots. When it finds one, it shows a discreet warning — a "ghost" 👻 — in the gutter, with a CodeLens and a hover card summarizing the fix and linking back to it.

It's not a fixed-rule linter: it's the team's collective memory, triggered by code proximity.

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
- **Structural detection.** The same bug reintroduced under a different name and in a different file still shows the ghost, if it matches one of the catalogued risky AST patterns (a `for` loop whose index is reassigned inside the body, a `===`/`==` comparison against a non-integer numeric value, or an `await` followed by an unguarded write to shared state). Third in the cascade, only over what location/symbol didn't already resolve.
- **Issue Tracker Connector.** When a fix commit's `Fixes #`/`Closes #` references a GitHub or GitLab issue, DejaBug fetches its title and labels (via a token you set with `DejaBug: Set GitHub Token` / `DejaBug: Set GitLab Token`, stored in the OS keychain, never in settings) to enrich the snapshot's summary and tags. Fails silently — no token, network error, or unsupported host just falls back to the plain commit message, same as Phase 1.
- **Duplicate snapshot cleanup.** `DejaBug: Find Duplicate Snapshots` groups snapshots that share a fix commit or overlapping file/line range (the typical case: two branches independently snapshotting the same fix before merging) and lets you pick which one to keep per group — nothing is deleted without that explicit choice.
- **Semantic detection.** The same *kind* of bug, written with completely different code and in a different symbol/file, can still show the ghost — a local embedding model (no code ever leaves your machine) compares the current block against every snapshot by cosine similarity. Runs last in the cascade (most expensive, least precise of the four strategies), only over what location/symbol/structure didn't already resolve. Threshold is `dejabug.semanticThreshold` (default `0.86`), auto-tuned over time by your "👍 Useful" / "👎 Not relevant" feedback on semantic ghosts specifically — never touches a shared workspace setting, only your own user setting.
- **Team patterns panel.** `DejaBug: Show Team Patterns` groups every snapshot in `.dejabug/` by structural pattern, tag, and author — a read-only view over data that already synced via git, no new backend involved.
- **Quick actions.** Every ghost has "👍 Useful" and "👎 Not relevant" buttons to feed back into the system (the basis for the semantic threshold's auto-tuning, and a seed for future noise-reduction work).
- **Manual commands.** `DejaBug: Create Snapshot from Selection` (for fixes that didn't follow the commit convention) and `DejaBug: View All Snapshots` (browse `.dejabug/` without reading JSON by hand).
- **Local-first.** Detection and storage run entirely on your machine, including the semantic model — the only outbound calls anywhere in the extension are the optional, explicitly-token-gated GitHub/GitLab issue lookups. No team backend sync yet — that's future work, always meant to be optional and self-hostable.

## Requirements

- A git repo (a workspace with `.git/`) — without this, the Git Watcher and the Proximity Detector never start.
- No extra settings required for normal use. The semantic model (~90MB) downloads and caches on first use — needs internet the very first time, nothing after that, and no API key ever.

## Known Issues

- **Location and symbol detection isn't about logic.** A brand new function with the same name as one that had a fix will show the ghost even if its logic has nothing to do with the original bug (expected false positive).
- **The structural pattern catalog is small and syntactic, not semantic — and JS/TS only.** Only the 3 catalogued patterns are recognized; a conceptually similar bug written with a different code shape (a `for` vs. a `.reduce()`, say) needs the semantic strategy to have a chance at matching, not this one.
- **The semantic model is general-purpose, not code-specific, and its similarity scores run lower than you'd expect.** In testing, a genuinely-the-same-bug pair written with different code shapes scored ~0.5 cosine similarity — well under the default `0.86` threshold. The feedback loop's auto-tuning is clamped to a `0.75` floor, so it won't drift down far enough on its own to catch pairs like that; matching them for real currently means lowering `dejabug.semanticThreshold` by hand. A code-specific embedding model would likely score these better — worth revisiting before leaning on this strategy day-to-day.
- **Packaging with the semantic model's dependency is untested.** `@huggingface/transformers` is marked `external` in the esbuild config (ships via its own `node_modules/` instead of being bundled into `dist/extension.js`) — this works in the Extension Development Host, but building and installing an actual `.vsix` with it has not been verified yet. See `MVP_FASE3.md`, Paso 1.
- Only the first hunk per file is captured when building a snapshot from a commit that touched several change blocks in the same file (commit-diff hunks under `.dejabug/` itself, e.g. `timesShown` bumps swept in by `git commit -a`, are excluded from this — they're never treated as "fixed code").
- No Sentry integration (correlating ghosts with real production errors) — deferred, see `MVP_FASE3.md`. No Jira/Linear integration either (GitHub/GitLab only), and no team backend sync — snapshots only travel via `.dejabug/` versioned in git.

## Release Notes

### 0.0.1

Phase 1 MVP: Snapshot Store, Git Watcher, Snapshot Generator (with human confirmation), Proximity Detector (location + symbol), Ghost Overlay UI (gutter + CodeLens + hover), manual fallback commands, and an automated test suite.

### Phase 2 — Enriched context

Structural detection (AST pattern catalog) as the cascade's third strategy, GitHub/GitLab Issue Tracker Connector (silent fallback, tokens in `context.secrets`), `DejaBug: Find Duplicate Snapshots`, and on-demand `schemaVersion` migration. See `MVP_FASE2.md` for the full build plan.

### Phase 3 — Semantic intelligence

Semantic detection via a local embedding model (cascade's fourth and final strategy), a feedback loop that auto-tunes `dejabug.semanticThreshold` from "Useful"/"Not relevant" votes on semantic ghosts, and `DejaBug: Show Team Patterns`. Sentry integration deliberately not implemented — see `MVP_FASE3.md` for the full build plan and the reasoning behind that call.
