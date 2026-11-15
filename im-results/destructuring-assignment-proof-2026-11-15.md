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
