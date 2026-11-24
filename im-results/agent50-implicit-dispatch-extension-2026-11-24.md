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

**Node 22.16.0 local run: 18/18 controls passed.**

- **9 ToPrimitive / ToPropertyKey controls:** value + 1 / @@toPrimitive default hint; value < 2 / @@toPrimitive number hint; computed member key / ToPropertyKey string hint; computed ObjectPattern key; computed ObjectExpression key; left operand of in; computed delete key; numeric valueOf fallback; string toString fallback. Each analyzed function has no CallExpression for the conversion and the hook's external callback captured exact function source. The four added key contexts prove the same ToPropertyKey hook runs in object destructuring, object-literal construction, in, and delete syntax.
- **3 thenable controls:** await in sloppy async function, await in explicit strict async function, and async return. The thenable's then getter runs while the async frame is present. Sloppy cases expose a CallSite function object and exact source; strict case exposes function name and file/line/column but no function object.
- **6 Proxy controls:** Object.defineProperty / [[DefineOwnProperty]], Object.setPrototypeOf / [[SetPrototypeOf]], Object.preventExtensions / [[PreventExtensions]], Object.isExtensible / [[IsExtensible]], Proxy [[Call]] / apply, and Proxy [[Construct]] / construct. The four Object intrinsic traps expose FramePosition; apply/construct additionally expose the active function object and exact source through V8 CallSite.getFunction. The preventExtensions trap runs before the engine throws an invariant TypeError.

## Interpretation

The shared HostEffectKind already has WebIDLStringConversion and PromiseHandlerDispatch, but the current contract does not define generic ToPrimitive dispatch or PromiseResolve's implicit Get("then") on thenables. ProxyInternalMethod is present but its explicit list did not enumerate the remaining traps above.

Recommended contract coverage:
- Add ToPrimitiveDispatch / CoercionDispatch with operation, hint, operand span and hook provenance, or conservatively emit UnknownHostEffect for unknown object coercions.
- Define PromiseHandlerDispatch to include PromiseResolve thenable Get("then") (including accessor and Proxy Get) during AwaitExpression and async-function return, or add PromiseThenableAssimilation.
- Make ProxyInternalMethod exhaustive for all 13 Proxy traps, or make Object/Reflect intrinsic summaries depend on receiver provenance and conservatively mark possible Proxy dispatch.
- Preserve independent ObservationEffect bits. In the tested strict case, FramePosition is visible but ExactSource / CallableMetadata are not.

## Limitations

These are Node/V8 22.16.0 runtime witnesses, not compiler regressions or cross-browser claims. Sloppy caller-chain controls establish exact source capture only in the tested sloppy contexts. Stack-based strict-mode controls establish FramePosition, not exact source. The six Proxy tests cover six of the 13 traps, including [[Call]] and [[Construct]]; the other seven trap families need their own controls or a clearly justified conservative catch-all. A Chromium 144 headless attempt timed out before returning DOM for both a data URL and the local test page, so no browser-runtime result is claimed. No production source, integration PR, workflow, release status, or 2.5x performance claim changed.
