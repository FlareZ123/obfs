# Exact bounded WebAssembly i32 subtraction under bitwise coercion

**Status (28 November 2026): intermediate engineering candidate, not an accepted protection result.** This is a subtraction-specific child of Agent 23's preexisting draft [PR #353](https://github.com/FlareZ123/obfs/pull/353), at frozen parent `66791ce492ae4bce91aab089a2dff39d32abda2a`. Addition (`i32.add`, `0x6a`) and its basic guard were already proposed and tested by Agent 23 on 23 November. They are **not** a new Agent 38 discovery. The increment here is the paired operator `i32.sub` (`0x6b`), independent public-binary reconstruction, nested negative/positive controls, third-mode compiler admission and a real-browser equal-trust cost control.

## Contract and bounded correctness argument

The caller explicitly selects a named pure one-return function and promises **primitive signed-Int32 Number** arguments. The existing Wasm grammar has at most four arguments, AST depth <=16, Int32 constants, unary bitwise not, pure conditionals, and bitwise operators; no dynamic coercion, calls, multiplication, mutation, string or object input. `a-b` is admitted only where an enclosing bitwise `ToInt32` / `ToUint32` operation consumes its full value: `(a-b)|0`, `~(a-b)`, `(a-b)>>>0`, `((a-b)-c)&mask` and similarly nested pure branches. Parent context carries permission to children; each `ConditionalExpression.test` always resets that permission to false. Naked `return a-b` and arithmetic in uncoerced ternary tests remain declined.

Each signed/unsigned leaf has absolute value below 2^32; a depth-16 tree contains at most 2^16 leaves. Any chain of addition/subtraction is therefore bounded by 2^48 in magnitude, below the exact-integer limit 2^53 of IEEE-754 double arithmetic. The first source bitwise coercion discards high 32 bits. Since reduction modulo 2^32 is a ring homomorphism for addition and subtraction, doing the reduction eagerly with Wasm `i32.add/sub` yields the same low bits at that coercion. JS shift counts are already taken modulo 32. This argument applies **only** to the documented input and AST grammar, and does not prove arbitrary JavaScript equivalence or runtime protection.

A concrete negative predicate boundary: signed `a=-1`, `b=-1`; native `a-(b>>>0)` equals `-4294967296` (truthy) while the corresponding Wasm `i32.sub` wraps to zero (false). Thus `(a-(b>>>0))?1:0` must not be lowered, even when a later parent bitwise operator consumes the selected branch. Another negative type boundary: `((0.75-(-0.75))|0)===1` in JS whereas the Wasm signature coerces each fractional argument first, producing `0`. The compiler does not infer or guarantee signed-Int32 provenance at arbitrary public call sites; this is an explicit opt-in contract.

Do **not** generalize the argument to JS `*` and Wasm `i32.mul`: precision already loses bits in JavaScript before `|0`; e.g. `(2147483647*2147483647)|0` is 0 but `Math.imul(2147483647,2147483647)` is 1 under Node 22. Multiplication stays refused.

## Reproduction and frozen receipts

The source-only attacker in `sims/wasm-i32-static-recover.js` recognizes `0x6b` and emits explicit signed `|0` for each decoded add/sub. It neither reads original source nor imports compiler internals. That is **negative evidence for secrecy**, not a defensive advantage.

The first source-pinned donor head `ac17f603df4e31dd804a212e608be00d78066e38` passed [two-platform full Wasm workflow 46146509797](https://github.com/FlareZ123/obfs/actions/runs/46146509797) on Ubuntu and Windows. Both passed the existing Wasm research test matrix, the new eight fixed subtraction patterns (8 seeds, 512 vectors each = 32,768 native/Wasm/attacker-clone comparisons), COO ESM/SNO CJS checks and strict project plus research JSDoc checks. This receipt is **not** for the later generated fuzz, real-browser subtraction, equal-trust minifier or SCO core-selection additions.

Later child source adds `test/wasm-i32-coerced-subtraction.test.js` with 72 seeded nested trees x two conditional strategies x 96 typed inputs = 13,824 additional native-versus-Wasm-versus-standalone-reconstruction comparisons, plus explicit selected-path refusal and positive cases under COO/SCO/SNO core modes. SCO `obfuscateFiles` is a compiler-core test here, not HTTP-session, private-module or authorization acceptance. The standalone `test/wasm-i32-additive-browser.js` serves real ESM over local HTTP with strict CSP `script-src 'self' 'wasm-unsafe-eval'`; subtraction is compared across native, Wasm, bytecode-only clone and esbuild-minified source for 2,000 exact typed inputs and 13 counterbalanced hot samples per implementation. Its report distinguishes browser CPU from first-load/initialization, and records both native/Wasm and equal-trust minified/Wasm ratios.

The next source-pinned [manual workflow 46146835476](https://github.com/FlareZ123/obfs/actions/runs/46146835476), at `8f20b5c720ca9fad039cb230cda2320501089d27`, was queued at report drafting. It includes generated fuzz and the first three-way subtraction browser probe but **not** the subsequently added esbuild fourth-way control or SCO core gate. A new exact-head acceptance result is required for those later changes. Do not label queued or superseded runs green.

Local independent model check `/mnt/data/wasm_add_preflight.cjs` (non-repo scratch; not part of submitted artifact) compared 350 generated expressions x 2,400 signed Int32 vectors (840,000 low-bit outcomes) with zero mismatches using seed `0x67c9b5a1`. It supports but does not replace the contract proof or CI and should not be cited as a compiler integration receipt.

To reproduce from the child branch after `npm ci --ignore-scripts`:

```sh
node --test test/wasm-i32-coerced-subtraction.test.js
npx tsc -p jsconfig.wasm-i32.json
CHROMIUM_BIN=/usr/bin/google-chrome node test/wasm-i32-additive-browser.js
```

## Security and performance disposition

Static reconstruction: **no improvement demonstrated**; all emitted bytes are public and the attacker reconstructs native logic without original source. Dynamic extraction: **unchanged** under a hostile runtime. Unauthorized modification: **unchanged**. Environment locking: **unchanged**. Correctness: bounded typed-grammar improvement and new refusal controls; full three-mode production semantics still unresolved. Performance: the paired browser workload is a diagnostic, not a universal 2.5x certification; cold startup and large source applications are separate. The global project remains **RELEASE-BLOCKED**. Keep this report in `im-results/`; do not promote to `results/` without independent security/performance evidence.

**Integration path:** treat this child as a targeted proposed follow-on to Agent 23's PR #353, not a second implementation of addition; request peer proof review and full source-pinned acceptance before attempting to merge toward main.
