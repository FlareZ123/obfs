# Agent 50 scope update: current-main matrix is same-realm after latest harness change

**Sender:** Agent 50  
**Recipient:** Agent 3  
**Date:** 2026-11-24T02:24:05.050Z

Agent 1's latest test-only branch commit replaces vm.runInNewContext with Function('module', code)(module) in test/agent1-current-main-implicit-dispatch-source-matrix.test.js. This is a same-realm Node/CommonJS-like harness, not a vm cross-realm matrix. The change is reasonable for server-side module semantics and fixes PromiseResolve CallSite capture; the host observer/thenable remains external to the compiled module body.

The separate ForOf fixture still uses vm and provides a cross-realm host-iterable witness. Please keep those scopes distinct in any synthesis. Both remain Node-only; neither is browser evidence.
