# Agent 50: released runnable before-and-after SCO example, live auth, and pinned cross-platform tests

Sender: **Agent 50**. 2026-11-15 13:35 UTC.

In response to the [maintainer's advanced-method + real-sample directive](2026-11-15T1240Z_maintainer_advanced-obfuscation-directive.md), I added a **real, reproducible SCO before-and-after source transformation** rather than only unit-test snippets:

- [`examples/sco-private/before-private.mjs`](../../examples/sco-private/before-private.mjs): server-private ESM implementation using a 256-bit key from a required environment variable, and a 15,000-round HMAC-SHA256 exported async method.
- [`examples/sco-private/after-public.mjs`](../../examples/sco-private/after-public.mjs): exact generated ESM client RPC facade from the real `partitionScoAsyncModule` builder, committed for inspection.
- [`examples/sco-private/build-sample.cjs`](../../examples/sco-private/build-sample.cjs): deterministic generator with byte-for-byte `--check`, atomic update, and cross-platform LF enforcement.
- [`examples/sco-private/server.cjs`](../../examples/sco-private/server.cjs): runnable localhost HTTP server that keeps the original and secret key server-side, serves only the public facade, and gates source and RPC with a demonstrative Basic auth policy.
- [`test/sco-real-example.test.js`](../../test/sco-real-example.test.js): exercises the actual served transformed client, validates native-vs-RPC results for independent inputs, rejects unauthenticated GET/RPC, denies publication of the private source, and asserts the published facade contains no key-bearing implementation.
- [`examples/sco-private/README.md`](../../examples/sco-private/README.md): reproducing and running on Windows 11, limitations and trust model. Root README links to sample.

**Immutable evidence:** manual SCO oracle [run 43719354840](https://github.com/FlareZ123/obfs/actions/runs/43719354840), pinned commit `6572d764cb212c3ab50fdf084df7046ab9aac4f3`, **green Ubuntu and Windows**, including actual sample generation and live integrated behavior plus strict JSDoc checks. Earlier [43719158729](https://github.com/FlareZ123/obfs/actions/runs/43719158729) exposed Windows CRLF snapshot drift and incorrect assumption that the SCO handler emits a byte-identical untransformed proxy; both cases were fixed before green. The committed before/after artifact matches the code generator with LF.

Scope: This is **server-controlled obfuscation** with a meaningful trust boundary. It does not establish general static deobfuscation resistance for COO/SNO, or protection from authorized online oracle queries. HTTP Basic is test-only (localhost), not a production credential implementation. The paired experimental high-entropy workload met the 2.5× budget on tested loopback runners; production WAN/browser budget remains unverified. See `im-results/sco-high-entropy-prf-2026-11-15.md`, `im-results/sco-key-entropy-2026-11-15.md`.

Others are welcome to adversarially test the real example and compare its security/coverage against VM and Wasm variants with the same honest executable-sample standard.
