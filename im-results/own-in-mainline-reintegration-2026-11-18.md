# Reintegration of proven private own-key membership on current compiler

**Agent 1, 18 November 2026 UTC. Intermediate compiler semantics and
coverage evidence, not an obfuscation secrecy claim.**

## Integration target and provenance

The prior proof and original red/green evidence are on [draft PR #59](https://github.com/FlareZ123/obfs/pull/59), while an independent
16-case adversarial challenge was added on [review PR #71](https://github.com/FlareZ123/obfs/pull/71). Both were produced on an older
compiler snapshot and could not merge cleanly onto moving `main`. This
reintegrated branch was created from the then-current mainline on
18 November 2026, then applied only the proof and editing changes to
`src/properties.js`, `src/cross-properties.js`, and
`src/symbol-properties.js`. It copies the original differential tests,
Chromium integration, hot-path profile and source-only reconstruction attacker,
plus the separate Agent 2 adversarial suite.

## Claim and conservative admission

The emitted property name and the literal left operand of
`"secret" in owner` are changed together only if the compiler proves that
`secret` was an initial own key of a private ordinary object, and every
relevant receiver use has a consistent rewrite. The existing ownership
proof refuses unproved aliases/escapes, reflection, mutation that would
expose a prototype key, arbitrary left-hand expressions, unknown or inherited
keys, hostile-shaped external callees, and source observation. The in-operator
is preserved at its original location, retaining JavaScript operand order,
TDZ behavior, and native boolean computation. The experimental Symbol-key
backend instead substitutes the exact private Symbol identity on both
the field and membership expression.

This is a bounded syntactic ownership proof. The compiler may decline
otherwise-safe programs. It makes no general guarantee against dynamic
code generation, attacker-modified runtimes, or arbitrary reflection.

## Independent verification on a newer compiler snapshot

The [manually dispatched two-platform gate 44209883613](https://github.com/FlareZ123/obfs/actions/runs/44209883613)
**passed** at exact executable SHA
`feb430d24c478f4a79e25d101e8db12e3fdf0b5c`:

- Ubuntu Node.js 22: own-key differential tests and Agent 2's independent
  adversarial suite, existing Symbol baseline, hot-loop profile,
  published-source-only recovery check, native Chromium ESM integration,
  strict primary and external JSDoc all passed.
- Windows Node.js 22: the same Node behavior, attacker, profile and
  strict JSDoc checks passed; Chromium steps were OS-gated to Ubuntu.

This demonstrates finite tested semantics for the reintegrated implementation.
The source-only attack explicitly reconstructs the renamed key and reproduces
the selected outputs. The prior branch's measured hot-loop
~0.990–1.030× ratios do not transfer as a new pinned numeric claim to this
source without fresh raw timing review; the current gate merely asserts its
profile's declared bounded behavior. Neither result establishes universal
2.5× compliance, hostile-runtime resistance or secrecy.

## Release decision and next checks

Retain this work in the semantics/reliability lane. Before claiming mainline
integration, reconcile competing source changes once, run a single complete
immutable-head cross-platform and real-browser suite, and confirm that
unrelated positive private-property rewrite controls still actually transform.
Do not conflate this tested coverage increase with the existing cross-mode
`RELEASE-BLOCKED` security verdict.

## Complete mainline-origin regression gate (00:45 UTC follow-up)

The first **complete** manually dispatched `manual-validation.yml`
[run 44210184426](https://github.com/FlareZ123/obfs/actions/runs/44210184426)
**passed both Windows and Ubuntu Node.js 22 jobs** at exact branch source
`1c9e389aad48373b6ca8ed46601b282a7caa7655`. This differs from
`feb430d24` only by this report's introduction. Both full-suite jobs
passed the JSDoc checks, sampled baseline benchmark, and their Node
behavioral suites. The Ubuntu job also passed the real Chromium main
module/host-lock, null-prototype private-key positive, and
cross-module owned-field observer checks. Windows Chromium steps were
intentionally skipped by the workflow. The separate focused own-key
Chromium test had already passed at the compiler-identical prior pin.

This is **source-pinned finite integration evidence on a branch created from
18 November mainline**, not a claim that moving `main` contains the
unmerged feature. The security release verdict and historical strict
>2.5x candidate samples remain unchanged. Independent review and
conflict-safe reconciliation with moving main are still appropriate.

## 18 November 10:16 UTC fresh current-main replay

The earlier PR #82 became unmergeable after new source changes accumulated. The new [PR #106](https://github.com/FlareZ123/obfs/pull/106) reproduces the exact earlier proved semantic edits on a new main-based branch. All twelve source patch contexts matched exactly once against the original current source. Independent Agent2 adversarial examples, multi-file cases, Chromium positive, Symbol backend, the seedless published-only reconstruction attack, strict JSDoc, and the local performance profile remain unchanged.

The first [full cross-platform run 44281611022](https://github.com/FlareZ123/obfs/actions/runs/44281611022) at `c8604073043d55f952c4347d28811222644923af` was **red for unrelated SCO graph source-authorization test cases** newly introduced on moving main: `test/sco-graph-private-path-policy.test.js` at 135 and 174. The older branch predated the accompanying `src/sco-graph.js` fix; the new membership suite, typechecking, benchmark, and real Ubuntu Chromium all passed. This is not a green complete source pin.

I rebased all eleven branch-changed file blobs onto exact current main `467b31933140279291aa1b6fa8e42ebfd2ea5c3e`, preserving its newer SCO graph fix with zero overlapping file paths. The current executable branch pin is **`796153d5d16ea794f4b77ae0761147ffd2b8add2`**. At this exact pin, the manual [focused run 44282602171](https://github.com/FlareZ123/obfs/actions/runs/44282602171) passed both Ubuntu and Windows Node 22, strict main/external JSDoc, and real Ubuntu Chromium. The complete [run 44282595470](https://github.com/FlareZ123/obfs/actions/runs/44282595470) passed the Ubuntu job including all full-suite behavioral, benchmark, JSDoc and three real-Chromium paths; the final Windows verdict must be checked before claiming complete success.

This remains a semantics and transform-coverage contribution with demonstrable source-only reconstruction of the transformed property. Its inclusion in mainline does not change the existing security/performance RELEASE-BLOCKED verdict.
