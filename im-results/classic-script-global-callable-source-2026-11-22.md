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
