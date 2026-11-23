# Cross-file asynchronous reference and reflection parity extension

**23 November 2026. Intermediate compiler-correctness evidence.** Author: Agent 2. The source-pinned two-platform focused gate [45086313808](https://github.com/FlareZ123/obfs/actions/runs/45086313808) passed at exact executable source `44175379195dc2fc3e80865cd44a6f51a040535f` (Node 22.23.4, Ubuntu and Windows, strict project and external JSDoc). An earlier 260-graph suite without the explicit settled-result assertion passed at `22420614d8ff4a7c334d5de202aa397b366526df`, [45086197584](https://github.com/FlareZ123/obfs/actions/runs/45086197584).

## Scope and comparison

Existing `sims/interfile-api-fuzz.js` generated nine distinct cross-file ESM graph shapes per seed. Four added kinds exercise (9) `Promise.resolve(state).then(owner=>Object.keys(owner))`, (10) asynchronous forwarding of the same object into an external dynamic property reader, (11) passing the object through a box-returning function and examining `Reflect.ownKeys(boxed.held)`, and (12) extracting the shared owner through array destructuring and examining `Object.getOwnPropertyNames(alias)`.

Each of 20 deterministic seeds generates 13 graphs, for **260** source cases: **20** private-field positive rename expectations, **220** named negative no-rename cases, and **20** interprocedural identity-return parity-only cases. All ordinary nine-kind identifiers and seed mappings are preserved; the four new kinds use a disjoint integer index range.

The runner writes each graph to a real temporary ESM directory with `atomicWrite`, imports every entry with Node's actual loader, awaits the exported `value`, and compares the native and transformed outputs. Previously the runner serialized Promise objects directly as empty JSON objects. The revised harness validates **40** native settled-async results independently, requiring source-sensitive reflected key strings and finite numeric external-reader outputs. This rules out vacuous agreement caused by JSON serialization of unsettled Promises for the new cases.

The compiled outputs are required to demonstrate actual cross-file rewrite yield for the 20 positive cases. Negative cases must preserve unproved object property names. The result measures behavior and refusal correctness for these finite generated graphs, **not** general interprocedural alias soundness.

## Reproduction

From the repository root with Node 22 and installed locked dependencies:

```powershell
node --test test/interfile-api-fuzz.test.js
npm run typecheck
npm run typecheck:external
```

The same named test is dispatched in `.github/workflows/manual-validation.yml` using `focused_test=test/interfile-api-fuzz.test.js`. The two-platform green gate validates exactly the source noted above. Further source changes require new validation.

## Boundaries

This is regression coverage, not a security advance. It does not test browser module loading, arbitrary external module mutation, tamper-resistant execution, source confidentiality under hostile runtime control, or the complete 2.5× compute requirement. It does not change the `RELEASE-BLOCKED` primary decision. The positive rewrite check proves actual work in the selected fixed corpus, while its static key renamings remain publicly inspectable.


## Real Chromium extension and public-output source normalization

**Source pin:** 4dd002982f47999730b0130e3a09ad933c37eea9, tested in the **fully successful** [manual real-browser workflow 45086919438](https://github.com/FlareZ123/obfs/actions/runs/45086919438), including the newly added Chromium graph matrix, all preexisting browser validation steps, and project/external strict JSDoc. The same source passed [focused two-OS Node 22 and external strict JSDoc 45086980757](https://github.com/FlareZ123/obfs/actions/runs/45086980757). The report-only commit after that SHA does not change executable source.

The script test/interfile-async-browser.js serves ten separate source graphs using Node HTTP and the real Chromium ESM linker under a page CSP of: default-src 'none'; script-src 'self'; connect-src 'self'. Two fixed seeds each exercise the private owner positive read and the four new async, external, boxing and array reference adversarial cases. For each graph, Chromium loads three separate module distributions: original, compiler-emitted COO, and an attacker-normalized graph generated **only from public emitted bytes** by the independent sims/attacker-token-normalize.js tool.

The browser runner itself is a separate untransformed host module. It awaits each imported export value before serializing, comparing **30** actual execution outputs. It requires unchanged results in both emitted and normalized variants. The ten-graph corpus requires **four actual cross-file private-field renames** across two positive graphs; eight observer/reflection graphs refuse cross-file renaming. The public normalizer must recover at least the four generated key labels, and may independently normalize additional eligible local object fields. The two async reflection controls require returned original key strings, and external async-read controls require numeric returns. This prevents passing merely because Promises serialize to empty records.

In a real browser, window is a nonwritable self-alias. The deterministic Node api.mjs fixture assigns globalThis.window. For this browser experiment only, the test adapts that explicitly known host shim to assign globalThis.window.api after each variant is compiled; it uses the **same** adaptation for native, emitted and attacker-normalized distributions. This is a stated host-equivalence assumption, not a byte-for-byte claim about Node and Chromium host scripts.

**Boundaries:** The public normalization demonstrates attacker-controlled *renaming* of distributed synthetic hash labels without original private spellings. It is not full algorithm reconstruction or an absolute anti-obfuscation result. The browser sample validates bounded source/behavior compatibility, not a general 2.5× compute guarantee, source secrecy, environment-lock resilience or hostile instrumentation protection. The independent external minifier comparison required for security promotion was not performed. The primary strong-protection decision remains **RELEASE-BLOCKED**.
