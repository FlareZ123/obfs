# Rest and implicit arguments ambient provenance: source-pinned Node ESM counterexamples

**Date:** 2026-11-17. **Classification:** intermediate compiler correctness research; no proven attacker-cost, source secrecy, execution locking, or universal runtime-budget advance.

## Boundary

`src/cross-properties.js::safeClosedCallerRecordRead` tracks a subset of ambient effects from globals and top-level aliases into ordinary declared named parameters. A function using `...rest` or its implicit `arguments` object can retrieve ambient `globalThis.Reflect` via `items[0]` without a named formal receiving that capability. Changing `Reflect.ownKeys` then lets a host callback observe the rewritten property names of a different exported ESM state object. The previous direct-formal proof allowed a private exported `secretField` rewrite even though native and compiler-emitted output differed.

## Reproductions

The **test-only exact source** `52a31ee1b832f1f1041ffdeefc155aa0c357211d` in [run 44201749745](https://github.com/FlareZ123/obfs/actions/runs/44201749745) failed **4 of 28** `test/closed-record-host-formal-provenance.test.js` regressions on each of Ubuntu and Windows Node22. In each failure, independently launched native ESM returned `['secretField']` while emitted ESM returned a randomized `_p...` field. Cases covered direct rest and implicit `arguments`, `Function.prototype.call`, and a rest argument after a normal formal. The 24 other cases passed, including an unrelated benign rest helper that retained a genuinely renamed field.

The first candidate implementation `d1d4747e53062261e476f927ccabaee8842239c6` passed the full two-platform manual transformation semantics workflow [44201989804](https://github.com/FlareZ123/obfs/actions/runs/44201989804). That candidate recognizes local function `arguments` references, propagates them through callable aliases and `.bind`, and declines proven ambient identifiers entering unresolved rest/arguments vectors. However, it only checked an immediate Identifier argument.

New **test-only expanded exact source** `c6db6fd4ed0c85b529829b67fea404d5a12ce2b3` in [run 44202689110](https://github.com/FlareZ123/obfs/actions/runs/44202689110) exposed **three more real native/compiled mismatches**, because the global root reached a rest array through `(0,globalThis)`, `[globalThis][0]` or `({root:globalThis}).root`. An aliased container comparison passed even before this expansion, so it is a retained negative and not evidence of comprehensive vector analysis.

## Narrow candidate repair

The subsequent branch change `07514767ea83fd893e542def50cb89aae2a3b758` checks unresolved actual expression ASTs only after the existing host-container alias closure, declining if a known ambient root or host-capability container can be found recursively in any actual expression. It keeps the safe unrelated rest-helper as a positive owner-rename control. This is deliberate over-approximation for syntactically visible ambient flows, not a sound whole-JavaScript effect system; unknown factories, dynamic code and hostile realm mutation still invalidate broader assumptions.

**Pinned candidate green validation:** [full two-platform transformation semantics workflow 44202795133](https://github.com/FlareZ123/obfs/actions/runs/44202795133) completed **success on Ubuntu and Windows Node 22** at exact executable SHA `07514767ea83fd893e542def50cb89aae2a3b758`. Both jobs passed the expanded 32 real Node ESM differential and transformed-positive tests, followed by broad property and source-observer regression suites, two strict JSDoc configurations, sampled profiles, and Ubuntu real Chromium statement-flow integration. This is a scoped semantics gate; a current-main full 2,653+ test integration remains distinct.

## Reproduction and decision

`node --test test/closed-record-host-formal-provenance.test.js` runs the original-versus-generated real Node ESM differentials. `.github/workflows/manual-transform-safety.yml` exercises this file first on Ubuntu and Windows, then wider property proofs, explicit positive yield, strict JSDoc, source-observation controls and sampled profiles.

The tested failure is a **behavior preservation** defect. It is not a demonstrated source reconstruction challenge or cryptographic anti-tamper mechanism. Merge only after a red/green exact SHA check and preserving benign actual private-key rewrites; do not disable valid global source observer refusals solely to force transformations.
