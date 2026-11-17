# Inherited Array-index setters corrupt chunked string decoding

**Status:** intermediate reproducible compiler-safety finding, 17 November 2026. **Author:** Agent 10. The finding concerns the optional eager local XOR string encoder, independent of program-reconstruction resistance.

## Threat and reproducible native counterexample

A supplied file group can contain a legitimate CommonJS module that executes before a target's string decoder. The earlier module may install an accessor in the prototype chain of `Array.prototype`:

```js
const shim={get 0(){return 0;},set 0(value){}};
Array.prototype.__proto__=shim;
```

The target contains a string literal of 2,048 `A` code units followed by `Z`. The emitted fast decoder in `src/strings.js` uses a fresh `const units=[]`, then performs `units[0]=codeUnit` and spreads `...units` into `String.fromCharCode`. The new inherited setter suppresses creation of the first own data property. The spread reads inherited getter `0`, converting the first expected `A` to a NUL. The native file merely evaluates the literal and preserves `A`.

The [three-file test](../test/decoder-array-prototype-chain.test.js) compiles the actual unchanged CommonJS file group in both SNO and explicit `strings:true` COO, executes the native and emitted graph in separate Node processes, and compares exact output. It also checks an ordinary unmodified graph still emits and executes a chunked decoder.

## Paired red and green evidence

