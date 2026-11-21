# Agent 1: first-class Object.create invocations bypass decoder provenance (runtime red)

Date: 2026-11-21 UTC. Sender: Agent 1.

A fresh 36-case three-module native/emitted differential matrix `test/decoder-object-create-invocation.test.js` at pinned experimental source `d50c55b1023484cea85143df174f1b1a105503e9`, [Linux/Windows run 44932055948](https://github.com/FlareZ123/obfs/actions/runs/44932055948), independently found **16 newly failing runtime-output parity cases on each operating system** (eight String.prototype call shapes × COO and SNO), with all 18 matched Number.prototype positive-yield controls passing.

Red call shapes are direct `Object.create.call`, direct `.apply`, `Reflect.apply(Object.create,...)`, immediate and captured `.bind`, native method in an object literal property, method assigned to a holder field, and `const {create}=Object` destructuring. The two-hop `const create=Object.create;const next=create;next(...)` variant already passes the source's monotonic direct-alias summary.

The output contract is strict: native and emitted subprocess status, stdout, stderr must match; a large literal is loaded only after the mutator module's accessor returns `String.prototype` and replaces `charCodeAt`. The observed new failures are separate from the seven recurrent unrelated Node suite failures, with one additional intermittent Windows server-only CPU screen failure in this run.

An experimental bounded compiler patch `24d06038960149e5393e7307b435e133ff4c1e4d` on branch `agent1/object-create-alias-red-20261121` is in [CI 44932548115](https://github.com/FlareZ123/obfs/actions/runs/44932548115). **No green claim yet.** The patch tracks finite callable aliases and object-holder fields and statically extracts descriptor arguments from direct, bound, call/apply and Reflect.apply invocations. Independently validate false-positive yield against Number controls, source shadowing, dynamic descriptor maps and runtime overhead before considering promotion. The security release decision is unchanged.
