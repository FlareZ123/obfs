# Host-provided callable loader breaks the closed-record proof (16 November 2026)

**Author:** Agent 21. **Status:** intermediate Node ESM behavioral counterexample and a conservative proof-refusal candidate. This is not a full-control runtime-security boundary or a general performance result.

## Problem

The existing closed-world cross-module property renamer permits a computed read of a private own-key literal record only if every direct ESM caller supplies a declared own key and the record does not escape. It correctly declines inherited-key and source-declared reflection-intrinsic mutation cases. An opaque callable provided by the host can nevertheless dynamically import a separate property owner. The compiler's analysis does not observe the host's executable implementation, which lies outside its declared ESM files.

This report focuses on the static compiler property-ownership assumption. In the full-control COO threat model, both original and transformed files remain copyable and debug instrumentation remains available.

## Reproducing program

The test uses a real Node 22 --require preload that sets globalThis.RUNTIME_FACTORY=Function, then launches a three-file ESM graph:

~~~js
// state.mjs
export const state={secretField:41};

// record.mjs
const schema={externalFormat:'audit-v1',auditCount:3};
export function inspectRecord(key) {
  return {keys:Reflect.ownKeys(schema).sort(),value:schema[key],
    enumerable:Object.getOwnPropertyDescriptor(schema,'externalFormat')?.enumerable===true};
}

// entry.mjs
import {state} from './state.mjs';
import {inspectRecord} from './record.mjs';
const ctor=globalThis.RUNTIME_FACTORY;
const remote=await ctor("return import('./state.mjs')")();
const result=[inspectRecord('auditCount').value,Object.keys(remote.state),remote.state.secretField];
console.log(JSON.stringify([state.secretField,result]));
~~~

The test intentionally uses the own key auditCount, so refusing all missing or inherited schema keys cannot solve this witness. The original prints [41,[3,["secretField"],41]]. With the pre-patch transformation, state.mjs retains its public export while renaming the private field, causing [41,[3,["_p5e4b73051cde"],null]].

## Pinned tests

- **Red:** [GitHub Actions 43842553016](https://github.com/FlareZ123/obfs/actions/runs/43842553016), source 9d79bfa08da956fca7b6364315c22d050b520cf7, Ubuntu/Windows failed the native-vs-transformed differential. A new single direct alias called the host's Function and dynamically imported state.mjs. The compiler incorrectly renamed one private field.
- **Green:** [GitHub Actions 43843558621](https://github.com/FlareZ123/obfs/actions/runs/43843558621), source 780994469ed7559889ee71c8f3f91170532f5f2c, Ubuntu/Windows targeted frozen application suites and legacy Node 22 passed. The test file now covers the first callable alias plus a direct global method invocation and a transitive first-class alias. Existing positive own-key property transformation and source-observer refusal controls remained green.

The patch adds a narrow global-call alias analysis within safeClosedCallerRecordRead in src/cross-properties.js. It recognizes calls whose callee is a direct global method or a simple identifier alias sourced from a global object's property and propagated through basic identifier assignments. If such a host callable is executed anywhere in the input ESM graph, the computed record read cannot provide a sound global ownership proof. This is implemented as conservative refusal, not runtime checking or generated authorization.

## Explicit limits

The analysis is incomplete for arbitrary nested global objects, extracted methods through destructuring, callbacks passed to other functions, computed calls through proxies, custom loaders, or host-injected behavior in direct reflection builtins. The tests demonstrate three specified hostile flows, without proving a complete static analysis of every route. An external host with runtime control can still observe or modify transformed files.

There is no claim of stronger obfuscation or universal 2.5x hot-work conformance. The patch can reduce admissible property renaming for applications that call opaque host functions. Its positive-control protection yield must be monitored, and unchanged frozen source-observing graphs must be separated from intentionally modified positive fixtures.

**Reproduce:** node --test test/cross-file-safe-record-read.test.js, then manual-application-challenge.yml on the exact source pin. The full Linux/Windows/Chromium validation matrix is a separate release gate.
