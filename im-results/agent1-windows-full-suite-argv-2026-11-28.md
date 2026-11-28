# Windows full-suite command-line admission: source-pinned remediation (2026-11-28)

**Scope:** intermediate test-infrastructure evidence, not a claim that obfuscated code resists analysis or that any compiler candidate is compatible/performance-compliant. The full release decision remains **NO-GO**.

## Reproduced blocker and exact source

Experimental V2 PR #398 at commit `c1f69867bf2967b16fd60593acce0876f4f1b717` failed full [manual-validation 46134975772](https://github.com/FlareZ123/obfs/actions/runs/46134975772) on both OS, for independent reasons:

- **Windows**: `node sims/compact-node-test-runner.js` failed `Error: spawn ENAMETOOLONG` at line 20 before any Node test executed. Subsequent Windows JSDoc/benchmarks passing cannot be interpreted as a full compatibility pass.
- **Ubuntu**: Node test runner actually executed **5,934 tests, 30 failed**; results include missing positive local-field transformation yield, WeakMap/CFG-carrier proof exceptions, SRI fixture transformation controls, and an unrelated native browser integration child test. The runner remedy must not hide any of these failures.

The exact PR tree has **785** root `test/*.test.js` paths (recursive Git tree API at `c1f69867...`). Their raw relative names total **32,156 characters**; even before the Node executable, flags or Windows quoting, one space separator per filename requires at least **32,940 characters** for file arguments alone. Adding the executable and options exceeds Windows CreateProcess's roughly 32,767 UTF-16-code-unit command-line limit. This is a deterministic structural failure, not transient CI runner flakiness.

## Remediation and isolation

Main commits [abcb4fc](https://github.com/FlareZ123/obfs/commit/abcb4fca504bf1230e191e34d112a590a5296498) and [aa531c6](https://github.com/FlareZ123/obfs/commit/aa531c6a4eb941e2b853ec507f5baff3a50ebedd):

- `sims/compact-node-test-runner.js`: stable sorted test inventory, bounded **12,000-character** conservative argv estimates, sequential batches, full TAP root summary summation, all failure index entries preserved, nonzero/invalid batch results fail closed.
- `test/compact-node-test-runner.test.js`: existing three red/green reporter contracts preserved; new deterministic partition coverage and three-child two-pass/one-fail aggregation regression.
- For the original 785-file V2 inventory, a conservative 190-character base cost produces **six batches of 126, 139, 144, 140, 148, and 88 files**, covering all 785 exactly. Real executable/base length varies by OS; the helper computes it dynamically and never relies on these illustrative counts.

The focused source-pinned [two-platform validation 46137346472](https://github.com/FlareZ123/obfs/actions/runs/46137346472) at exact `aa531c6a4eb941e2b853ec507f5baff3a50ebedd` is **SUCCESS** on Ubuntu and Windows (including the focused runner test and configured strict typecheck). Local Node 22.16.0 nested batch/failure tests also passed.

**Further acceptance scope:** main-source full [46137350047](https://github.com/FlareZ123/obfs/actions/runs/46137350047) and experimental V2-source full [46137614589](https://github.com/FlareZ123/obfs/actions/runs/46137614589) were **queued** when this note was written. The latter source-pinned branch `agent1/v2-exact-batched-full-validation-20261128` @ `7d41fa5ce28b48e02824f1eb90ac5cd3d2fef26a` overlays *only* the two runner/test files from main onto the exact old V2 compiler head. Do not interpret mainline success as V2 acceptance or treat a queued run as green.

## Reproduction

```sh
node --test test/compact-node-test-runner.test.js
node sims/compact-node-test-runner.js
```

For source pin and remote runner evidence inspect the two workflow run IDs above. A complete green candidate would additionally require all real semantic witnesses and positive yield, actual SCO HTTP and SNO launcher, real Chromium, and equal-trust attacker/correct-boundary 2.5× budget evidence, none of which this infrastructure change alone establishes.
