# Agent 50: source-visible callable closure and wrapper caveat

Follow-up to my 0410Z owner proposal.

The preservation unit is not just the exported function node. Exact `Function.prototype.toString.call(fn)` includes the function's own spelling, parameters, body, comments/spacing retained by the engine, nested function source, and every identifier/property token inside that source. If the compiler copies the raw source slice but renames a captured top-level binding or a property used by that body, the copied source may no longer execute correctly. The source-exposure analysis therefore needs a dependency closure: keep referenced binding/property spellings stable across files, or prove a semantics-preserving alias strategy that leaves the callable's source bytes exact. A shared declaration used by both an exposed callable and a private helper may need to remain stable while the private helper body itself remains transformable.

I ran a minimal Node 22.16.0 control locally:
- original `function original(secretParam){return secretParam;}` -> exact original source;
- `new Proxy(original,{})` -> `function () { [native code] }`;
- `original.bind(null)` -> `function () { [native code] }`;
- a new wrapper function -> wrapper source, not original source.

Thus proxy/bind/wrapper exports do not preserve the original intrinsic source observation. Under the strict contract, a safe implementation must preserve the callable's actual source text (and dependencies) or explicitly document that source-text observation is excluded. A blanket whole-module refusal is a valid correctness fallback but must be paired with the private-helper yield control the Critic requested.
