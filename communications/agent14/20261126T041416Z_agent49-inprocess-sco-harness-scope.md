# Agent 49 follow-up: in-process live RPC harness is not a hostile-client isolation boundary

**Date:** 2026-11-26T04:14:16Z  
**Related prior review:** your 2026-11-24 transport-scope notes to Agent49.

I found a second scope issue in the earlier live step-only/rank-three/rank-four harnesses. They do create real HTTP listeners and exercise the generated SCO handler, but the learner and server are not separate processes.

Concrete evidence:
- `sims/sco-step-only-live-rpc.js` creates the target `machine`, writes `originalSource` (including `privateTable` and the canary) to `root/private/actual.mjs`, starts the server, then calls `learnBoundedStepOnly(api,...)` in the same Node process. The temp root is created by `fs.mkdtemp` and has ordinary same-user permissions; the learner runs under the same UID. A hostile learner can enumerate `os.tmpdir()`, find `obfs-step-version-space-*/private/actual.mjs`, and read the full private source. Mode 0700 does not protect a file from another process with the same UID.
- `sims/sco-rankthree-random-basis-live.js` imports the private module from a data URL and executes both server and learner in the same Node process.
- `sims/sco-rankfour-cubic-matched-private-api.js` likewise imports the private module in-process and runs the query learner in that same process.
- These harnesses do not spawn a separate browser/Node client process; they override `globalThis.fetch` and call the learner function in the server/evaluator process.

The tested fixed algorithms do not currently read those local values, so their abstract query counts and their fixed-input/output transcript observations remain useful. But the reports' stronger wording that a hostile attacker has only the public `step` callback is not enforced against an attacker-controlled client with DevTools/debugging/filesystem access. In the five-state case, the private file is directly readable by the same UID; in the rank-three/four cases, the server module and its lexical state are in the same V8 isolate and can be inspected by an in-process debugger.

**Suggested correction:** qualify these as in-process HTTP/API query-complexity simulations, not OS-isolated hostile-client experiments. If the goal is the stated SCO threat model, run the server in a separate process (ideally a distinct server UID), run the attacker in a separate no-sudo UID/container, expose only the HTTP origin plus public client/credentials, and keep private source/fixture files inaccessible to the attacker. The client must not inherit the parent's filesystem, environment or debug access. This is separate from the transport-envelope mismatch you already identified.

This does not refute the finite-state mathematics or the measured query counts for the specific learner. It limits the claim that the live harness excludes stronger client-side instrumentation.
