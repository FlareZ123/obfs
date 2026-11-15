# Semantic-preservation hardening: Node/browser obfuscator, 15 November 2026

**Status: intermediate, reproducible engineering evidence.** These checks establish narrow compatibility properties of the current implementation under specific tests. They do not establish general JavaScript semantic equivalence, algorithmic obfuscation strength, or the full 2.5x workload bound.

## Reproducibility

At the repository root, run `npm install`, `npm test`, `npm run typecheck`, and `npm run benchmark`. The manually dispatched GitHub Actions workflow runs Node 22 validation on both Ubuntu and Windows. **Green reference:** [run 43679554747](https://github.com/FlareZ123/obfs/actions/runs/43679554747) at commit `40240cf630d26db95be8d1bfda823123c862b537`.

### Concrete failure mechanisms and mitigations

| Failure mechanism | Observable original behavior | Unsound transformation | Current conservative response | Reproduction |
| --- | --- | --- | --- | --- |
| Static ESM import cycle calls a hoisted export before its module body evaluates | Imported function returns a constant string | Decoder array has not initialized; `ReferenceError` | Leave literals inside function declarations unchanged when the defining module has eager dependencies | `test/semantic-boundaries.test.js` |
| Quoted ESM import/export specifier | A string-literal grammar token names an export | Replacing it with `decoder[index]` gives syntax error | Do not encode `ImportSpecifier` or `ExportSpecifier` names | `test/quoted-module-names.test.js` |
| Inherited accessor on an unowned key inspects `Object.keys(this)` | Getter reports original own-property spelling | Local key rename is observable even though root reference never escapes | Reject candidate when any alias member/destructuring key is not an own key | `test/property-reflection.test.js`, `test/property-inherited-patterns.test.js`, `test/cross-reflection.test.js` |
| Delete of a tracked own key reveals inherited same-name field | Post-deletion read obtains prototype field | Renamed key deletion exposes wrong inherited field | Decline candidate for direct and optional-chain `delete` | `test/property-reflection.test.js`, `test/cross-reflection.test.js` |
| Anonymous arrow/function/generator/class obtains its lexical binding name | `Function.prototype.name` is the original identifier | Renaming binding changes externally visible name | Preserve binding when initialized or assigned an anonymous function/class | `test/inferred-function-name.test.js`, `test/default-parameter-name.test.js` |
| Default parameter executes a named-evaluation expression | Parameter's identifier gives anonymous default function/class its name | Parameter renaming changes name | Preserve anonymous-inferred names; allow renaming primitive or explicitly named defaults | `test/default-parameter-name.test.js` |
| TDZ error message quotes binding spelling | Catch reads `ReferenceError.message` for early or self-referential access | Renaming uninitialized binding changes message | Reject early lexical references and references inside the binding initializer | `test/tdz-identifier-names.test.js` |
| A local `String` declaration shadows decoder's global intrinsic | Original string literal evaluates independently | Runtime decoder invokes wrong `String.fromCharCode` | Skip runtime string encoding when local AST binds `String`; cross-classic-script global scope remains an open risk | `test/string-shadowing.test.js` |

## Additional capabilities and bounded assumptions

- `properties:false` now suppresses both local and cross-file property transforms even with `closedWorld:true`; `test/semantic-boundaries.test.js`.
- COO and SCO CLI users may pass `--js-module` to explicitly interpret ordinary `.js` paths as ES modules; SNO rejects the option. The default remains conservative. Real Node ESM execution and live SCO HTTP parsing are covered by `test/js-module-cli.test.js`.
- In a declared closed-world graph, known inert CSS, raster-image, and font assets no longer by themselves suppress cross-file ESM property renaming. This requires a **deployment guarantee** that those assets are served with non-executable MIME types and are never interpreted as JavaScript. HTML, SVG, and unknown assets still suppress the pass. `test/inert-assets.test.js` exercises positive and negative cases.
- `test/property-fuzz-main.test.js` performs a deterministic 260-case differential property-flow corpus, including aliases, helper calls, inherited getters, deletion, and computed access. This corpus complements the separate fuzz infrastructure under `sims/`.
- `sims/offline-normalize.js` recognizes both local 10-digit and cross-file 12-digit property hashes. This is an *attacker* normalizer, demonstrating that renaming can be erased offline and supporting the conservative security claims in `docs/SECURITY.md`.

## Open questions

1. Arbitrary JavaScript source reflection (`Function.prototype.toString`, proxies, modified builtins, native error text, cross-script globals) remains outside complete equivalence guarantees.
2. Aliased or absolute ESM URLs, dynamic imports, and incomplete module graphs require more comprehensive resolution and provenance proofs. Other agents are actively testing file URL bypasses.
3. SCO/COO attacker-controlled clients can intercept and reconstruct delivered source. SCO server-resident RPC can maintain a separate trust boundary for code never sent to clients.
4. Median benchmark compliance is evidence for sampled workloads; adversarial cold starts, long literals, and uncommon control flow can exceed the 2.5x cap. COO/SCO disable eager string decoding by default as a mitigation.
5. The current cross-file property proof is deliberately limited. Cross-file interprocedural points-to analysis of general object graphs is not implemented.

Evidence is traceable to the named test files, source modules in `src/`, and CI run linked above. Changes should remain under `im-results/` until stronger independent validation justifies promotion.
