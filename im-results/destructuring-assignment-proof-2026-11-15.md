# Standalone destructuring assignments: bounded private-key proof and adversarial control

Date: 2026-11-15. Sender: **Agent 16**. Status: intermediate implementation evidence, **not an established obfuscation-security result**.

## Change and claimed semantic boundary

The conservative owner proof in `src/properties.js` already renames literal object fields when all known reads, assignments and alias forwards can be rewritten consistently. It previously refused a standalone object-pattern assignment even when equivalent declarator destructuring was allowed:

```js
const owner = {privateMetric: 17};
let recipient;
({privateMetric: recipient} = owner);
console.log(recipient);
```

The new narrow branch in `proveLocalObject` admits this pattern only if the assignment's RHS is a proved owner alias and the assignment node is directly inside a discarded `ExpressionStatement`. Every left pattern element must be a static own-key `Property` assigning to a plain identifier. Existing `patternPropertyEdits` rewrites keys, including statically foldable computed strings and shorthand spelling, to the same new name as the owner initializer. This integrates with both local CommonJS/ESM proof and opt-in closed-world ESM whole-graph proof. No additional runtime decoder, function call or indirection is injected by this extension.

Rejection remains mandatory for arbitrary computed keys, nested/default/rest patterns, opaque escapes, and contexts in which the assignment expression's owner-valued result could be externally observed. More generally, the existing interprocedural proof refuses unknown aliases and reflective uses.

## Reproduction and measured scope

Code: [src/properties.js](../src/properties.js).

Unit and differential cases: [test/destructuring-assignment-flow.test.js](../test/destructuring-assignment-flow.test.js), [test/destructuring-assignment-grid.test.js](../test/destructuring-assignment-grid.test.js).

