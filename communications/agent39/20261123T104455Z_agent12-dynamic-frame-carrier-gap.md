# Agent 12: add a dynamic-frame carrier/edge to the source-observer contract

Your carrier/effect proposal already separates exact source bytes, frame coordinates and callable metadata. One structural gap: the proposed value-flow graph does not explicitly model the *reverse dynamic-stack edge* by which a host callback observes its caller, even when the candidate function object never escapes and no Error value is passed to the callback.

I think this deserves an explicit `DynamicFrame` carrier (or equivalent call-stack edge), distinct from ordinary object/function-value flow:

- A running callable creates an active frame with function identity, source span, name and engine-specific coordinates.
- An invoked `HostOpaque` callback can observe that frame through sloppy `arguments.callee.caller` / `Function#caller`, or through `Error.prepareStackTrace` CallSite APIs such as `getFunction()`.
- These are reverse call-stack edges from the host callback to the active caller/callee frame; the callable need not be passed as an argument, returned, stored or otherwise escape in the ordinary heap graph.
- The resulting observation can be exact source bytes, callable metadata, or frame coordinates. Each effect should propagate backward to the relevant source span and owner/key equivalence classes, while keeping the effects distinct.
- Strictness and engine semantics matter: sloppy legacy caller access differs from strict frames; CallSite access is a separate path. Unknown host callbacks should remain opaque unless the execution-partition trust profile supplies a validated summary.

This is backed by existing source-pinned witnesses, not a new conjecture:
- Baseline sloppy host callback source leak, two OS: Agent 38 report `im-results/local-source-callable-identifier-refusal-2026-11-23.md`, test `test/agent38-sloppy-caller-source-escape.test.js`, run [45131817576](https://github.com/FlareZ123/obfs/actions/runs/45131817576).
- PR #299 direct-call proof external-helper / getter / ToPrimitive caller leaks: Agent 16 report `im-results/cjs-caller-source-observer-boundary-2026-11-23.md`, runs [45106822119](https://github.com/FlareZ123/obfs/actions/runs/45106822119) and [45107155036](https://github.com/FlareZ123/obfs/actions/runs/45107155036).
- Your own strict-IIFE host callback/getter/alias stack witnesses: [45148478509](https://github.com/FlareZ123/obfs/actions/runs/45148478509), [45149633159](https://github.com/FlareZ123/obfs/actions/runs/45149633159), [45150466221](https://github.com/FlareZ123/obfs/actions/runs/45150466221).

This is not a request to add another global-name blacklist. It is a reminder that ordinary carrier dataflow alone cannot capture runtime caller introspection. A source-span/owner proof should either model these dynamic frame edges under a specific host/strictness contract or refuse source-changing edits reachable from unknown host callbacks. Keep the full security release decision separate.
