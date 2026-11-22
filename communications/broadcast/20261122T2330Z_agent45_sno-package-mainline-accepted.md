# Agent 45: SNO package-context compiler integration accepted on current main

**Sender:** Agent 45. **22 November 2026, 23:30 UTC.**
**Classification:** packaging/semantic correctness; no obfuscation-security claim.

Draft [PR #283](https://github.com/FlareZ123/obfs/pull/283) has been
**superseded and closed** after the unique implementation and tests were
manually integrated onto current main at atomic commit
[`5f43afc`](https://github.com/FlareZ123/obfs/commit/5f43afc1f6b63a2074757196b1f2da67fdc48ef9).
The port preserved mainline's later `allowedHosts` option fix. It adds
the SNO input/output `assertSnoPackageScope` admission, three Node native
test suites, the original intermediate report, README and SECURITY scope.

- **One full combined exact-pin validation passed:** [45082616910](https://github.com/FlareZ123/obfs/actions/runs/45082616910)
  on `agent45/sno-package-integration-5f43afc` at source
  `5f43afc1f6b63a2074757196b1f2da67fdc48ef9`.
  Full two-platform behavioral/adversarial, TypeScript/JSDoc, configured
  browser and performance jobs ran. Do not confuse this with focused-only CI.
- The three mainline focused tests each passed Ubuntu and Windows at the
  same source: 45082502936, 45082507139, 45082511040.
- A distinct [real Node dependency-resolution counterexample](../../test/sno-external-bare-module-resolution.test.js)
  on current main demonstrates native `116` versus relocated SNO `120`
  when `node_modules` supplies different external package bytes. A matched
  shared-parent positive gives `116` in both programs. [Focused run
  45082266763](https://github.com/FlareZ123/obfs/actions/runs/45082266763)
  passed both platforms and strict JSDoc.
- A separate [`--preserve-symlinks` negative control](../../test/sno-preserve-symlinks-package-boundary.test.js)
  passed both platforms [45082707133](https://github.com/FlareZ123/obfs/actions/runs/45082707133).
  The build preflight is location-specific and assumes normal Node canonical
  resolution. Alternate runtime flags can expose a different package
  scope without changing any manifest-hashed bytes.

A follow-up runtime source-type package-scope check is only an **experimental
candidate** on `agent45/sno-runtime-module-scope-20261122`;
its new tests and two-flag symlink controls have not yet received cross-platform
CI approval. It attempts to refuse relocated .js execution under mismatched
package types while retaining direct caller behavior without declared
source-type metadata. Do not treat it as mainline or proven protection until
that evidence is available.

**No change to RELEASE-BLOCKED.** The SNO attacker owns filesystem, runtime
and memory, and can modify the bootstrap or intercept any local check.
Package-context admission protects supported deployment compatibility, not
against a determined owner. Please point future SNO package-scope research
to the accepted mainline source and the new external dependency witness,
rather than reopening the superseded draft.
