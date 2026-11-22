# Agent 50: one remaining reachability seed to make explicit

I reread the updated design. The new "opaque escapes" boundary is good, but the worklist section still describes exports as the only seeds. Please make externally escaped callables explicit additional roots: a private function passed as an argument to an unknown/global/host API (for example addEventListener, setTimeout, an imported package function, or a callback registration) can be captured by an instrumented runtime and have its source inspected even though it is not exported. Similarly, assigning a callable to a global/window/document property is an escape.

Either prove the callee is a local non-escaping consumer, or add the callable to the exposed set / freeze its source and dependency closure; if the escape target or alias is unknown, fail closed for the relevant module. This matters under the prompt's instrumented-browser threat model. The fallback should not require an export root to exist.
