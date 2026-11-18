# Bound and owned Blob constructors: native source observer red/green

**Agent 3, 18 November 2026 UTC. Bounded correctness result, intermediate.**

## Why this follow-up matters

The prior [Blob second-argument repair](blob-options-webidl-source-redgreen-2026-11-18.md) recognized direct and simply aliased constructors. Actual Node 22 also exposes a function's source via Blob constructors bound with \`Function.prototype.bind\` and constructors carried by owned object properties. Ignoring these aliases allows a compiler to change the source text returned by \`new make(...)\`, or to change a native exception message, even when ordinary function return values are preserved.

This is a compatibility/soundness concern. It does not confer a confidentiality or hostile-runtime integrity guarantee on the obfuscator.

## Test and pre-fix negative control

New [native Node differential regression](../test/blob-constructor-alias-source-observer.test.js) freezes ten source-sensitive construction shapes:
1. A \`Blob.bind(null)\` alias, with the original two operands supplied later.
2. An alias with the first Blob-part argument already bound.
3. An alias with both Blob arguments already bound, including a function-valued \`type\`.
4. Inline bound constructor expression.
5. \`Reflect.construct\` of a bound constructor.
6. A constructor saved in an owned object field.
7. Object destructuring of that field.
8. Aliased owner object.
9. A property assignment after object declaration.
10. A constructor selected through a comma sequence expression.

For every case native Node output includes the original function's spelling, and changing that spelling demonstrably changes the output. Each case also checks \`observesFunctionSource\` and COO/SNO native-versus-emitted output parity. A separate bound-Blob control with primitive-only options requires **two genuine private property rewrites** in each mode.

The source-pinned [two-OS red run 44253437344](https://github.com/FlareZ123/obfs/actions/runs/44253437344), checkout \`68466ccddbc0058840a200a7701667be820b50b5\`, failed the first bound-constructor detector assertion on Ubuntu and Windows. Each selected runner reported **143/144 tests passing, one expected failure**; the native source witness and the positive control passed.

## Implementation

\`src/ast.js\` now uses a monotone \`boundBlobConstructors\` may-alias set and \`blobObjectKeys\` source-aware object-property map, with simple identifier and object-owner propagation, destructuring and assignment. A \`isBlobConstructor\` helper also recognizes final expressions of comma/sequence expression forms. For direct construction, it treats Blob's first two arguments as possibly source-converting and, for bound calls, conservatively inspects every supplied operand because \`.bind\` changes positional offsets. Captured arguments to a recognized \`Blob.bind\` are inspected when the binding is created, including bindings later executed in unreviewed code.

This affects only recognized Blob constructors, retaining existing Web dictionary handling for \`Headers\` and \`URLSearchParams\`.

**Green:** source fix commit \`11211e6cbf97a0646928a96e3492564879229dbb\`. The next manually dispatched [two-OS validation run 44253867139](https://github.com/FlareZ123/obfs/actions/runs/44253867139), checkout \`82d19a942d601b84640d16acdf8ed7eee453cc96\` including this change, passed **144/144 tests per OS**, strict project JSDoc on both OSes, both existing and Blob-specific real Chromium tests on Ubuntu.

This test proves 10 selected native alias cases and preserved primitive positive yield. It does **not** establish arbitrary alias or wrapper precision, full cross-file ownership, patched built-in safety, universal semantic equivalence, attacker-cost advantage over ordinary minification, or the universal 2.5× compute budget. Source rewriting remains conservatively suppressed for proved function coercions.

## Reproduction

Run \`node --test test/blob-options-function-source-observer.test.js test/blob-constructor-alias-source-observer.test.js\` on Node 22 with declared project dependencies, and manually invoke \`.github/workflows/manual-web-idl-source.yml\` for the full two-OS/Chromium/JSDoc coverage.
