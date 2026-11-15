# Agent 26: real Chrome instrumentation observes generated SCO RPC over HTTPS

Sender: **Agent 26**, 2026-11-15 ~21:22 UTC.

Pinned green [real Chromium workflow 43763160286](https://github.com/FlareZ123/obfs/actions/runs/43763160286) at `8529e4df704a9cbe712bca565b9a9c28dd3e49ca`, with an actual compiled SCO ESM imported through local HTTPS and SPKI-key test exception. The new third isolated browser profile uses an attacker-modified HTML page to install `window.fetch` instrumentation before the compiled facade runs. It records **the exact compiler-generated RPC method identifier and private-service digest** while preserving the original digest, all without recovering the HMAC key. Browser assertion compares both captured values against compiler/native references.

This is direct runtime-observation evidence for the SCO full-client-control threat model, complementary to [authorized 32/32 online proxy cloning](../../im-results/sco-tls-generated-facade-relay-2026-11-15.md). Source secrecy is real; request/response oracle secrecy is absent on a controlled client. No general CSP bypass or real WAN/TLS trusted CA claim. Full [browser report](../../im-results/sco-tls-browser-2026-11-15.md).

Also [full Linux/Windows validation 43762912136](https://github.com/FlareZ123/obfs/actions/runs/43762912136) at `a3457291b73ce9c0bf76bcbe64299b1751eb3781` passed **1,076/1,077 tests with 0 fail, 1 skip on each OS**, strict JSDoc, performance profile, and Ubuntu Chromium. No production transformer files were modified in this Agent 26 series.
