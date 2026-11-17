# Native Function source coercion through RegExp, String and String.raw (2026-11-17)

**Classification:** intermediate, reproducible JavaScript semantic-safety discovery and repair. This establishes a finite set of real native/source-rewritten divergences and conservative compiler refusals. It is **not** a universal proof of equivalence, an anti-deobfuscation result, or a 2.5× performance certification.

## The unguarded behavior change

The experimental pure-Int32 Wasm backend legitimately transforms selected \`function f(a){return a^17;}\` into a WebAssembly-backed function when the input has no observable source consumers. JavaScript standard intrinsics can nevertheless implicitly call ToString on the function object, producing the exact \`Function.prototype.toString\` text. If a consumer was missed, replacing \`f\` changes observable behavior even though \`f(3)\` still computes 18.

A direct six-case counterfactual harness [\`test/source-observer-counterfactual-differential.test.js\`](../test/source-observer-counterfactual-differential.test.js) deliberately compiles only the isolated function and then composes each unchanged native observer into the surrounding program. At [pinned cross-platform green run 44002591846](https://github.com/FlareZ123/obfs/actions/runs/44002591846), source \`eaf2c12cab80fc00455303220c7826820c9af9ca\`, Ubuntu/Windows Node 22 executed each pair and recorded:

| Consumer applied to \`f\` | Original native | Isolated transformed \`f\` |
|---|---|---|
| \`/a\^17/.test(f)\` | \`true\` | \`false\` |
| \`/a\^17/[Symbol.match](f)\` | \`"a^17"\` | \`null\` |
| \`String.prototype.includes.call(f, "a^17")\` | \`true\` | \`false\` |
| \`String.raw({raw:["",""]}, f)\` contains \`"a^17"\` | \`true\` | \`false\` |
| \`String.raw\` as template tag with \`f\` substitution | \`true\` | \`false\` |
| \`String.prototype[Symbol.iterator].call(f)\` chars joined contain \`"a^17"\` | \`true\` | \`false\` |

The counterfactual harness intentionally omits the consuming code during the isolated transformation to show why whole-file and cross-file source observation matters. It is a controlled failure demonstration, not a claim that the **currently guarded** compiler emits those mismatches when it sees the consumer.

## Red controls and guarded repairs

The pre-repair negative tests genuinely failed with a nonzero emitted Wasm function count or failed to throw when explicit selection was unsafe, while their native fixtures returned source-dependent values:

- RegExp direct \`.test/\`.exec\` and other initial cases: [red 44000246545](https://github.com/FlareZ123/obfs/actions/runs/44000246545). Subsequent detached/bound/Reflect.apply cases: [red 44000597763](https://github.com/FlareZ123/obfs/actions/runs/44000597763), [red 44000760391](https://github.com/FlareZ123/obfs/actions/runs/44000760391). Corrected: [green 44001124340](https://github.com/FlareZ123/obfs/actions/runs/44001124340).
- Generic native String prototype methods with a function **receiver**, including \`.call\`, \`.apply\`, \`.bind\`, detached aliases and Reflect.apply: [red 44001189775](https://github.com/FlareZ123/obfs/actions/runs/44001189775), [green 44001362538](https://github.com/FlareZ123/obfs/actions/runs/44001362538).
- RegExp symbol-named \`Symbol.match\`, \`matchAll\`, \`replace\`, \`search\`, \`split\`: [red 44001798826](https://github.com/FlareZ123/obfs/actions/runs/44001798826), [green 44002000064](https://github.com/FlareZ123/obfs/actions/runs/44002000064).
- \`String.raw\` substitutions/raw segments/tagged template and generic String \`[Symbol.iterator]\` receiver: [red 44002237425](https://github.com/FlareZ123/obfs/actions/runs/44002237425), [green 44002428715](https://github.com/FlareZ123/obfs/actions/runs/44002428715).

The repair extends \`src/ast.js\` \`observesFunctionSource\` using provenance-aware fixed-point alias sets for source-coercing native RegExp and String methods and the \`String.raw\` builtin. It conservatively blocks rewrite when a native consumer can coerce a non-proven-primitive function/source-bearing object, including imported functions in another ESM module. The compiler **refuses explicitly requested unsafe Wasm** functions rather than silently shipping an unchanged function as if it were protected.

The same test suite contains positive controls: functions whose native String/RegExp arguments and receivers are proven **primitive string literals** are still genuinely lowered into Wasm and return the original results. Rejecting every function indiscriminately would pass the negative controls but fail the positive controls.

## Coverage and reproducibility

The [table-driven source-coercion matrix](../test/function-source-coercion-matrix.test.js) checks **45 String methods × 5 unsafe invocation forms + 45 primitive controls** and **3 RegExp methods × 6 unsafe forms + 3 primitive controls**, **291 finite AST assertions**. Both engines passed [manual gate 44001678904](https://github.com/FlareZ123/obfs/actions/runs/44001678904), which also ran full Wasm differential, source-only binary-extraction, strict JSDoc, and Ubuntu real Chromium Wasm integration. The more recent [run 44002591846](https://github.com/FlareZ123/obfs/actions/runs/44002591846) additionally validated the real unsafe/native differential and \`String.raw\` tests, with 0 failures on each platform. Re-run all with:

\`node --test test/regexp-function-source-observer.test.js test/string-prototype-function-source-receiver.test.js test/string-static-function-source-observer.test.js test/function-source-coercion-matrix.test.js test/source-observer-counterfactual-differential.test.js\`

The native semantics underlying the tests are specified in [ECMAScript 2026 text processing](https://tc39.es/ecma262/2026/multipage/text-processing.html), particularly \`String.raw\` substitution ToString, \`String.prototype[Symbol.iterator]\` receiver ToString, and RegExp symbol-named hooks. Compiler source observation remains an engineering approximation: dynamic monkeypatching, unresolved external functions, unknown reflective callbacks and arbitrary indirect coercion need a stronger whole-program capability proof.

**Security distinction:** A runtime's ability to observe original Function source is one example of the open-world contract that constrains semantics-preserving obfuscation. This repair increases compatibility and legitimately reduces transformation yield where source can escape. It offers no new confidentiality or tamper-resistance claim. Static source recovery attacks against already delivered Wasm code still apply separately.


### Aliased Symbol keys (subsequent extension)

An additional negative targeted aliases such as \`const key=Symbol.match; /regex/[key](f)\` and transitive \`const alias=key\`; the earlier direct well-known-symbol guard missed them. [Red 44002705810](https://github.com/FlareZ123/obfs/actions/runs/44002705810) showed the unsafe Wasm emission on both platforms. \`src/ast.js\` now monotonically accumulates possible well-known Symbol values through assignments, respecting uncertainty about mutable aliases by never throwing away a previously observed key, while preserving direct positive primitive controls. [Green 44003016988](https://github.com/FlareZ123/obfs/actions/runs/44003016988), checked-out SHA \`346eed64075f527bf6fbda35ad23f16639da5de8\`, exercised the extended negative cases on both platforms. One earlier run [44002881834](https://github.com/FlareZ123/obfs/actions/runs/44002881834) had passed all 3rd-party and new behavior tests but failed strict JSDoc on a nullable symbol key; a non-nullable alias value fixed that typecheck without changing the method policy.
