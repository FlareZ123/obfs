# Cross-module getter-descriptor factory export breaks eager string decoder parity

**21 November 2026, Agent 3.** Source-pinned intermediate correctness evidence, with independent red and repaired green on Ubuntu and Windows. The overall strongest-obfuscation objective stays **RELEASE-BLOCKED**.

## Three-module export provenance boundary

A CommonJS graph evaluates `factory.cjs`, `mutator.cjs`, then the target module's eager string decoder. The mutator obtains a getter descriptor or a factory function exported by `factory.cjs`, constructs an object with a native API, and modifies `String.prototype.charCodeAt` indirectly through the getter before the target module loads.

Representative source shapes:
```js
// factory.cjs
const desc={get(){return String.prototype;}};
function make(){return {ref:desc};}
module.exports={make};

// mutator.cjs
const {make}=require('./factory.cjs');
const box=Object.create(null,make());
box.ref.charCodeAt=()=>0;
```
The original target's 2,049-character literal is unaffected. Its obfuscated counterpart's eager decoder calls `raw.charCodeAt` and produces different bytes. Using `Object.defineProperties(box,make())` is equivalent. Locally each file looks benign to a direct native-call scan, so the meaningful proof obligation is the **exported getter-map provenance before an imported module's decoding**.

## Independent counterexamples and matched safe controls

The 32-case `test/decoder-descriptor-crossmodule-factory.test.js` matrix tests four export shapes × two native sinks (`Object.create` and `Object.defineProperties`) × COO/SNO × harmful String or harmless Number prototype writes:

1. Inline `exports.make=()=>({ref:{get(){return String.prototype;}}});`
2. `function make(){return {ref:desc};}module.exports={make};`
3. `const make=()=>map;module.exports.make=make;` with a locally aliased descriptor/map
4. Direct shorthand `module.exports={desc}` (an existing safe refusal)

The first three had 12 actual native/emitted output mismatches, while the fourth export shape and all 16 Number controls passed. Harmless Number sources still require a positive transformed literal. All tests launch original and emitted CommonJS modules in isolated Node processes, comparing status, stdout, stderr and transformation coverage.

| Gate | Exact SHA | Ubuntu Node 22 | Windows Node 22 |
| --- | --- | --- | --- |
| Test-only red | `1f859b71b405af8f6ac465e6b4a7b95299ac286b` | 4,115 pass, 12 fail, 1 skip / 4,128 | 4,112 pass, 12 fail, 4 skip / 4,128 |
| Bounded export repair green | `a1c9096777b33af7c936030daeabb5711e2ea8ca` | 4,164 pass, 0 fail, 1 skip / 4,165 | 4,161 pass, 0 fail, 4 skip / 4,165 |

Evidence: [red full two-OS run 44937440517](https://github.com/FlareZ123/obfs/actions/runs/44937440517); [green full two-OS run 44937940438](https://github.com/FlareZ123/obfs/actions/runs/44937940438). The latter completed prescribed Node behavior, both JSDoc stages, benchmark/process profiles and Ubuntu Chromium integration. The differing overall test totals reflect other work added to each separately pinned branch base; each row is independently source-identified.

## Repair and its boundary

The compiler's bounded fixed-point summary recognizes named/local synchronous function factories that return a descriptor map containing a getter exposing a sensitive decoder intrinsic, and now also traces known function-valued/object-valued CommonJS exports. For a statically required CommonJS target, an exported descriptor/map/factory known to supply that sensitive getter conservatively disables the generated eager string decoder across the supplied file group. The existing graph scanner `staticallyRequiredCommonJsTargets` proves the static relative `require` relation. There is no new runtime work or need to transform unknown external APIs.

The original test-only red branch `agent3/descriptor-crossmodule-provenance-20261121` and the source patch plus regression test in [draft PR #217](https://github.com/FlareZ123/obfs/pull/217) preserve the witness. This correctness proof applies only to the tested static relative CommonJS and finite local factory/source patterns. Dynamic module resolution, unknown reflective factories, arbitrary mutations, and first-class invocation wrappers require separate proof. No guarantee of general obfuscation security, universal 2.5× overhead, or authorization resistance is inferred.
