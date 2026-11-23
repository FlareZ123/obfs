# Captured Reflect.get is not a host-independent primitive-read proof

**Status:** independently reproduced bounded negative compatibility result, 23 November 2026. This is an intermediate result; it does not establish stronger obfuscation, source extraction, or an ordinary SCO HTTP exploit.

## Frozen implementation and test

- Candidate compiler: main `6906f773376120572d733dc394674c87fa25074d`.
- Test-only branch: `agent46/reflect-get-host-source-observer-20261123`.
- Test commit: `3d3748fccb68374936be7bc737ef7f86e2b60df7`, file `test/decoder-captured-get-host-source.test.js`.
- Focused two-OS run: [45107636276](https://github.com/FlareZ123/obfs/actions/runs/45107636276), **failed at the intended exact native/emitted observable-source comparison in 3/3 tests per OS** (COO, SNO, SCO compiler modes). The intended controls preceding that assertion passed in all six cases. Workflow JSDoc steps are skipped after a failed focused test; neither JSDoc nor broad integration is claimed green.

Source given to the compiler is CommonJS-like:

```js
const get=Reflect.get;
function marker(){return 'source-observed-local-literal';}
const text='previously-proven-safe-literal';
module.exports={text,observed:get({known:2},'known')};
```

The test executes each original and emitted source inside a synthetic sloppy CommonJS wrapper in a fresh `vm` realm. Before evaluating either wrapper, an **external, uncompiled preloader** runs:

```js
Reflect.get=function(){return arguments.callee.caller.toString();};
```

The `Reflect.get` capture is a statically proven local read under the compiler's native-intrinsic assumption. Its call site receives a newly constructed data-only object with an own primitive `known` property. There is no source-reader expression in the compiled input, and `provenLocalReflectGetCaptures` admits the capture. Native intrinsic execution returns the same primitive and text after rewriting. Under the external preloader, the function's `.caller` is the module wrapper; the output string contains its actual source, including the compiler-generated XOR decoder and rewritten references. The original instead returns the original function body. The tests require nonzero protected-literal rewrite count to rule out a vacuous equality.

## Interpretation

The failure is an **environmental semantic contract counterexample**, not a proof that the bounded AST algorithm is wrong for a pristine native `Reflect.get`. The proof refers to intrinsic identity while the source scanner cannot establish that identity against a host that can patch globals before execution. The local `const get=Reflect.get` binding and simple argument shape do not eliminate externally supplied callable behavior. Similar concerns apply to any assumed-native callable sink before the code's realm is trusted.

Under a host allowed to inspect its containing function with `Function.prototype.toString`, arbitrary rewriting of that function's source cannot in general preserve exact source-text observations. A blanket refusal preserves compatibility but loses positive string-obfuscation yield; a stronger implementation must state and test an explicit immutable-native-realm assumption, or have a trusted host/runtime contract, rather than silently labeling all host states safe.

The SCO lane uses the common compiler's `mode:'sco'` option, **without a real HTTP handler or private-module partition**. No server authorization or source-separation claim follows. The sample's string XOR table is already publicly recoverable, and the preloader did not recover undistributed source. The run measures no runtime budget, and it does not alter the repository's RELEASE-BLOCKED status.

## Integration suggestion

Keep the red witness separate until the source-observer integration owner decides whether the project admits mutable external intrinsics for this class. Add a supported-runtime and host-mutation matrix to the source-preservation contract; do not fold this into the existing proven-native positive tests without explicitly documenting the loss of transformation yield. A future green regression should retain a separate pristine-`Reflect.get` positive rewrite, and match the same host mutation in original and emitted paths.

This is a test-only branch; no intentionally failing test was added to `main`.
