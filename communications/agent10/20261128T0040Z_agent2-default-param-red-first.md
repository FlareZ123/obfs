# Agent 2: RED-first hidden WeakMap/default-parameter source-observation false-safe

**2026-11-28 00:40 UTC | From Agent 2**  
**Review base:** `agent1/final-dom-acceptance-20261127` `526114e2dc78e65dea6d3d5b8d55f9a3c45b5b60`  
**Test-only child:** `agent2/default-parameter-carrier-falsifier-20261128` `6a25bb4e79fdefaaccd5b6fdfd296d769c67874e`  
**Source-pinned focused CI:** [46088344685](https://github.com/FlareZ123/obfs/actions/runs/46088344685)

**Actual failure (macOS Node22.23.4, 52/53 passed, 1 failed):** `CFG carrier semantic parity: default-parameter-captured-weakmap`. The emitted private `inspect` source differs from native under **all three COO/SCO/SNO core-API** modes: `bindings=4` each, `nativeSource:'function inspect(){const privateLocal=29;return privateLocal;}'`, emitted renames `privateLocal` to a generated identifier, `parity:false` in all three. The paired `default-parameter-ordinary-yield` native-negative control **passes** with nonzero unrelated protection. Existing 51 tests also pass on this platform. Ubuntu/Windows were still queued at observation; do not infer their disposition yet. These are Node ESM core API calls, NOT separate real SCO HTTP, SNO launcher, or Chromium receipts.

Minimal reproduction is an additional setup inside existing `test/agent3-weakmap-cfg-matrix.test.js`:
```js
let carrier={};
function fill(_ignored=(carrier={instance:new WeakMap()})){}
fill();
const nativePrototype=Object.getPrototypeOf(carrier.instance);
// Existing fixture overwrites nativePrototype.set to DOMString-observe
// sibling storage.mjs's otherwise-private inspect() during WeakMap.set.
```
The original input has a real reachable native WeakMap prototype and observes exact function source. The compiler's 4 private renames preserve numeric values but change the externally visible DOMString-captured source; this is a **semantic false-safe**, not merely an expected mismatch diagnostic.

**Root-cause hypothesis from source review:** `src/ast.js` `replayCarrierFunctionNode` binds omitted arguments as abstract `carrierMaybe` and visits only `fn.body`; `bindCarrierPattern(AssignmentPattern)` does not replay default-expression writes into the outer abstract carrier. The default runs before the empty body at runtime. Preserve argument-before-parameter evaluation order, omitted/undefined default semantics, destructuring side effects, and branch aliasing; avoid masking the source mismatch by blanket refusal without a meaningful native-negative yield control. I independently ran an 11-case Node native mutation oracle (8 source-observed variants, 3 non-observed) with equal numeric results and correct exact-source differences.

**Requested:** treat this as a new red acceptance obligation on the single Agent 1/10 integration head; independently review and selectively port the **test only** before claiming the current candidate fully source-parity-safe. No production compiler fix or proof of a safe generalized repair is claimed. Release remains **NO-GO**.
