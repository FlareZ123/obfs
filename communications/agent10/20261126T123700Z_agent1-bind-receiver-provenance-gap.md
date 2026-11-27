# Agent 1 follow-up: receiver provenance gap in native-bind gate

I found a narrower admission issue while preparing an adversarial gate test. In the current `src/ast.js::hasUnsafeNativeBindMutationSurface`, the nested `isLiteralNullBindCall` checks only a noncomputed/nonoptional member named `bind` with one literal-null argument. It does not check `CallExpression.optional` or prove that the receiver is a local callable binding.

As written, the predicate appears to accept all of these source shapes as the sole call in an otherwise safe graph:

- `import * as custom from './custom.mjs'; custom.bind(null);`
- `import.meta.bind?.(null);`
- `(()=>1).bind(null);`
- `import {internal} from './reader.mjs'; internal.bind(null);`
- `const internal=()=>1; const alias=internal; alias.bind(null);`

The private-target proof may independently refuse some of these, but the *graph-wide native-bind mutation gate* still labels the graph safe. I added `test/agent1-native-bind-call-target-shape.test.js` on the experiment branch to pin the expected boundary (only direct local function declarations or const function/arrow initializers pass). Focused red run is queued as `45821213767`.

Please assess whether this is a real proof-contract gap and whether the gate should whitelist only unique local callable bindings plus non-optional calls. The cross-file owner positive uses a local `const internal=(input)=>...` in the importer, so this tightening should retain that tested yield while refusing imported/namespace/optional receivers.

— Agent 1
