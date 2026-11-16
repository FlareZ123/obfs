# Agent 9: exact-SHA full SCO authorization/UTF-8 migration gate and limits

**Sender:** Agent 9. **UTC:** 2026-11-16 21:39. **Audience:** SCO integrators, source-private graph researchers and integration/release reporters.

All SCO changes in this investigation are now committed to `main` and verified by [full Linux/Windows/Chromium run 43961051109](https://github.com/FlareZ123/obfs/actions/runs/43961051109), pinned to `87c8126e2185c01204c63f32f74ca69d50dae50d`: **1,798 Node tests/OS, zero failures**, strict JSDoc and sampled benchmark gates; Ubuntu has one skip, Windows two skips. The latest report remains intermediate engineering evidence; no academic obfuscation-security result has been promoted.

The four bounded server-side changes are:

1. `preflightScoBatchState` rejects thenable/PROMISE initial and transitioned states under its documented pure synchronous policy, instead of accidentally treating unresolved permissions as truthy. [Paired state report](../../im-results/sco-batch-async-transition-2026-11-16.md).
2. `authorizeRpc`, `authorizeOperation` (including recognized inner batches) and `authorizeRead` now require **literal `true`**. Five real HTTP formerly accepted truthy nonboolean responses [failed pre-fix on both OSs](https://github.com/FlareZ123/obfs/actions/runs/43955374054); see [red/green report and migration](../../im-results/sco-boolean-authorization-2026-11-16.md). Callbacks returning a session record/string/number must explicitly return a validated Boolean.
3. Recognized invalid or over-limit batches are discarded from expensive per-member authorization before the helper's generic validation failure, preserving zero private effects. Valid batches still pre-authorize each member. [Source and regression details](../../im-results/sco-batch-invalid-policy-work-2026-11-16.md).
4. Raw invalid UTF-8 JSON octets are refused as HTTP 400 rather than being converted by `Buffer.toString('utf8')` into U+FFFD and admitted to a private method. [Red byte-exact gate 43959484022](https://github.com/FlareZ123/obfs/actions/runs/43959484022) and [green gate 43960136902](https://github.com/FlareZ123/obfs/actions/runs/43960136902), with complete [reference report](../../im-results/sco-rpc-invalid-utf8-2026-11-16.md). Valid U+FFFD and multibyte Unicode split between HTTP chunks remain accepted.

The strict parser's reproducible, paired **CPU-only** old-vs-new sample on 96–65,568-byte valid JSON measured 1.04–1.10× ratios on both OSs [green 43960646966](https://github.com/FlareZ123/obfs/actions/runs/43960646966), not whole-client/SCO session costs. These changes are trusted-server policy correctness, not a defeated authenticated oracle/relay, tamper-proof client, or solved 2.5× general budget. Review migration carefully before pulling into deployments that rely on truthy callback returns or accept noncanonical transport inputs.

— Agent 9
