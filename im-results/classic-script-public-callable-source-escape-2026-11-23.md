# Classic-script global binding leaks source of supposedly private direct-callable functions

**Agent 44, 23 November 2026. Intermediate semantics-correctness counterexample and isolated conservative patch.** This report applies to draft callable-source integration PR #299 at original head b826c10e3c59c2210c00448a0645bb8751a87758 and its isolated [Agent 44 review descendant](https://github.com/FlareZ123/obfs/tree/agent44/callsite-source-20261123). The correction is not merged into main or the PR. Overall obfuscation remains **RELEASE-BLOCKED**.

## Failure mechanism

A classic browser script top-level function declaration becomes a property of the global object. An ordinary later script on the same page can obtain the function object through globalThis, call Function#toString on it, and observe its exact original source. The original source need not mention Function#toString, globalThis, an import, an export or any property of the function. A syntactically direct-only call from the defining source file is therefore insufficient evidence that the function body is private.

The initial standalone [test/classic-script-public-source.test.js](https://github.com/FlareZ123/obfs/blob/agent44/callsite-source-20261123/test/classic-script-public-source.test.js) began with:

~~~js
function scriptGlobal(){
 const publicMarker="CLASSIC_SCRIPT_GLOBAL_CALLABLE_SOURCE_MARKER_0123456789_ABCDEF";
 return publicMarker.length;
}
scriptGlobal();
~~~

It compared source from native and compiler-emitted code in separate Node vm contexts modeling browser classic-script top-level semantics. Both are observable via context.scriptGlobal. The compiler was invoked with **sourceType:'script'**, **mode:'coo'**, strings/identifiers/properties enabled, and the **explicit experimental preservePublicCallableSource:true** option. The pre-fix compiler replaced the literal with a decoder-table read and hashed its local binding, changing the external source. Return-value equivalence alone did not catch this mismatch.

The [red two-platform run 45093951739](https://github.com/FlareZ123/obfs/actions/runs/45093951739), source SHA **18029528f5d0a5b469cab115d0ad2ee32fcdd25b**, reproduced the mismatch before the classic-script fix. The output's literal and one identifier were transformed while the source was still externally observable.

Top-level classic-script lexical declarations also remain accessible in later scripts within the same Realm without becoming own properties of globalThis. A second [lexical-binding test](https://github.com/FlareZ123/obfs/blob/agent44/callsite-source-20261123/test/classic-script-lexical-source.test.js) evaluates a const arrow function declaration in a first script and invokes String(exposedLexical) in a separately evaluated script in the **same context**. This is a separate correctness channel from checking only globalThis properties.

## Conservative source-type distinction

Acorn parses both CommonJS and browser classic scripts with ECMAScript sourceType:'script'. The draft collector incorrectly interpreted a top-level function whose local references are direct calls as a private source in either mode. The reviewed fix stores the **original compiler-supplied source-type provenance** in a WeakMap keyed by the parsed root AST in src/ast.js. It adds originalSourceType(ast) to read this without mutating the AST or changing the parser's grammar.

The private-direct-callable collector in src/properties.js now refuses to certify a top-level FunctionDeclaration or a top-level const function-valued initializer private when the original mode is **classic script**. CommonJS retains its prior private direct-call proof, while nested IIFE/local scopes in a classic script remain eligible if their source does not otherwise escape. This avoids an indiscriminate no-op for all browser classic scripts.

A positive control inside the global-function test uses a nested IIFE with a private local helper. It checks the emitted and native numeric result, then requires nonzero encoded literals. This proves the patch still allows an actual private transformation in the same script source mode.

## Exact validation

- Original browser classic-script global function source escape: **red** [run 45093951739](https://github.com/FlareZ123/obfs/actions/runs/45093951739), source SHA 18029528f5d0a5b469cab115d0ad2ee32fcdd25b.
- With the original-mode WeakMap and private-proof exclusion: **green** [run 45094305740](https://github.com/FlareZ123/obfs/actions/runs/45094305740) on Windows and Ubuntu. This pin also contains the nested IIFE positive-yield regression.
- Later-script top-level lexical callable lookup and source parity: **green** [run 45094309804](https://github.com/FlareZ123/obfs/actions/runs/45094309804) on Windows and Ubuntu.
- Both green runs use exact SHA **4bf1d2e3b7e5536e611d6b4a0e30d3d68be03306** and include strict project and strict external JSDoc checks.
- The same SHA is under full Node, adversarial, browser and performance workflow [run 45094335214](https://github.com/FlareZ123/obfs/actions/runs/45094335214). Its final verdict and impact relative to the original draft baseline must be assessed separately; the previous Promise-only correction already failed that full matrix.

## Scope and consequence

This is a concrete observable JavaScript semantics bug in a **draft opt-in preservation backend**, not a proof of unauthorized access, security compromise or runtime obfuscation bypass. The corrected collector restricts unsound private-source assumptions for a classic top-level binding. It has no evidence of overcoming the original full-matrix release blockers, source reconstruction or the strict 2.5x speed ceiling.

The work is deliberately retained on the isolated branch for the canonical integrator. The overall objective remains **RELEASE-BLOCKED** until the canonical branch's multi-platform full validation and a real equal-trust adversarial advantage can be demonstrated.


### Additional classic-script scope controls

A subsequent [let/var lexical binding extension](https://github.com/FlareZ123/obfs/blob/agent44/callsite-source-20261123/test/classic-script-lexical-source.test.js) checks three declared function-valued bindings, const, let, and var, each retrieved from a second script in the same Realm. The expanded test passed both operating systems at [focused run 45094507714](https://github.com/FlareZ123/obfs/actions/runs/45094507714), source SHA ae2f2451d62a0f325eb4ed4ec86771863291c41c. This is exact external source parity across all three declaration spellings.

A separate [Annex B block-declaration control](https://github.com/FlareZ123/obfs/blob/agent44/callsite-source-20261123/test/classic-script-annex-b-source.test.js) creates a sloppy classic script's block-contained function in an if(true) statement and observes its Annex B global-function binding after evaluation. The output was an **exact no-op** (zero literal/binding transformations, source unchanged), and [two-OS focused run 45094560388](https://github.com/FlareZ123/obfs/actions/runs/45094560388), source SHA a38cbae59659fef1c1b3e20bdbd43dfef3bfcde0, passed. This is a negative control: existing collector conservatism already prevents that exact block function rewrite, so it is not a fourth new compiler defect. It does not establish blanket safety for every Annex B declaration scope.
