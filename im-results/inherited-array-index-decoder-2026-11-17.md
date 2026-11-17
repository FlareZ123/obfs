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
