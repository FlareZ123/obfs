# Repeated owner-valued tuple positions: bounded private-alias propagation

**Agent 6, 28 November 2026.** Experimental follow-up branch `agent6/multi-slot-private-tuple-proof-20261128`, stacked on the direct private-record ownership extension **draft [PR #410](https://github.com/FlareZ123/obfs/pull/410)**. This is source-level, semantics-preserving compiler coverage work, not a claim of increased resistance to a static normalizer, a hostile runtime, or a universal 2.5× bound. The overall release remains **RELEASE-BLOCKED**.

## Closed-owner tuple extension

The historical `src/properties.js` private owner tuple proof admits `const t=[null,owner,17]; const a=t[1]` but refuses `const t=[owner,owner]; const a=t[0]; const b=t[1]`, even if both indices return the same one closed private object, are read only into private immutable aliases and the tuple remains otherwise unobserved. This is a conservative **yield limitation**, not a known source-native semantic violation. The candidate tracks `Map<string,Set<number>>` rather than `Map<string,{index:number}>` for one carrier. It gathers all **direct Identifier references to the exact same unique owner binding** in an array literal of 1–8 elements, with all other elements still required to be inert literal primitives (no holes, getters, spreads, objects or calls). Every holder use must remain a **computed numeric literal index read** from one of those positions into an immutable, uniquely bound local alias. A string-valued `"0"` bracket read, computed dynamic identifier, mutation, element deletion, reflection, spread, exports or unknown holder use still declines the entire proof. After the complete holder-use validation, **each** admitted owner AST initializer may safely be excluded from the escape scan; aliases then join the existing fixed-point owner reachability proof.

### Important source-observer boundary found in test design

An early 128-seed fuzz fixture placed property reads **directly inside** a `module.exports=function run(...)` exported function. [initial CI 46152115908](https://github.com/FlareZ123/obfs/actions/runs/46152115908) failed its positive yield at **seed 0** on both OSes with `metrics.properties=0`, while the separate private-function positive, native ESM, tuple shared-reference numeric-write, negative escape/reflection, offline normalizer and historical tuple/record suites all passed. This was **not a runtime mismatch** or discovered compiler bug. The existing proof correctly treats a host-exported function body as a source observer and cannot assume its private member spelling may change without host-side `Function#toString` exposure. The fuzz grammar was repaired to place those reads in a distinct, unexported `privateRun` helper and expose only `function run(n){return privateRun(n)}`. That distinction is part of the trusted source proof; do not remove the privacy gate merely to make an invalid positive test green.

## Executable research artifacts

- `test/agent6-multi-slot-private-tuple-proof.test.js`: COO/SCO/SNO flags, 3 owner slots with inert primitive siblings, shared-reference numeric writes, fail-closed dynamic/static/reflective holder accesses, invalid literal/oversize refusal, closed-world two-module native ESM, 128 deterministic varied tuple layouts and seedless static name normalizer.
- `test/private-tuple-proof.test.js`: historical fixed-owner slot tests retained, obsolete `[owner,owner]` refusal removed because the new restricted grammar proves the exact case.
- `test/agent6-multi-slot-tuple-browser.js`: real Chromium native, esbuild-minified, compiled two-module ESM graph with 3 repeated owner tuple indices; 30k heldout inputs and 7 alternating 400k-call native/minified/compiled workload medians, asserting <=2.5× **only for this selected workload**.
- Candidate compiler `src/properties.js`, four localized proof changes to tuple key recognition and list of AST owner initializers, preserving the record extension inherited from PR #410.

Test-only **red-first** branch `agent6/multi-slot-private-tuple-redfirst-20261128` inherits the exact PR #410 compiler source before this tuple generalization, plus the tuple tests (no new tuple production behavior). Early [run 46152209493](https://github.com/FlareZ123/obfs/actions/runs/46152209493) failed the targeted new tuple positives (expected); corrected fuzz grammar is pinned to `08966c739fae305f183438f1b037b77c268f4250` on red-first. Green candidate corrected source `3e770a4fc52140f9e2f42b222cab2c6b3ad9e17a`; manually dispatched Node/real-Chromium checks were queued when this report was written and must be verified by exact SHA before review.

The manual branch-only workflow is the already-registered `.github/workflows/manual-imported-identity-alias.yml` with temporary targeted tests plus original unrelated baseline browser-yield tests disabled, as explained in PR #410. These temporary skips **must be reverted byte-for-byte to default-main** before opening a tuple PR or merging. Passing selected tests never means unrelated baseline browser failures are repaired. The pure numeric protected-work median is not a general SCO online/hostile SNO/COO attack-budget bound.

Reproduction after `npm ci --ignore-scripts --no-audit --no-fund`:

```sh
node --test test/agent6-multi-slot-private-tuple-proof.test.js test/private-tuple-proof.test.js
npm run typecheck
npm run typecheck:external
CHROMIUM_BIN=/usr/bin/google-chrome node test/agent6-multi-slot-tuple-browser.js
```

Static `sims/offline-normalize` is expected to reconstruct every emitted hashed owner-property name; this is explicitly tested, so the claimed material improvement is **safe transform coverage of shared references**, not hiding those references against a source-only adversary.
