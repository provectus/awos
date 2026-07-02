# Squash-merge (and single-merger) blind spot in merge-derived metrics

**Severity:** high — an entire family of DORA/throughput metrics silently mis-measures on repositories that squash-merge or rebase-merge pull requests (GitHub's common default), or that route all merges through one person or a bot. The measurement isn't wrong per-commit; the whole signal source is absent or misattributed, so the metrics report `0` / SKIP / one-person-only instead of the real picture.

Locations are `file:line` within `plugins/awos/skills/ai-readiness-audit/`.

## Root cause

Every merge signal is derived from **merge commits** on the trunk's first-parent line:

- Per-author merges — `collectors/git.ts:463-467`: `git log --first-parent --merges --since=<90d> --format=%aN`, grouped by author.
- Total + revert merges — `getMergeStats`, `collectors/git.ts:150-175`: `git log --first-parent --merges`.
- Merge records (branch lead-time proxy) — `getMergeRecords`, `collectors/git.ts:183-228`: mainline `--first-parent` graph.
- Window revert/fix merges — `buildWindowStats`, `collectors/git.ts:386-421`: `--first-parent --merges` filtered by subject keywords.

Two independent failure modes make merge commits an unreliable proxy:

1. **Squash-and-merge / rebase-merge produce no merge commits.** With those PR strategies the whole branch collapses into a single ordinary commit on the trunk — there is no 2-parent merge commit at all. `git log --merges` therefore returns close to zero regardless of how many PRs actually merged. This is not a niche setting: GitHub, GitLab, and Bitbucket all offer (and many orgs mandate) squash-merge, and "squash and merge" is the button many teams click by default.

2. **A merge commit is authored by whoever performed the merge, not the PR author.** Even in a true merge-commit workflow, `--first-parent --merges --format=%aN` credits the merger (often one maintainer, a release manager, or a bot like `github-actions[bot]`). So per-author merge counts concentrate on one identity and read `0` for every actual contributor.

Neither is a windowing bug — the merge queries use the same 90-day `since` as everything else (`collectors/git.ts:382`), anchored to the newest commit. The window is correct; the source is blind.

## Evidence

`onex-discovery-api` (real run, `context/audits/.../collected/git.json`), 90-day window, 9 authors:

| author                | commits | merges |
| --------------------- | ------: | -----: |
| Aleksandr Makarov     |     329 | **19** |
| Juan Andres Pasos Rua |      33 |      0 |
| cristhiancjgs20       |      18 |      0 |
| Alexander Shleyko     |      13 |      0 |
| Vahe Yavrumyan        |      12 |      0 |
| jpasosrua             |       7 |      0 |
| Juan                  |       5 |      0 |
| juan                  |       1 |      0 |
| William Wang          |       1 |      0 |

Only one author (the person who merges) has any merges; 19 merges against ~420 commits over 90 days. That ratio is the fingerprint of a squash-merge workflow — most PRs land as single squashed commits (no merge commit), and the handful of real merge commits are all authored by the one maintainer who performed them.

## Affected metrics

Everything that reads merge data inherits the blind spot. In a squash-merge repo these collapse toward zero / SKIP; in a single-merger repo they concentrate on one identity:

- **Headline "Merges" throughput** — `window_stats.merges`, `merges_per_active`, `merges_per_active_per_week` (`collectors/git.ts:490-514`). Undercounts real merged work.
- **ADP-G3 deploy frequency** (`metrics/adp_g3_deploy_frequency.ts`) — merge-as-deploy proxy reads near zero.
- **ADP-G4 lead time** (`metrics/adp_g4_lead_time.ts`) — consumes `merge_records`; no merge commits ⇒ no records ⇒ SKIP / wrong.
- **ADP-G5 PR cycle time** (`metrics/adp_g5_pr_cycle_time.ts`).
- **ADP-G7 change-failure rate** (`metrics/adp_g7_change_fail_rate.ts`) — uses `revert_merges`; squash-reverts are ordinary commits, so this trends to 0.
- **ADP-G8 review rework** (`metrics/adp_g8_review_rework.ts`).
- **ADP-G14 rework rate** (`metrics/adp_g14_rework_rate.ts`) — uses `fix_merges` (merge-subject keywords); no merge commits ⇒ 0.
- **ADP-I3 MTTR** (`metrics/adp_i3_mttr.ts`) — merge-interval proxy.
- **Org rollup** (`metrics/org_rollup.ts`) — aggregates the above per portfolio.

### Knock-on: it also distorts the active-contributor count

The active-contributor rule (`collectors/git.ts` `activeContributors`, and metric `adp_g2_contributors`) keeps an author unless **both** their merge-share and LOC-share fall below `T`. In a squash-merge / single-merger repo, merge-share is `0` for everyone except the one merger — so the merge half of the OR is dead, and the rule degenerates to **LOC-share only**. That is exactly the condition under which a single dominant author (one big import / lockfile churn) pushes everyone else below the LOC threshold, producing the "1 active of 9" result. Squash-merge doesn't cause that bug, but it removes the merge-share safety valve that would otherwise keep genuine PR authors "active."

## Expected / fix directions

- **Detect the merge strategy** and, when merge commits are effectively absent, mark merge-derived metrics `SKIP` / `not-reliable` (with a reason) instead of silently reporting `0`. Reporting a confident `0` for change-failure/rework/deploy-freq on a healthy squash-merge repo is worse than admitting the source is unavailable.
- **Prefer connector-sourced PR data** (GitHub/GitLab PR + review APIs) over merge commits for DORA-style metrics. The connector knows the PR author, merge time, review cycles, and reverts regardless of squash strategy; merge commits are only a fallback proxy.
- **Add a squash-aware proxy** for the git-only path: treat first-parent trunk commits whose message carries a PR reference (e.g. `(#123)`) as merge events, and attribute them to the commit author rather than the merger.
- **Decouple the active-contributor rule from merge-share** (or make merge-share contribute only when merge commits actually exist), so squash-merge repos don't fall back to a LOC-share-only rule that a dominant author can collapse.

Cross-references: the "1 active of 9" LOC-dominance case is the contributor symptom this amplifies; git author-identity aliasing (the same person as `Juan Andres Pasos Rua` / `Juan` / `juan` / `jpasosrua`) is a separate over-count discussed with the contributor metric.
