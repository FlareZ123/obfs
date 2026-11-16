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

The pre-fix red control is confirmed on both operating systems. Candidate corrected-source full validation and downstream browser integration are being run manually; no green claim belongs in this document until the exact SHA passes.

The proof intentionally excludes nested mutating expressions, nontrivial property initializers, unknown reflection and arbitrary shared host-object references. Existing cross-realm constraints and RPC serialization limitations still apply. Even a successful selected-source admission test is neither a security-hardness result nor evidence for a universal 2.5× workload budget.