Manual Linux and Windows workflow: [manual-transform-safety.yml](../.github/workflows/manual-transform-safety.yml), pinned **SHA `f1948d5179bda13f0f9dfb125ed27a82178aa89a`**, [run 43711790080](https://github.com/FlareZ123/obfs/actions/runs/43711790080), **success on both OS including JSDoc typechecking**. This exact source also includes the independent static label normalization regression.

The fixed deterministic grid generates 32 seeds for each of eight positive ownership forms and eight negative ownership/exposure forms. All 512 distinct source fixtures were executed natively and after obfuscation with `strings:false` and `identifiers:false`, isolating the private-property transformation, in both COO and SNO modes using a CommonJS source type.

| Observation | COO | SNO | Total |
|---|---:|---:|---:|
| Generated positive transformed fixtures | 256 | 256 | 512 |
| Candidate own-field occurrences in positive transformed fixtures | 512 | 512 | 1,024 |
| Renamed positive keys | 512 | 512 | 1,024 |
| Generated negative transformed fixtures | 256 | 256 | 512 |
| Correctly declined negative owner rewrites | 256 | 256 | 512 |
| Matched native rendered outputs across grid | 512 | 512 | 1,024 |

The positive forms cover plain assignments, computed concatenated field keys, let/const alias chains, calls into direct reader functions, identity-return forwarding, literal-array property values, and two-field object destructuring. The negative forms cover owner-result escapes, a nested logical-result flow, destructuring defaults/rest/nested patterns, dynamic key calculation, JSON serialization, and assignment into an existing owner alias. The source sets intentionally use literal-only initialization and disallow dynamic scope; the score is a fixture-specific tested coverage count.

A separate two-file ESM differential writes native and transformed files to isolated temporary directories and executes the real Node ESM loader. Both return `17,5` with the assignment key and second direct own-key read rewritten. A negative two-file graph with `Object.keys` on the assignment-result alias refuses cross-file renaming.

## Security counterexample and remaining cost questions

The ESM differential additionally passes the **emitted artifact only**, without original source, to the independent Acorn-token normalizer at `sims/attacker-token-normalize.js`. It recognizes and replaces both generated deterministic property labels. The rewritten output still produces `17,5`. This is a bounded source-only **attack success against the new label-renaming surface**, and demonstrates that increasing proof coverage alone does not establish source reconstruction resistance. The attacker does not recover the original field spellings or reconstruct arbitrary code.

The extension inserts no runtime operations, but a controlled hot/cold benchmark of the full transformed application under the 2.5× threshold remains unmeasured. The CI result is a selected semantic regression gate on the exact SHA; it does not certify all future HEAD changes, all JS language semantics, source confidentiality or all attacker objectives.

## Next questions

1. Probe interprocedural assignment targets and code using reflective callbacks, getters and external APIs in independent held-out ESM graphs; maintain negative controls to detect proof unsoundness.
2. Benchmark owner-field hot loop and fresh process import under native and transformed bundles. Report protected-work ratio and separate setup time.
3. Compare a genuinely harder-to-neutralize architecture against the existing independent static/dynamic attackers. Keep the pinned source-only normalization case as an adversarial baseline.

## Follow-on: defaults, cross-file ESM and full-suite validation

The proof now admits an `AssignmentPattern` whose target is a plain identifier in both declarator and standalone object patterns. The property is a statically known own field and the same owner-usage analysis rejects unproved reflective effects in default expressions. Nested binding targets, rest keys, member assignment targets, and opaque dynamic computed keys remain excluded. Tests prove native equivalence for a default fallback that is never needed, shorthand declarator binding and two-file ESM output `17,0,5` with zero fallback invocations.

The deterministic local grid expanded from eight to **nine positive shapes per 32 seeds** while retaining eight refusal shapes. The revised generated denominator is **288 distinct positive fixtures x 2 modes = 576 transformed positive executions**, each with two renamed fields, so **1,152 renamed field occurrences**; and **256 distinct negative fixtures x 2 modes = 512 refused transformations**. All **1,088 native-versus-transformed checks** passed in the full test suite. The original 1,024-comparison snapshot above remains a valid pinned earlier experiment and is not to be confused with the expanded corpus.

The exact subsequent full validation at commit **`36cd02498342092d427a6b2206b657bb320d50f6`** passed Linux and Windows `npm test`, compiler and research JSDoc checks, the repository benchmark, and the real Chromium browser integration on Linux: [GitHub Actions 43714025306](https://github.com/FlareZ123/obfs/actions/runs/43714025306). This validated source includes the expanded default-binding tests, cross-file ESM native-loader differential and the source-only normalization control. The specialized [assignment performance report](destructuring-assignment-performance-2026-11-15.md) records the separate hot and cold 2.5× workload budget check and transparent attack success.

Earlier full-suite and focused run failures after allowing defaults were stale assertions expecting all defaults to refuse; these were updated to check established simple own-field defaults and retain refusal cases in `test/obfuscator.test.js` and `test/constant-computed-destructuring.test.js`. Preserve the failure history to avoid silently presenting the changed proof as having always been green.

## Final cross-mode source-visibility boundary and combined release snapshot

A classic browser script may expose a top-level `const` object through the ambient lexical environment, accessible from another script in the same global context. The private-property transformation therefore remains **disabled** for `sourceType:'script'`, even if the source contains a syntactically proved owner literal and otherwise eligible destructuring assignment. Added `test/destructuring-assignment-flow.test.js` regression asserts this refusal for **COO, SNO and SCO**, then executes the transformed script and an independent second VM script which reads the original `state.privateField` binding. The unchanged value is 17. This is distinct from local CommonJS and explicitly closed-world ESM flows, where the private fields can be renamed under the established ownership proof.

An unrelated concurrent stack-source observation change temporarily crashed on ordinary calls with fewer than two arguments: `src/ast.js` called `staticString(node.arguments[1])` unconditionally in a Reflect/Object stack check. Exact red focused [43715598314](https://github.com/FlareZ123/obfs/actions/runs/43715598314) preserved this failure. The minimal arity check `node.arguments.length>1` at `09e00e51894b76090304f26098c7b9d4b6b50c23` prevents this crash while retaining the two-argument reflection check; the owner Agent50 was notified for independent examination.

A coherent combined snapshot at **`9ce3535250a320228b62a1784cfb7e9f943166e0`** subsequently passed:
- [Focused semantic Linux+Windows run 43715779297](https://github.com/FlareZ123/obfs/actions/runs/43715779297), including classic-script boundary and default patterns.
- [Full Linux+Windows run 43715860418](https://github.com/FlareZ123/obfs/actions/runs/43715860418), including tests, both strict JSDoc checks, benchmark and Linux Chromium.
- [SCO authorization Linux+Windows run 43715971297](https://github.com/FlareZ123/obfs/actions/runs/43715971297), including private-initialization and real authenticated RPC tests.

All claims remain scoped to the exact tested SHA. Later head commits may change behavior. None demonstrates resistance to the independent source-only property-label normalizer or establishes a general upper bound on runtime overhead.

## 18:35 UTC integration correction: source-spelled call-target proof and safe fixture split (Agent 22)

Several later combined-main test snapshots unexpectedly reported 0 renamed fields where two closed-world ESM assignment fixtures asserted two; the real Chromium default-assignment fixture also reported `0 !== 2`. The compiler's conservative refusal is **semantically justified** for these *exact fixture forms*: `shared.otherField` and `state.cacheWeight` appear inside array literals that are immediately followed by `.join(",")`. The owner proof follows `MemberExpression(owner.field) -> ArrayExpression -> MemberExpression(array.join) -> CallExpression` and declines when a property use is nested within the source-spelled callee of a potential TypeError.

This is observable in native Node V8. With `Array.prototype.join=null`, evaluating `[captured,shared.otherField].join(",")` throws an error whose message includes the actual source spelling `[captured,shared.otherField].join is not a function`. Replacing the private field with a hashed key in that nested receiver changes the exact error message. The attacker model permits full runtime instrumentation, so assuming the builtin is unmodified would make the transformation's 1:1 semantics claim too strong.

At commit [404c91a](https://github.com/FlareZ123/obfs/commit/404c91aae71646e8c5d8a5f93da5107313db9576), the two positive ESM fixtures in `test/destructuring-assignment-flow.test.js` were changed to materialize the owner-bearing array in a standalone `const displayed=[captured,shared.otherField]` statement, then call `displayed.join(",")`. The owner key can now be renamed without changing the source string printed by a failed join, and both positive assertions still require two renamed keys and the original executed output. A new **negative** fixture retains the original direct callee shape and asserts that the compiler declines the renaming. The real-browser `test/browser-integration.js` default-assignment fixture applies the same safe array materialization while still exercising the page-owned DOM assignment.

The isolated combined SHA `7a11ad37bc842f097b62a13c7eda7c099a785775` passed [Linux and Windows transformation semantics run 43747034196](https://github.com/FlareZ123/obfs/actions/runs/43747034196) and [Ubuntu real-browser run 43747038186](https://github.com/FlareZ123/obfs/actions/runs/43747038186). A separate pinned branch `research/agent22-typeerror-source-proof-20261115` preserves this exact SHA. Its [full Linux/Windows/Chromium run 43747225576](https://github.com/FlareZ123/obfs/actions/runs/43747225576) still failed with **5 / 1,039 Node tests Linux and 6 / 1,039 Windows**, while the Ubuntu real-Chromium integration step passed. Those remaining unrelated full-suite failures require their own precise evidence and must not be hidden by this fixture repair.

This correction changes positive test scaffolding and adds a negative witness. The compiler's conservative ownership proof was unchanged, and no claim is made that the overall release is green or that property renaming resists source-only normalizers.
