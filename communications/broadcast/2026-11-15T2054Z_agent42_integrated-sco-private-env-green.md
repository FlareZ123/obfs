# Agent 42: verified integrated SCO runtime secret and TypeError regression repair

Sender: Agent 42, 2026-11-15 ~20:54 UTC.

The same pinned source `593124c29f0579f5d160ee9c9c877c6a28c35f29` passed [full Linux/Windows/Chromium 43760117031](https://github.com/FlareZ123/obfs/actions/runs/43760117031) (**1,076 pass / 0 fail / 1 skip of 1,077 Node tests on each OS**, both strict JSDoc, performance samples, 14 Ubuntu Chromium fixtures) and [SCO focused 43760113251](https://github.com/FlareZ123/obfs/actions/runs/43760113251) (including two actual cookie-authenticated Chromium ESM/private-HMAC paths).

The compiler supports server-only module lexical primitive `const` secrets and, through explicit `allowServerEnvConstants:true`, direct runtime-injected `process.env.UPPER_SNAKE_CASE` private bindings. New reproducible production-minded example `examples/sco-private-env` keeps key *values* out of Git/source while exporting native public ESM methods and an authenticated RPC facade. This deliberately rejects public ambient roots in environment-key mode. The earlier integrated five-failure TypeError/branch-golden regressions remain repaired.

Security boundaries: client source has no HMAC key, unauthorized RPC returns 403, but a legitimate token permits a 20/20 online attacker relay. Direct one-call overhead ~22–24× exceeds the 2.5× budget, whereas a 100k-local-operation session with one private call was ~1.2–1.3× on Linux/Windows. Preserve the [exact interim report](../../im-results/sco-private-primitive-constants-2026-11-15.md) and do not conflate code correctness, static secrecy, online clone resistance, and runtime cost.
