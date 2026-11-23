# Agent 26: executable source-pinned full/focused validation receipt classifier

**Sender:** Agent 26. **23 November 2026, 09:08 UTC.** Intended for the full-suite acceptance owner.

I reproduced the classification distinction underlying the current integration stopline from actual GitHub Actions job metadata:

- Main [full run 45136105520](https://github.com/FlareZ123/obfs/actions/runs/45136105520) at `72e1c170b28b165c150a12df1d12ee21cf4b891c` has `node22 (ubuntu-latest)` and `node22 (windows-latest)` jobs, both **failed** at the behavioral step even though many later JSDoc, performance and Ubuntu Chromium steps succeeded.
- Main [focused run 45141870967](https://github.com/FlareZ123/obfs/actions/runs/45141870967) at `d1efacb1578b5443456a18b87839c2f3a024b24a` has two successful `focused` OS jobs while its `node22` job was **skipped**. Its green workflow status must not certify a full integration.

To prevent recurrence, I created a separate, non-source-changing research branch:
[agent26/full-gate-receipt-classifier-20261123](https://github.com/FlareZ123/obfs/tree/agent26/full-gate-receipt-classifier-20261123)
with pure CJS helper `sims/validation-receipt-classifier.js`, 10-case `test/validation-receipt-classifier.test.js`, and explicit `jsconfig.external.json` inclusion. It consumes GitHub Actions run/job JSON plus a caller-supplied immutable expected SHA. It differentiates `full-green`, `full-red`, `focused-green`, `focused-red`, incomplete matrix, and SHA mismatch. The complete-run positive check requires each actual Node22 OS job, behavioral suite, strict typechecks, sample benchmark and appropriate Ubuntu Chromium steps; it refuses skipped/missing evidence and source-pin mismatches.

**Exact source-pinned focused run [45144081365](https://github.com/FlareZ123/obfs/actions/runs/45144081365)** at `5b729cc113271f59e04e73793a8e642fd38a489b`: **success on Ubuntu and Windows**, 10/10 regression cases in each focused job and the project/external strict JSDoc gates. Earlier branch run `45143840830` revealed type errors after enrolling the new files in external JSDoc; `45143951663` narrowed them to one optional lookup; both were corrected before the green pin.

This utility is intentionally **not** a substitute for your canonical full-source release test. It checks reported step execution and source identity, not the actual transformation-yield contract, security against a hostile runtime, or the 2.5x workload budget. It also does not fetch moving `main` itself. For a *current-main* verdict the reviewer must supply/confirm the current main SHA and branch separately. No obfuscator `src/` or `bin/` files were changed. The branch is available for intake if useful; I did not open another competing integration PR.

**Requested disposition:** consider this as a small CI-evidence reviewer helper alongside the canonical acceptance report, or mark it redundant and leave it unmerged. The current release decision remains **RELEASE-BLOCKED**.


**09:14 UTC supplemental evidence:** After the initial green pin, I replaced two manually reconstructed test fixtures with a reduced capture of the actual GitHub Actions run/job JSON. Exact fixture: 'test/fixtures/validation-receipts-20261123.json' on the same research branch, containing recorded step names and conclusions for full red run 45136105520 and focused green run 45141870967. The refreshed 10-case tests plus strict external/project JSDoc passed both OSes at exact branch SHA 'd311da77ede4a96a82645889ff69ab580a8093c9', [run 45144872839](https://github.com/FlareZ123/obfs/actions/runs/45144872839). This is the strongest available receipt for the branch as of this update. The previous 45144081365 remains a historical earlier-green pin. The two intermediate fixture/typecheck attempts 45144571027 and its predecessor were red and corrected.


**09:20 UTC provenance amendment:** The classifier now rejects mixing jobs from different workflow runs, mismatched job source SHA and incomplete job status. The real Actions fixture preserves each job's immutable 'run_id', 'head_sha', and 'status', while three independent regression cases challenge accidental green splicing. **Exact branch head '5da32131599a85d74033ac3b4652b26ede0e351a' passed 13/13 focused cases and strict JSDoc on Ubuntu/Windows**, [run 45145845092](https://github.com/FlareZ123/obfs/actions/runs/45145845092). This supersedes the previous 10-case green pin as the evidence-classifier branch's current validated source. No production compiler files changed.


**09:24 UTC final classifier provenance extension:** Original real-run snapshots now include workflow ID/path/event, per-run retry number and each job's attempt number. Three more adversarial tests refuse copied step names from another workflow, a mismatched re-run attempt, and a different workflow event. **16/16 tests plus strict JSDoc green across Ubuntu and Windows at 'aeff784f1f847cb85c67a0f52e034d02cbc2ada6', [run 45146272822](https://github.com/FlareZ123/obfs/actions/runs/45146272822).** A single consolidated intermediate report with all source pins, scope and controls is now at 'im-results/full-vs-focused-ci-receipt-provenance-2026-11-23.md' on main. No production transform changed and no additional CI workflow or competing PR opened.
