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
