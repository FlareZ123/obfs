# SCO local-ambient spelling versus genuine shared state

**Agent 7, 2026-11-16. Intermediate source-admission experiment.** This study concerns transformation yield on safe local objects, not stronger attacker resistance.

## Baseline discrepancy

The selective SCO partitioner records ambient root names while walking function bodies, then conservatively refuses a split whenever both public and private code contain those names. An identifier spelled `globalThis` may instead resolve to an independent lexical `const` declared within the function. When both functions read their own inert record, a global-root match is a false positive.

A minimal case uses:
```js
export async function protectedOp() {
  const globalThis = {privateValue: 41};
  return globalThis.privateValue;
}
export function visible() {
  const globalThis = {publicValue: 7};
  return globalThis.publicValue;
}
```
These independent records contain only literal primitive fields. The private result is 41 and public result is 7 under native interpretation. Pre-fix selective partitioning throws `Private/public exports share ambient state roots`, even though no ambient global binding is accessed.

The test-only baseline [manual Node22 run 43946516998](https://github.com/FlareZ123/obfs/actions/runs/43946516998) at SHA `76fb3c5da397f7b72a604a0035c7459894f24dbd` reproduced this rejection independently on Ubuntu and Windows, with exactly one new failing positive-control test on each OS.

## Candidate bounded proof

The candidate `ownedLocalAmbientNames` proof recognizes direct enclosing function-block `const` declarations bound to a fully inert object literal, including nested literal-only records. It rejects expressions, getters, computed fields, spreads, methods and nonliteral values. The scan searches all descendants for nested lexical rebinding of the same name, including variable patterns, nested function/class names and parameters, and catch bindings. Ambiguous spellings are conservatively treated as potentially ambient.

The private-source and public-source ambient scans both use the same proof. The private source's global-object alias guard also reuses this proof instead of a broader name-only local check, avoiding divergent meaning for nested shadowed `globalThis` spellings. Negative controls verify that truly shared `globalThis.Math.PI` accesses still refuse, and a nested `globalThis=process` alias cannot borrow an outer inert declaration's safe classification.

The emitted JavaScript runtime for previously admitted inputs is unchanged; this is a compile-time eligibility distinction. It may increase acceptance on a limited proven lexical shape while preserving conservative refusal for unverified aliases. It is a source-level proof under the selected SCO JSON RPC contract and does not establish universal JavaScript observational equivalence.

## Evidence status and limitations

The pre-fix red control is confirmed on both operating systems. A revised shared ownership proof has passed full Linux/Windows and Ubuntu Chromium validation as documented below. The final exact-head validation must still be checked after this report update.

The proof intentionally excludes nested mutating expressions, nontrivial property initializers, unknown reflection and arbitrary shared host-object references. Existing cross-realm constraints and RPC serialization limitations still apply. Even a successful selected-source admission test is neither a security-hardness result nor evidence for a universal 2.5× workload budget.

## Independently pinned falsification and correction

The first candidate at `9f187566c72d6105b8167af99fe82ac672200a76`
passed Linux/Windows full suite [43947160951](https://github.com/FlareZ123/obfs/actions/runs/43947160951), proving its basic lexical-positive coverage. It still had a nested binding mismatch: an inner `const globalThis=process` could be confused with the enclosing `const globalThis={privateValue:41}`, so a private Node-global access escaped the intended source refusal. An added negative test exposed this on **both** OSes in red [43947770270](https://github.com/FlareZ123/obfs/actions/runs/43947770270) at source `efef2b6a65b4fb1c90b8ee65e0e7831b70f5a0b5`: one new negative failed with "Missing expected exception".

The follow-up source `b93636efe6d000918afba35f980ade605b9cde22` refactored both the private global-object alias check and public/private ambient root scans to call the same bounded `ownedLocalAmbientNames(body)` function. The plain-object value proof recursively permits only literal values and other inert literal-only records. Any nested variable binding, pattern binding, catch variable or nested function/class parameter of the same name invalidates the ownership shortcut. The resulting full two-platform [43948223589](https://github.com/FlareZ123/obfs/actions/runs/43948223589) was **GREEN**.

An independent end-to-end native-vs-generated case creates two actual ESM modules, starts a real authenticated-method SCO HTTP handler on localhost with a test-only unconditional allow policy, and compares 16 input values of the native and RPC-proxied private operation plus retained public function. It also checks private source identifiers remain absent from client code. The test passed Ubuntu and Windows at source `7eaf8fd707958b60697be230753c575bb5b82094`, in [full run 43949026817](https://github.com/FlareZ123/obfs/actions/runs/43949026817): Ubuntu **1,780 passed / one skip / zero failed** and Windows **1,779 passed / two skips / zero failed** from 1,781 tests. The individual HTTP test took about 140 ms Ubuntu / 182 ms Windows; those timings are test wall time rather than a baseline-to-obfuscated CPU runtime ratio.

Private/public local-helper controls and five additional common browser-root spellings were added to the corpus. The targeted SCO authorization workflow was also extended to run `sco-unknown-global-migration.test.js` and `sco-private-host-effect-closure.test.js` by default in manually dispatched checks. Its exact-head run [43949959896](https://github.com/FlareZ123/obfs/actions/runs/43949959896) succeeded at SHA `0cec26528ca94b9d98aeda9390a2ba3e74717809`.

The source proof deliberately spends compilation time for a narrower correctness guarantee. No additional client-side interpreter or per-call branch was emitted, but that does not make remote network calls meet 2.5× versus native for all workloads. The deliberately simple protected operation in the HTTP parity test should not be used as a production SCO granularity recommendation.

## Direct property ownership counterexamples and tightened scope

A further adversarial source class showed the first inert-const shortcut was insufficient even when nested bindings were absent. Given `const globalThis={privateValue:41}`, subsequent `globalThis.privateValue=process.version` reads the server's host environment, while a browser may lack `process`. Likewise `globalThis.toString()` can invoke an inherited realm-dependent method absent from the object's own literal fields. The baseline compiler accepted both cases, falsely using the inert initialization to suppress deeper cross-realm checks.

Two independent red full-suite runs reproduced the admission on **both** operating systems: [43950757985](https://github.com/FlareZ123/obfs/actions/runs/43950757985) at `c812450efa76c35d16bc7bc9367c37deb0d7f794` failed the new host-derived direct-property mutation refusal, and [43951114095](https://github.com/FlareZ123/obfs/actions/runs/43951114095) at `b03ecb8fa5de8be895d36ebedf396fa82f3d799d` failed both mutation and inherited-property refusal controls. All failures were missing expected compile-time exceptions.

The narrow follow-up `a369c0e3aab1bd5f1c581c70396b034c5b0dccc0` checks syntactically **direct root-member** reads against the initializer's own static field keys. Unknown members, computed unknown keys, direct property calls, updates, deletes and nonliteral direct assignments invalidate the local-ownership exemption, which in turn re-enables the existing conservative host-global guard. A positive control allows a simple primitive literal overwrite (`globalThis.privateValue=42`) to preserve useful safe coverage. See `test/sco-unknown-global-migration.test.js`.

**Proof limit:** This is a syntactic direct-field check. Nested property paths, aliases created through member extraction, and opaque mutations are not all covered; `globalThis.nested.field` and subsequent writes demand a separate complete provenance model to claim arbitrary host-independent behavior. Calling the heuristic a complete local-object ownership or all-access verifier would overstate its evidence. The wider SCO JSON value/exception and network timing contract remains unchanged. Exact final-head Linux/Windows validation is required after this report and comment-only change.
