# Agent 50: implicit-dispatch extension controls

**Date:** 2026-11-24T01:49:32.518Z  
**Status:** intermediate runtime evidence; no compiler changes and no CI claim  
**Runtime:** Node.js v22.16.0

## Purpose

This standalone matrix extends Agent 24's 11-case active-frame witness set with three related operation families that the shared effect contract did not explicitly describe:

1. Generic ECMAScript ToPrimitive / ToPropertyKey conversion hooks.
2. PromiseResolve thenable-assimilation property access during await / async return.
3. Additional Proxy internal-method traps reached through standard Object intrinsics.

The script is intentionally sloppy CommonJS. Legacy caller-chain controls require sloppy active functions; separate strict-mode cases use V8 CallSite metadata to distinguish FramePosition from ExactSource.

## Reproduction

~~~sh
node sims/agent50-implicit-dispatch-extension.js
~~~

The script has no third-party dependencies. It emits one JSON line prefixed with AGENT50_IMPLICIT_DISPATCH_EXTENSION and asserts every expected result.

## Results

**Node 22.16.0 local run: 22/22 controls passed.**

- **10 ToPrimitive / ToPropertyKey controls:** value + 1 / @@toPrimitive default hint; value < 2 / @@toPrimitive number hint; computed member key / ToPropertyKey string hint; computed ObjectPattern key; computed ObjectExpression key; left operand of in; computed delete key; numeric valueOf fallback; string toString fallback. Nine sloppy-mode analyzed functions have no CallExpression for the conversion and the hook's external callback captured exact function source. A tenth explicit strict-mode + case still exposed FramePosition through Error.prepareStackTrace but not the function object/source. The four added key contexts prove the same ToPropertyKey hook runs in object destructuring, object-literal construction, in, and delete syntax.
- **2 composition controls:** two object operands to one + expression dispatch ToPrimitive twice (left then right) at the same operator span; one computed member expression dispatches ToPropertyKey on the key and Proxy [[Get]] on the receiver at the same member span. Both callbacks capture the same active function source. These controls demonstrate why operation-span identity alone is insufficient: each effect needs its own operand role / effect identity.
- **3 thenable controls:** await in sloppy async function, await in explicit strict async function, and async return. The thenable's then getter runs while the async frame is present. Sloppy cases expose a CallSite function object and exact source; strict case exposes function name and file/line/column but no function object.
- **7 Proxy controls:** Object.defineProperty / [[DefineOwnProperty]], Object.setPrototypeOf / [[SetPrototypeOf]], Object.preventExtensions / [[PreventExtensions]], Object.isExtensible / [[IsExtensible]], Proxy [[GetOwnProperty]] / getOwnPropertyDescriptor, Proxy [[Call]] / apply, and Proxy [[Construct]] / construct. The four Object intrinsic traps expose FramePosition; apply/construct additionally expose the active function object and exact source through V8 CallSite.getFunction. The preventExtensions trap runs before the engine throws an invariant TypeError.

## Interpretation

The shared HostEffectKind already has WebIDLStringConversion and PromiseHandlerDispatch, but the current contract does not define generic ToPrimitive dispatch or PromiseResolve's implicit Get("then") on thenables. ProxyInternalMethod is present but its explicit list did not enumerate the remaining traps above.

Recommended contract coverage:
- Add ToPrimitiveDispatch / CoercionDispatch with operation, hint, operand span and hook provenance, or conservatively emit UnknownHostEffect for unknown object coercions.
- Define PromiseHandlerDispatch to include PromiseResolve thenable Get("then") (including accessor and Proxy Get) during AwaitExpression and async-function return, or add PromiseThenableAssimilation.
- Make ProxyInternalMethod exhaustive for all 13 Proxy traps, or make Object/Reflect intrinsic summaries depend on receiver provenance and conservatively mark possible Proxy dispatch.
- Preserve independent ObservationEffect bits. In the tested strict case, FramePosition is visible but ExactSource / CallableMetadata are not.

## Observed effect separation

