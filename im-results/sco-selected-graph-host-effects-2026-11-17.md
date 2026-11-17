# SCO selected private graph: client-host effect admission counterexamples

**Date:** 17 November 2026. **Classification:** Intermediate compiler correctness evidence. **Owner:** Agent 7. **Scope:** source-audited static ESM dependencies of `partitionScoSelectedAsyncExports` and the composed `partitionScoSelectedGraph`.

## Native semantics at risk

A browser-executed source module may call `console.info` or read `window.__applicationMode` from a private static dependency. A generated SCO facade sends the selected private call to a trusted Node server. The same source now observes the Node console, and browser-owned host values can be absent or different. Return-value-only comparisons do not prove parity for either host effect.

The following source is a minimal concrete admission witness:

```js
// mixed.mjs
import {compute} from './private/child.mjs';
export async function protectedOp(){return compute();}
export function visible(){return 7;}

// private/child.mjs
export function compute(){
  console.info('CLIENT_VISIBLE_CANARY');
  return 7;
}
```

The caller explicitly selected `protectedOp` as private and supplied `privateModuleImports:['./private/child.mjs']` and the exact child source in `privateModuleSources`. The selected compiler previously accepted this input. Its generated RPC client retains a promise result but no client-side console call, so the original browser console side effect would be moved to the server. The test establishes the compiler admission defect; it does not claim a measured browser-console transcript from a live distributed deployment.

A second source-audited child was admitted with `return window.__applicationMode;`. Independent client and server realms may not have the same `window` or `document` state. The regression also includes `self`, `navigator`, `location`, a custom `globalThis` property, and `typeof document`. A two-public-facade example referring to one shared private child is covered alongside an inert shared-child positive control.

## Pinned falsification and repair

- **Red console admission:** [Linux/Windows workflow 44198414380](https://github.com/FlareZ123/obfs/actions/runs/44198414380), source `cbead0ccb105835914be04150736bc0303c8fb64`. Both platforms failed the expected console refusal; deterministic `Math.imul` and inert object-property controls passed.
- **Console guard green:** [workflow 44198809828](https://github.com/FlareZ123/obfs/actions/runs/44198809828), source `a3bbbc99fd86b6118d6187a4dc3286a2a57b694b`. Targeted SCO HTTP, partition, static-closure, browser, and strict-JSDoc steps passed on both platforms.
- **Red browser-global admission:** [workflow 44199092501](https://github.com/FlareZ123/obfs/actions/runs/44199092501), source `952084398c64cc20a9049162969299d0823cf18f`. Both platforms failed the expected `window.__applicationMode` refusal; debugger refusal passed.
- **Combined green:** [workflow 44200321553](https://github.com/FlareZ123/obfs/actions/runs/44200321553), source `6944d62ce0bc6748f363b1ac3b67f893ad8bf3fc`. The full manually targeted SCO authorization regression suite, actual browser checks, and strict typechecks passed on Linux and Windows. This source also includes the explicit two-facade shared-child refusal and positive-control test.

Intermediate attempts [44199584950](https://github.com/FlareZ123/obfs/actions/runs/44199584950) and [44199756085](https://github.com/FlareZ123/obfs/actions/runs/44199756085) revealed diagnostic-order interference with existing loader/global-write tests. The source fix preserves prior specific refusal diagnostics while applying the new read and console checks to previously admitted sources.

## Change and boundaries

The new `collectPrivateStaticImportClosure` guards detect console and debugger usage in audited static child code, refuse unproved browser-owned global references, and refuse unknown application-specific properties on a direct or simply aliased global object. Simple local records with a property label `console` remain valid. Proof-positive deterministic child code and the two-facade shared-child control remain accepted.

This is conservative syntax-based admission. It may decline safe programs whose local identifiers shadow ambient host names, and it does not claim complete interprocedural origin tracking. Host-defined effects through unproved indirect APIs, loaders, capability transfers, and externally supplied mutable bindings remain beyond this evidence. The audit runs during obfuscation; accepted emitted client code is not changed by these guards. No new deployed runtime slowdown or resistance to client tampering, same-account relaying, static recovery, or hostile server ownership is established.

**Reproduction:** `test/sco-selected-console-realm.test.js` under the manual [SCO authorization workflow](../.github/workflows/manual-sco-authorization.yml). Review source and CI at the exact stated SHAs; an unrelated successful moving-head build cannot substitute for these pins.
