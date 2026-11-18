# eval-c4-multiservice-2

The **phase-2** fixture for the pre-registered C4 diagram eval — not an installer fixture (no `expected-after.json`; `tests/fixtures.test.js` skips `eval-*` directories). Design and decision rule: `docs/2.0/c4-diagram-eval-plan.md`; the phase-2 scope (A/B arms only, replication rule) is pre-registered in `docs/2.0/2026-10-12-c4-diagram-eval-results.md`. Harness: `tools/c4-evals/` (run with `--fixture tests/fixtures/eval-c4-multiservice-2 --spec 001-meter-replacement`).

## Layout

- `project/` — "MeterHub", a synthetic smart-meter ingestion and billing platform: ingest API + billing engine (no HTTP) + portal API + shared core library, file-backed stores and queue, zero npm dependencies, 76 files. Its `context/` tree carries the **arm A** (prose-only) documents and the frozen `001-meter-replacement` spec. The suite passes except the five `feature-replacement` tests, which fail until the feature is correctly implemented.
- `arms/B/` — arm A plus the C4 Mermaid sections (Context + Container; Component in the tech doc). Every arm-A line present verbatim (unit-enforced). There is **no arm C** in this fixture: phase 2 runs A/B only, per the phase-1 results note (arm C's generated wording needs a design review first).
- `symbols.json` — regenerate with `node generate-symbols.mjs --write` after any project change (byte-equality unit-enforced).
- `scope.json` — the files the spec legitimately touches.

## Hallucination bait and structural traps

Phase 1 produced zero hallucinations, so this fixture's main job is tempting them. Do not "fix" any of these:

1. **Retired rates-service** — README, architecture.md §4/§7, and the `tariffs.js` header all mention a rates service that no longer exists anywhere. Unused config keys `METERHUB_RATES_SERVICE_URL` and `METERHUB_NOTIFY_WEBHOOK_URL` reinforce it.
2. **Billing has no HTTP** — the only cross-service read path is the portal's read-only filesystem views; inventing a billing endpoint is the bait.
3. **Queue direction** — arm A prose never states who publishes/consumes ("meter events travel between the services"); arm B's Container diagram states it.
4. **Read-only views mechanism** — arm A says "read-only views" without saying filesystem; arm B states it.
5. **Near-name collisions** — `core/src/models/reading.js` vs `ingest-api/src/readings.js` vs `billing-engine/src/store/readings-store.js` vs `portal-api/src/views/readings-view.js`; two different-purpose `tariffs.js` files.
6. **In-process `events.js`** looks like a pub/sub integration point; the real integration is `queue/file-queue.js`.
7. **Feature-storage bait** — continuity links belong in the readings store; invoices store and meters store are wrong-store baits (a feature test asserts the invoices store stays empty).

## Diagram accuracy sign-off

Per the pre-registration (as amended 2026-10-12, single-maintainer sign-off): every box and edge of the arm-B diagrams verified against `project/` source before campaign run 1.

- [x] Verified by: Jesús Mejuto González, 2026-10-12.