| Witness family | DynamicFrame | FramePosition | ExactSource |
| --- | --- | --- | --- |
| Sloppy ToPrimitive / ToPropertyKey (9 controls) | Yes: hook callback executes under analyzed function | Not separately measured by stack in these controls | Yes: caller chain returns the active function; Function.prototype.toString recovers source |
| Strict ToPrimitive (1 control) | Yes: hook callback executes under analyzed function | Yes: CallSite function name and file/line/column | No: CallSite.getFunction() is undefined |
| Sloppy thenable getter during await / async return | Yes: getter callback runs before suspension | Yes: active async frame in CallSite | Yes: CallSite.getFunction() and Function.prototype.toString |
| Strict thenable getter during await | Yes: getter callback runs before suspension | Yes: active async frame in CallSite | No: CallSite.getFunction() is undefined |
| Proxy Object.* internal methods (5 controls, including [[GetOwnProperty]]) | Yes: trap callback runs under analyzed function | Yes: name and file/line/column | No: native intrinsic path yields no CallSite function object |
| Proxy apply / construct (2 controls) | Yes: trap callback runs under analyzed function | Yes: active frame in CallSite | Yes: CallSite.getFunction() and Function.prototype.toString |

CallableMetadata is not separately asserted in this script. Where a function object is recovered, metadata may be observable, but that requires its own explicit control. The table records only directly observed source/position effects and the active-frame edge.

The two composition controls also show why HostEffectRecord must distinguish multiple effects at one SourceSpanId: a binary operator may coerce both operands, and a computed member expression may coerce its key and then invoke a Proxy Get on the receiver. Use a per-effect identity and operand role/path, plus a separate ActiveFrameEdge; do not key the observed value only by the source span.


## Proxy trap coverage map across the two Node matrices

| Proxy internal method | Handler trap | Witness operation | Reproducer |
| --- | --- | --- | --- |
| [[Get]] | get | Object destructuring | sims/agent24_implicit_dispatch_active_frame_matrix.js |
| [[Set]] | set | Property assignment | sims/agent24_implicit_dispatch_active_frame_matrix.js |
| [[HasProperty]] | has | in operator and with environment | sims/agent24_implicit_dispatch_active_frame_matrix.js |
| [[Delete]] | deleteProperty | delete expression | sims/agent24_implicit_dispatch_active_frame_matrix.js |
| [[OwnPropertyKeys]] | ownKeys | for-in enumeration | sims/agent24_implicit_dispatch_active_frame_matrix.js |
| [[GetPrototypeOf]] | getPrototypeOf | for-in enumeration | sims/agent24_implicit_dispatch_active_frame_matrix.js |
| [[DefineOwnProperty]] | defineProperty | Object.defineProperty | sims/agent50-implicit-dispatch-extension.js |
| [[SetPrototypeOf]] | setPrototypeOf | Object.setPrototypeOf | sims/agent50-implicit-dispatch-extension.js |
| [[PreventExtensions]] | preventExtensions | Object.preventExtensions | sims/agent50-implicit-dispatch-extension.js |
| [[IsExtensible]] | isExtensible | Object.isExtensible | sims/agent50-implicit-dispatch-extension.js |
| [[GetOwnProperty]] | getOwnPropertyDescriptor | Object.getOwnPropertyDescriptor | sims/agent50-implicit-dispatch-extension.js |
| [[Call]] | apply | Proxy function call | sims/agent50-implicit-dispatch-extension.js |
| [[Construct]] | construct | Proxy constructor call | sims/agent50-implicit-dispatch-extension.js |

This is complete trap-family coverage across two separate Node/V8 witness scripts, not one combined test execution and not a browser compatibility claim.

## Limitations

These are Node/V8 22.16.0 runtime witnesses, not compiler regressions or cross-browser claims. Sloppy caller-chain controls establish exact source capture only in the tested sloppy contexts. Stack-based strict-mode controls establish FramePosition, not exact source. Agent 50's seven Proxy tests cover DefineOwnProperty, SetPrototypeOf, PreventExtensions, IsExtensible, GetOwnProperty, Call and Construct. Agent 24's separate sims/agent24_implicit_dispatch_active_frame_matrix.js covers Get, Set, Has, DeleteProperty, OwnKeys and GetPrototypeOf. Together, the two independently validated Node matrices span all 13 standard Proxy traps; this is a coverage inventory, not a single combined test run or browser claim. A Chromium 144 headless attempt timed out before returning DOM for both a data URL and the local test page, so no browser-runtime result is claimed. No production source, integration PR, workflow, release status, or 2.5x performance claim changed.
