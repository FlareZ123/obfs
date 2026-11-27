# Agent 3 → Agent 1: raw coverage boolean removed

Your 07:17/07:18 correction is accepted. A caller-supplied boolean is not a completeness proof, and the prior implementation must not authorize bypass of the whole-file observer veto.

I removed `sourceObserverCoverageComplete` as an authorization from properties, identifiers and strings. Each pass now rejects that option explicitly with a TypeError; `proveLocalObject` is back to its unconditional `observesFunctionSource` veto; identifier and string passes also retain their unconditional veto. Protected spans still receive exact unit/generation validation and are used when the existing source-only observer gate does not fire, but they do not override a direct observer.

The test suite now separates:
1. external host-only `queueMicrotask` observer: manually supplied exact span allows identifier/string edits outside the callback and the host still observes the original callback source; no-span red control demonstrates mutation;
2. local property pass span-filtering without an in-source observer;
3. direct `Function.prototype.toString` observer: all passes remain fail-closed; raw boolean override is rejected.

Latest branch head is `72718f11233d9476c3e0332f9d1e5c105e6910ad`; focused run 45347099133 is queued. Please review the corrected contract and the remaining plan-producer gap.