- **Red:** [run 44000100384](https://github.com/FlareZ123/obfs/actions/runs/44000100384) at `65eae39c6c30d02f8c5be6f31f56bb94c5ba3d16`, Node 22 Ubuntu/Windows, failed two real runtime-equivalence comparisons per operating system. Logs show generated first code unit `\\x00` versus original `A`; ordinary chunked control passed.
- **Fix:** [commit `32af2f40`](https://github.com/FlareZ123/obfs/commit/32af2f40a540c204b327657c0ac0e9776f6d27b5). `mutatesDecoderIntrinsic` now recognizes direct, computed and simple alias writes to `Array.prototype.__proto__`, and declines eager decoding throughout the supplied group. It reuses existing local prototype provenance.
- **Green:** [run 44000384155](https://github.com/FlareZ123/obfs/actions/runs/44000384155) at `32af2f40a540c204b327657c0ac0e9776f6d27b5` passed both operating systems, including six inherited-setter cases (three syntaxes × COO/SNO), ordinary positive, attacker tests, static string-recovery positive, and both strict JSDoc suites.

## Precision and limits

This is a compiler correctness repair for the **supplied closed file group**. It does not establish safety when prior external modules or an instrumented host mutate primordials after obfuscation. Aliasing, reflective mutations and modifications to inherited `Object.prototype` accessors have independent proof obligations. Fail-closed decoding sacrifices transformed-string coverage for the affected graph. The ordinary graph's protected-string positive remains in the same test suite.

The result does not establish static confidentiality: when a decoder is emitted, the existing [offline source-only attacker](../sims/static-string-recovery.js) still recovers the supported XOR literals. No sustained 2.5× runtime claim follows from these small safety tests.


## Expanded numeric prototype-accessor corpus and yield controls

The initial chain-only guard was insufficient. An array's numeric lookup also inherits **own** indexed accessors on `Array.prototype` and `Object.prototype`. A preceding module can create those through `Object.defineProperty`, `Reflect.defineProperty`, or the legacy `__defineGetter__` / `__defineSetter__` methods, even when the prototype chain itself remains unchanged. The two built-in prototypes form the ancestry of each emitted `const units=[]`.

- **Second red:** [run 44000598658](https://github.com/FlareZ123/obfs/actions/runs/44000598658), exact `635bc21d82b881e891e7bd28e6b2ebed4969a623`. Six new syntax families × COO/SNO produced **12 genuine wrong-output runtime comparisons on each operating system**; the three earlier chain syntaxes and ordinary decoder control passed.
- **Second green:** [run 44000818091](https://github.com/FlareZ123/obfs/actions/runs/44000818091), exact `bb017d210bb689ccae1bf9c42a24f6d7e0978464`. The compiler tracks directly visible `Object.prototype` references and aliases and conservatively declines decoder generation if an observed mutating method can install an inherited numeric accessor. It also treats first-class legacy accessor writers as potentially opaque. The tests passed on Ubuntu and Windows.
- **Coverage-control red:** [run 44000982498](https://github.com/FlareZ123/obfs/actions/runs/44000982498), exact `4974237da6cd17af3cc2214139ea8458cde99607`. Four of 12 newly added benign, nonnumeric prototype mutation controls were incorrectly declined, specifically `Reflect.set(..., 'unrelatedAppField', 7)` on either prototype in COO or SNO. The source remained behaviorally valid; those were **lost-coverage failures**, separate from the wrong-output red evidence.
- **Coverage-control green:** [run 44001115808](https://github.com/FlareZ123/obfs/actions/runs/44001115808), at exact `bbf2cf25409df43dde204395a6f58bf05a2ee8fc`, after [precision fix `846f1287`](https://github.com/FlareZ123/obfs/commit/846f12876a394afb73d28df217b54899b70cee6f). Reflective setters to a proved nonnumeric, non-`__proto__` property remain eligible. The matrix's **20 negative + 12 safe positive + one unmodified positive** cases passed on both systems, along with static reconstruction and JSDoc. Unknown computed properties remain fail-closed.

The index check is bounded to strings `"0"` through `"4095"`, the maximum individual chunk size emitted by `src/strings.js`. Unknown computed keys and `__proto__` remain unsafe. This is a bounded syntactic guard; it neither models all unknown prototype aliases nor proves safety against a hostile external runtime.

## Real-browser ESM graph validation

[Run 44001273653](https://github.com/FlareZ123/obfs/actions/runs/44001273653), exact `ae00d81abd76fad1f719f689e2678347f28f22db`, completed successfully in Ubuntu Chromium. [A separate HTTP-served ESM harness](../test/decoder-array-prototype-browser.js) compares browser execution of original and COO output for a three-module static import graph. Both `Array.prototype` and `Object.prototype` indexed-accessor mutations caused **zero protected literals** to be emitted. Native and emitted browser observations matched the literal's 2,049-code-unit length, first code unit 65, and last code unit 90. An unrelated `Object.prototype` property descriptor retained **one protected literal** and also preserved runtime behavior. The test used a CSP permitting self-hosted modules, without `unsafe-eval`.

The browser test validates these three scenarios in one Chromium build, while the CommonJS matrix samples two Node operating systems. Neither substitutes for a universal 2.5× performance proof or cross-browser exhaustiveness.

## Source-only reconstructed ESM in Chromium

The Chromium harness was extended at [`b49b2197`](https://github.com/FlareZ123/obfs/commit/b49b2197910ac0ba50df0ce7c46ba45fdda01c54) to run a **third independent executable build**: it passes the compiler-emitted public ESM target to `sims/static-string-recovery.js`, statically reconstructs an eligible XOR literal without executing that target, serves the reconstructed graph separately over HTTP, and compares the browser's actual outputs against native and generated versions. The pinned [Chromium run 44002095045](https://github.com/FlareZ123/obfs/actions/runs/44002095045), exact `b49b2197910ac0ba50df0ce7c46ba45fdda01c54`, passed the entire browser workflow.

Its logged cases: hostile `Array.prototype[0]` and `Object.prototype[0]` graphs each emitted **zero** protected literals, with **zero** attacker-recovered uses; the harmless nonnumeric property graph emitted **one** protected literal with **one** statically recovered use. All three real Chromium executions of native, emitted and independently reconstructed ESM agreed on first UTF-16 unit 65, final unit 90, and length 2,049. This is a deliberately small positive example of public-string recovery, supporting the limitation that the local XOR-table transformation does not hide recoverable strings from static analysis. A no-table hostile graph is a compiler-refusal control, never evidence of attack resistance.
