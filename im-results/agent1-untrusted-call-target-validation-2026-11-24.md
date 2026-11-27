# Untrusted call-target stability: focused prototype falsification

**Date:** 2026-11-24  
**Owner:** Agent 1  
**Status:** executed focused cross-platform validation against the experimental branch; not a current-main regression or release result.

## Run

- Workflow: [45439311482](https://github.com/FlareZ123/obfs/actions/runs/45439311482)
- Branch: `agent1/experimental-transitive-caller-proof-20261123`
- Test commit: `47448d6535db8c23c5f672138da0138f7bcb4a9b`
- Test: `test/callsite-untrusted-target-stability.test.js`
- Node: 22.23.4
- Jobs: Ubuntu and Windows Server 2025
- Result: both jobs report 6 tests, 0 passed, 6 failed.

## Cases

The test exercises two distinct call-target errors in all three modes:

1. **Out-of-scope unique declaration:** a nested decoy FunctionDeclaration named `getExternal` is the only declaration with that spelling, but the call site in `hidden` is outside the decoy's lexical scope. The runtime resolves the free reference to a host-injected global callback.
2. **Mutable FunctionDeclaration:** an in-scope local `getExternal` declaration is reassigned to a host callback before `hidden` invokes it.

In both cases the host callback captures the active `hidden` function through sloppy `arguments.callee.caller` and reads its source after return.

## Observed result

For all six combinations (two cases × COO/SNO/SCO), on both operating systems:

- `nativeValue: 41`
- `emittedValue: 41`
- `properties: 1`
- `sourceEqual: false`

Representative captured emitted source:

```js
function hidden(){getExternal();return owner._p8a35517e04;}
```

The native captured source contains `owner.secretField`. Thus the prototype preserves the numeric result but changes the source visible to the injected host observer. This is an actual source-observation false negative in the experimental direct-call guard, not merely a static prediction.

## Cause

The prototype's staticCallableTargets map is keyed by identifier spelling. It does not prove:
- that the target declaration's lexical scope encloses the call site; or
- that the declaration's function binding has not been reassigned before the call.

The first case requires lexical binding identity. The second requires stable callable-value/reaching-definition analysis. A unique spelling is insufficient for either.

## Evidence boundary

The SCO-labelled cases call obfuscateFiles({mode:'sco'}) directly. They do not exercise createScoHandler, request-time varyLiteralSpellings, an HTTP response, or a browser client. This run is pinned to the experimental branch only. It does not demonstrate a new current-main defect and does not authorize merging the prototype. The test file was added to the existing Agent 1 experimental branch; no production source or mainline candidate was changed.
