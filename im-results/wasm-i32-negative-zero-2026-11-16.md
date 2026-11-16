# Typed WebAssembly i32 semantic guard: JavaScript negative zero

**Status:** established concrete compatibility counterexample to the previous experimental grammar, fixed by fail-closed selection; intermediate compiler result rather than novel obfuscation security. **Pinned source:** 4fddecf80a605818e9e60b9764db1a7d81e7a282. **Validation:** [manual Wasm i32 run 43808274942](https://github.com/FlareZ123/obfs/actions/runs/43808274942), 27/27 Node tests and both strict JSDoc checks passing on each Windows and Ubuntu Node 22 runner; real Chromium host bridge and strict CSP checks successful on Ubuntu.

## Root cause

The experimental lowering recognizes pure signed-Int32 return-only JavaScript expressions and emits a WebAssembly i32 function. The accepted grammar permitted unary negative literals in the signed range, including the expression -0. JavaScript preserves the sign of zero as an observable Number property. For example, Object.is(-0,0) is false, 1/(-0) is -Infinity and 1/0 is Infinity. WebAssembly i32 represents one integer zero and cannot encode a negative-zero result. The old compiler's constant mask and xor sequence converted the source's -0 to an i32 0, then the generated JS wrapper returned positive zero.

The failing source could be a one-parameter function with no effects, such as a function whose return expression is -0 or a ? -0 : 0. An argument a=1 is within the explicit signed-Int32 input contract. This is a deterministic result mismatch, independent of the Wasm seed, the host runtime version, or the static attacker's parser.

The [W3C WebAssembly Core Specification, values and integer classes](https://www.w3.org/TR/wasm-core/#integers%E2%91%A0) defines i32 integer values and distinguishes them from floating-point types, which can encode signed zero. The mismatch is also directly observable in JavaScript.

## Repair and tests

In [src/wasm-i32.js](../src/wasm-i32.js), accepted() now returns false for a unary minus applied to numeric literal zero, using Object.is(-node.argument.value,-0). The compiler retains the original source when a function with such a literal is selected through lowerWasmI32Functions; the parent obfuscateFiles experimental selection integration can then fail closed instead of silently publishing a transformed function with different outputs. This deliberately refuses a few safe cases where a later bitwise operation would coerce negative zero to ordinary i32 zero; a context-sensitive proof may recover them in the future.

The new [negative-zero regression](../test/wasm-i32-negative-zero.test.js) covers the direct -0 return, both ternary orientations and nested pure ternaries. Each original is asserted to produce observable negative zero, and each candidate lowering must decline byte-for-byte unchanged. A positive control ensures an ordinary negative signed literal (-1) remains eligible and preserves outputs over Int32 boundary inputs.

## Evidence and scope

The updated existing [manual Wasm gate](../.github/workflows/manual-wasm-i32.yml) executes this test alongside independent static recovery, signedness, nested grammar, browser host API, strict CSP, and runtime extraction negative controls. The exact Linux/Windows source pin passed on both platforms. No new workflow was created.

The fix is a soundness refusal for an opt-in experimental backend. It does not improve static reconstruction resistance, conceal public Wasm bytecode, prove dynamic tamper resistance, or certify runtime overhead ≤2.5×. The published compiler still assumes arguments are canonical primitive signed Int32 Numbers; callers must independently enforce that contract, including excluding negative-zero arguments if they could survive an accepted direct conditional return.
