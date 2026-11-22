# Classic-script global callable source: externally observable encoding counterexample (22 November 2026)

**Classification:** intermediate semantic-compatibility counterexample, not a strong-obfuscation result.

**Observer contract:** A classic browser script's global `function publicReader() {}` creates a property reachable as `globalThis.publicReader`. A separate script or a host context may call `Function.prototype.toString.call(globalThis.publicReader)` without an explicit lexical reference in the compiled script. This observable JavaScript source spelling is part of our paired behavior test. Same-realm return values alone are insufficient.

## Reproduction and exact source pin

- **Test-only branch:** [`agent4/review-classic-source-witness-20261122`](https://github.com/FlareZ123/obfs/tree/agent4/review-classic-source-witness-20261122)
- **Final corrected test commit:** `189658a06a2d37bec88d2de25a1856ca9aff7fe7`, based on Agent 3 canonical source-observer integration `b826c10e3c59c2210c00448a0645bb8751a87758` (PR #299). One test source: [`test/classic-script-global-callable-source.test.js`](https://github.com/FlareZ123/obfs/blob/189658a06a2d37bec88d2de25a1856ca9aff7fe7/test/classic-script-global-callable-source.test.js).
- **Manual focused Ubuntu and Windows Node 22 run:** [45079199460](https://github.com/FlareZ123/obfs/actions/runs/45079199460), exact above head, **FAILED both platforms at the intended native/emitted source equality assertion**. The preceding anti-vacuity assertions passed on both.
- Reproduction: use `obfuscateFiles([{path:'entry.js',sourceType:'script',code:source}], {mode:'coo',seed:'classic-public-source-review',strings:true,identifiers:false,properties:false,preservePublicCallableSource:true})`, then evaluate original and output in distinct `node:vm` script globals and compare observed function source and values.

The original script declares:

```js
function publicReader(){return "public-script-source-string-0123456789-abcdefghijklmnopqrstuvwxyz";}
globalThis.privateValue="private-script-value-0123456789-abcdefghijklmnopqrstuvwxyz";
```

The expected `publicReader.toString()` contains the original string literal. The transformed observable source was:

```js
function publicReader(){return _o866eb53635ba[0];}
```

Both invocations return the same original public value; `privateValue` remains equal. The test independently requires **at least one** encoded literal and that the original independent top-level private literal no longer appears verbatim in emitted code. These checks executed successfully before source parity failed, preventing an all-refused, zero-transformation interpretation. This is a source-only semantic mismatch, not a runtime value mismatch.

## Proof-gap hypothesis and owner handoff

Agent 3's canonical candidate uses `src/properties.js::collectPrivateDirectCallables`, which proves a callable private when its binding is only locally direct-called. The collector receives AST and binding counts, without `sourceType`, so a script-top-level function declaration having no local references is provisionally treated as private despite its automatic global binding. `src/strings.js::encodeStrings` then excludes only source-exposed bodies, and currently encodes the public function's literal. The precise mismatch is observed, while this specific proposed causal path remains a source-level review inference.

Potential conservative resolution: recognize script-global callable declarations as source-exposed for the opted-in public-source contract and still encode a separate top-level private literal. Explicitly account for classic-script lexical scope, including block/function declarations and Annex B host behavior as appropriate. Preserve the nonzero private transformation in a revised two-platform witness. Other transforms that change public callable source require the same test.

Per the [Critic integration directive](../communications/broadcast/20261122T1939Z_critic_integration-debt-stopline.md), **Agent 3 is the canonical integration owner**. This branch is test-only evidence and deliberately does not propose a competing multi-file repair. Do not merge the canonical candidate based solely on an isolated green source test until the full native/Chromium/strict-JSDoc/performance gate and positive transform coverage pass together.

## Negative fixture chronology

The initial red [45078909541](https://github.com/FlareZ123/obfs/actions/runs/45078909541) already showed the native/emitted callable source mismatch, but the then-separate private literal was inside an IIFE and no independent encoding was assured. Test revisions [45078996159](https://github.com/FlareZ123/obfs/actions/runs/45078996159) and [45079103546](https://github.com/FlareZ123/obfs/actions/runs/45079103546) accidentally introduced literal `\\n` tokens into test source in a generated edit, resulting in test-file syntax failures. **These two runs are invalid for semantic inference.** The final `189658a` test corrected both the syntax and anti-vacuity witness.

## Security and cost scope

This is a bounded Node 22 classic-script VM source-observation test on both operating systems, not a real Chromium test. It does not establish general source preservation, improve hostile-client extraction resistance, demonstrate environment-lock strength, measure full-session compute, or change the **RELEASE-BLOCKED** decision.


## Cross-script global lexical extension, independently reproduced

The implementation defect is broader than `globalThis`-property creation. An unreferenced top-level classic-script `const lexicalReader=()=>"public-script-source-string-...";` creates a binding in the **shared global declarative environment**, accessible by identifier in a subsequent classic script in the same realm. It is deliberately **absent** from `globalThis.lexicalReader` (the witness verifies `typeof globalThis.lexicalReader==='undefined'`). See the normative [ECMAScript 2026 Global Environment Record](https://tc39.es/ecma262/2026/multipage/executable-code-and-execution-contexts.html) and [GlobalDeclarationInstantiation](https://tc39.es/ecma262/2026/multipage/ecmascript-language-scripts-and-modules.html); [MDN's global-object documentation](https://developer.mozilla.org/en-US/docs/Glossary/Global_object) explains the distinction between global script `var/function` properties and `let/const` lexical bindings.

A second test was appended at source commit `ad458b66ee716805f88c5c2ed732ff90c5c0ab36`. Both original and emitted scripts execute in their own `node:vm` realm, then a *separate later script* evaluates `[lexicalReader.toString(),lexicalReader(),globalThis.privateValue,typeof globalThis.lexicalReader]`. The test verifies a genuinely transformed independent global private literal before comparing. Source-pinned focused [run 45079724413](https://github.com/FlareZ123/obfs/actions/runs/45079724413) was **RED for both distinct semantic cases on Ubuntu and Windows** (two intended assertions failed per OS):

- Original later-script lexical source: `()=>"public-script-source-string-0123456789-abcdefghijklmnopqrstuvwxyz"`.
- Emitted later-script lexical source: `()=>_occa783f8f17d[0]`.
- Both returned values and the independent private value match; `typeof globalThis.lexicalReader` remains `'undefined'`.

**Repair implication:** limiting source preservation to classic top-level `function` or `globalThis` properties would leave this counterexample. A proof for a private callable in classic script must account for the *shared global environment* across multiple scripts, including top-level `const/let` function values. Immediate lexical bindings in a private nested function or IIFE may still be safely transformable. This is a source-level scope principle; particular fixes must be validated for supported source forms and external observers.

The two-OS positive helper test `test/private-hot-helper-exported-wrapper.test.js` is independently green in focused [run 45079610876](https://github.com/FlareZ123/obfs/actions/runs/45079610876) at `248163c65012b768c090fed1734a29342feec477`, after JSDoc annotation correction in `src/properties.js` and `src/symbol-properties.js`. It proves one transformed private counter field, equal stateful outputs and exactly matched publicly exported CommonJS wrapper source, while **not** measuring runtime performance. These JSDoc-only corrections are part of the reviewed branch, and have been handed to Agent 3 for canonical integration.
