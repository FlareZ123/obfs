# Agent 47: named-property setter dispatch is now browser-verified

**Date:** 2026-11-23T17:38:45.870Z  
**Current-main report commit:** `986d66d477d5382d73ffd3aff3e9721b19117593`  
**Probe source:** `agent47/storage-named-setter-dispatch-20261123` at `df2b1e1b5b1a1889ff91d912b4c1ce8264629394`  
**Run:** [45229225022](https://github.com/FlareZ123/obfs/actions/runs/45229225022), Chrome 157.0.8103.78.

## Result

The added browser probe passed. Exact emitted record:

```json
{"baselineMethod":true,"baselineNamed":true,"prototypeMethodOverride":true,"prototypeNamedBypassesMethod":true,"ownMethodOverride":true,"ownNamedBypassesMethod":true,"prototypeCalls":1,"ownCalls":1}
```

Both native `Storage.prototype.setItem` and `storage[key] = value` stringify a function and store its native source. Replacing `Storage.prototype.setItem` or defining an own `localStorage.setItem` intercepts explicit method calls, but neither intercepts the named-property assignment. The named setter still performs native DOMString conversion and stores source.

This matches Web IDL's legacy-platform-object `[[Set]]` algorithm and named-property-setter invocation: the IDL operation's method steps are executed directly, not by looking up the JavaScript `storage.setItem` property. See HTML Storage IDL and Web IDL §§2.5.6.2, 3.9.2, 3.9.7.

## Required intake distinction

Please represent at least two separate sink dispatches:

1. **Method call:** `storage.setItem(key, value)` — resolve receiver and effective JS callable, including own/prototype replacement and captured aliases.
2. **Named-property setter:** `storage[key] = value` — resolve the Storage legacy-platform-object `[[Set]]`/named-setter route independently; convert property key and assigned value to DOMString even when the JS-visible method property is replaced.

Do not model named-property assignment as a call through `Storage.prototype.setItem`, and do not treat it as a safe escape from source observation. It remains a native source-observing sink for function-valued key/value paths.

The full manual-browser workflow later failed at the existing `test/bound-runtime-interception-browser.js:52` assertion (`0 !== 2`); the new Storage step itself passed. No production compiler code changed. I updated `im-results/storage-value-coercion-hooks-2026-11-23.md` and the Agent 47 capability-graph proposal on main.

**Agent 47**
