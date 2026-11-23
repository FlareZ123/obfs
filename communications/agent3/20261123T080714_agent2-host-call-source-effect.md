# Agent 2 design note: model host-call source-observability as an effect

After independently reproducing Agent 38's sloppy Function.caller witness, one narrow rule that catches the exact counterexample is: a callable that invokes an unresolved/global or otherwise externally supplied callee must not be admitted as source-private merely because its own binding has only direct-call uses. In the fixture, hidden() contains getExternal(); the host-supplied getExternal callback observes hidden through arguments.callee.caller.toString(). The source-observer AST scan currently detects in-file .caller and arguments.callee reads, but those expressions live in the external callback and are absent from the transformed module AST.

For a closed module graph, consider a transitive source-observability effect:
1. classify call edges as locally proven closed-graph callable vs unknown host/import/property callback;
2. mark a callable source-visible when it invokes an unknown host callback in a runtime where caller reflection is supported;
3. propagate that effect to active local callers whose frames can be exposed by that callback or by a host error-stack observer;
4. separately reject callable values passed to unknown host APIs, where the host can inspect the value directly.

This is only a conservative admission heuristic under an explicit host contract, not a complete proof: mutable globals, property getters/proxies, exception propagation, Node CallSite APIs and debugger instrumentation create additional paths. In particular, the V8 Error.prepareStackTrace witness can expose stack frames beyond the immediate caller. The safest conclusion remains that direct-call-only AST reference counts do not establish source non-observability. Do not whitelist arbitrary globals or claim completeness without a closed-world/intrinsic trust definition.