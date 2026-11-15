# Agent 12 research continuity

Claimed at **2026-11-15T08:36:57Z** as run `4f7f452e-8442-4dd2-8681-1eaca4fbfcff`; actual initial RNG draw **4** selected normal mode. Original lease is `agents/agent12/.lease.json`, never refresh it. Self-initiated release is valid only after clock-measured elapsed >=70 minutes, i.e. **09:46:57 UTC**. Before release, finish/push valuable state, then delete lease as the **last** mutation and confirm. Every own commit title must be `Agent 12:`. No per-commit GitHub Actions workflows (README).

## Verified contribution: dynamic string extraction

- `sims/runtime-decoder-trace.js` instruments the attacker-controlled global `String.fromCharCode` before evaluating compiler output in a trusted Node vm fixture. `test/runtime-decoder-trace.test.js` runs ten distinct deterministic seeds in each of SCO client (opt-in encoding), COO (opt-in), and SNO (default) with both short Unicode and long >=1024 code-unit text. A dormant never-called function's private string is absent from the emitted source but reappears in hook output on eager decoder initialization; public output unchanged.
- **30/30 extraction runs on Ubuntu and Windows** in manual workflow [43695839545](https://github.com/FlareZ123/obfs/actions/runs/43695839545) at head `8ab554d7`. All three new subtests passed, JSDoc passed. Full suite had five existing source-observer failures, so the workflow was red; do not call it release green.
- Evidence report `im-results/runtime-decoder-extraction-2026-11-15.md` commit `db912316`. This is shape-specific to native `String.fromCharCode` eager decoding and does not break genuinely server-private SCO functions or authorization. Existing static decoder recovery from Agent 2 is a separate known weakness.

## Coverage quantification and source observer repairs

- Added `sims/source-observer-coverage.js` and `test/source-observer-coverage.test.js` to compare an unobserved ESM graph, the same graph with a watched exported function's native source observed, and a hand-segregated independent ESM module (no general automatic proof asserted). Node's real ESM loader verifies outputs. Included in existing **manual-only** `.github/workflows/manual-transform-safety.yml`.
- Initial fixture with property objects inside exported function bodies failed the positive coverage threshold (manual workflow [43696365578](https://github.com/FlareZ123/obfs/actions/runs/43696365578)). Moved local objects to module initialization, leaving exported functions' native source independent of those keys. Subsequent focused manual Linux/Windows run [43696561203](https://github.com/FlareZ123/obfs/actions/runs/43696561203) **passed both jobs** on head `1177f496`. The assertions establish at least two eligible keys in the unobserved graph, zero when any file observes function source, and at least one preserved in a manually isolated independent file. Exact counts have not been logged separately.
- Initial full validation of head `8ab554d7` confirmed five pre-existing failures, tests 58 (BigInt guard), 90-91 (computed local source key), 403-404 (SCO cross-file computed/Reflect source keys). Added one structural constant-key resolver in `src/ast.js::observesFunctionSource` following unique `const` bindings and a conservative unknown computed-key guard for tracked functions, plus BigInt/BigInt.asIntN/asUintN coercion detection. Commit `998c00bb`.
- Fresh cross-platform full manual validation [43696715738](https://github.com/FlareZ123/obfs/actions/runs/43696715738) was in progress when this memory was written. Check its status, logs and semantic/coverage regressions. If green, report clearly; if red, repair without weakening tests. Distinguish native `BigInt` errors from coercion false positives and do not claim complete source-observation proof.


## Verified integration update (08:59 UTC)

- The repaired source observer build on head `998c00bb` passed **both Windows and Ubuntu** in full manual Actions [43696715738](https://github.com/FlareZ123/obfs/actions/runs/43696715738): behavioral/adversarial tests, JSDoc, benchmark, Ubuntu Chromium integration all green. Report `im-results/source-observer-proof-coverage-2026-11-15.md` commit `280ad52f`.
- Added a live Chromium attacker fixture to `test/browser-integration.js` (commit `0f8dcf3e`). Manual browser workflow [43696954625](https://github.com/FlareZ123/obfs/actions/runs/43696954625) passed with explicit log: `Chromium PASS: /trace.html: 37:browser-dormant-plaintext-canary`. Real browser hook recovers eager decoded dormant literal before program initialization, without knowing plaintext in HTML. Runtime extraction report updated in `0efec3ad`.
- The full-suite green checkpoint predates the browser-test-only commit; browser-focused workflow is green for that succeeding commit. Avoid claiming an unrun later full-suite is green. No source production code changed after `998c00bb` as of this update.

## Future priorities

- Monitor Critic broadcasts from 07:30/08:30. Preserve true attack evidence and soundness; avoid repeated full-suite dispatches on tiny changes. Group changes into coherent checkpoints. Current `results/` index intentionally claims no peer-review-grade general resistance result.
- Measure coverage loss of whole-group source-observer opt-out on larger independent ESM graphs before attempting automatic graph-local selective safety; do not sacrifice correctness to gain property count.
- Continue independent attack success and end-to-end 2.5x probes, especially browser runtime instrumentation and genuinely trusted SCO private computation. Eager literal decoding is not confidentiality against full-control clients.
- The working container does not resolve github.com (git clone fails), but authenticated GitHub and GitHub Actions connectors work via `functions.exec`. Use Actions MCP, not regular GitHub tools, for workflow logs. The local Node.js runtime is 22.
