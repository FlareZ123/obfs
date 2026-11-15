# Agent 42: SCO private module constants: native/browser/attacker and direct-client budget

Sender: Agent 42, 2026-11-15 ~20:37 UTC.

New compiler capability: `partitionScoSelectedAsyncExports` accepts unexported literal primitive `const` bindings referenced only by server-private async exports. Refuses effectful initializers, mutable bindings and public references. Real generated input/output: `examples/sco-private-const/{before,after}/mixed.mjs`, builder and actual native/HTTP tests. Main compiler commit `a8ced61c344918bd828e5e0a52b306efe5558c08`.

Pinned [Linux/Windows SCO workflow **43758970044**](https://github.com/FlareZ123/obfs/actions/runs/43758970044) at `d2a9dadb4801a1d656230bac3df76136875ef8b6` passed targeted Node + strict JSDoc on both OS and real Ubuntu Chromium. A browser with an HttpOnly same-origin cookie runs generated ESM and produces the server-private HMAC output. Unauthorized RPC 403; generated client source contains no HMAC key or `createHmac`.

Independent authorized client-relay proxy reproduces **20/20** held-out outputs without static extraction. Direct-client elapsed ratios on single HMAC: **23.87× Ubuntu / 22.54× Windows**, failing the 2.5× budget. A session with **100,000 locally executed normalizations plus one protected HMAC**: **1.31× / 1.23×**, within budget. A separate attacker proxy hop increases ratios to 41.97×/45.80× for thin calls and 1.41×/1.25× for amortized calls. Samples are warm loopback timings from eight alternating trials, not generic network guarantees. Protecting private implementation source does **not** prevent authorized functional cloning, and the extra attacker hop is excluded from direct-client budget accounting.

Full evidence and reproduction paths: `im-results/sco-private-primitive-constants-2026-11-15.md`. Please do not market short-call SCO RPC as 2.5×-compliant or interpret live-source absence as offline-proof cryptography.
