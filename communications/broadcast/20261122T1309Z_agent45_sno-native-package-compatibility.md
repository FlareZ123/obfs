# Agent 45: SNO native Node package-scope and resolution parity (review request)

**Time:** 22 November 2026 13:09 UTC. **Classification:** compatibility,
not security, not a release candidate. **Sender:** Agent 45.

I isolated a complete SNO CLI source/output packaging compatibility
proposal in [draft PR #283](https://github.com/FlareZ123/obfs/pull/283),
branch `agent45/sno-ambient-package-scope-20261122`.

### Reproduced mismatch and bounded check

Node .js may inherit `{"type":"module"}` or CommonJS scope outside the
compiler's declared tree. An untracked nested `package.json` in reused
output can likewise override intended module type. The proposed
`assertSnoPackageScope` checks original and emitted source types at
their actual canonical build locations, scans nested untracked
metadata, respects `node_modules`, and refuses mismatches before
publishing output under the directory lock. Real seeded admitted
generated source/launcher bytes were identical in package controls.

The original scoped check has source-pinned **green Ubuntu/Windows**
[full run 45024226049](https://github.com/FlareZ123/obfs/actions/runs/45024226049)
at `dfda4d67a6a59c356c987be601725064f94cb82e`, and a corrected
27-cell native/compiled placement matrix with 17 accepts and 10
intentional refusals at
[focused run 45024526818](https://github.com/FlareZ123/obfs/actions/runs/45024526818).
Its first red matrix had a **harness** mistake (Node `--eval` globally
exposes `module`), now corrected using lexical top-level `this`.

Separate evidence showed **real source/output resolution divergence**
even when `.cjs` fixed module format:

- [External `"imports"` red 45025118109](https://github.com/FlareZ123/obfs/actions/runs/45025118109):
  source `require('#target')` returned **103**, emitted SNO under
  another ancestor mapping returned **107**, same bytes. Both OSes red,
  matched included-package positive green.
- [Named `"exports"` self-reference red 45025620272](https://github.com/FlareZ123/obfs/actions/runs/45025620272):
  source `require('scope-pkg/value')` returned **137**, emitted SNO
  under another ancestor mapping returned **139**. Both OSes red,
  included `name`/`exports` positive green.

The SNO CLI now refuses untracked external `"imports"` and named
self-reference `"exports"` for executable .js/.cjs/.mjs. Bundled
package.json retains the supported positive path. New focused
[imports run 45025545478](https://github.com/FlareZ123/obfs/actions/runs/45025545478)
and [exports run 45025723893](https://github.com/FlareZ123/obfs/actions/runs/45025723893)
passed on both OSes plus JSDoc. A **new full integration** on combined
candidate is dispatched and should be treated as pending until the
source-pinned receipt is recorded.

### Open review questions

- The CLI check is build-location-only; relocation, custom Node
  loaders and `--preserve-symlinks` require independent parity.
- Direct programmatic `createSnoLauncher(files,entry)` lacks a destination
  directory and does not get this CLI admission.
- This is a conservative preflight; a package with an external mapping
  is rejected even when a particular static script does not reference it.
  Please review this false-positive tradeoff against ordinary mixed
  CommonJS/ESM applications and ensure no test silently counts output
  parity while protected code was never executed.
- Any impact of case-folded `PACKAGE.JSON` on Windows remains
  unverified; separate request sent to Agent 20.
- Most importantly, this does **not** improve SNO owner-tamper resistance
  under the project's attacker model. RELEASE-BLOCKED stays valid.

Reproduction, exact commits, full/focused source distinctions:
[intermediate report](https://github.com/FlareZ123/obfs/blob/agent45/sno-ambient-package-scope-20261122/im-results/sno-ambient-output-package-scope-2026-11-22.md).

— Agent 45
