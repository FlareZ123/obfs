# Real before-and-after SCO sample: server-private keyed module

This directory includes a genuine source-to-public-facade transformation made by the repository's `partitionScoAsyncModule`. The generated artifact is committed alongside its original so readers can inspect actual output instead of an invented illustration.

| File | Role |
| --- | --- |
| [`before-private.mjs`](before-private.mjs) | Original ESM implementation containing server-only Node crypto imports, secret-key environment lookup, argument validation and 15,000 rounds of HMAC-SHA256 |
| [`after-public.mjs`](after-public.mjs) | **Byte-exact compiler-generated** browser/Node ESM RPC facade; public source contains one async `derive(value)` export, a seed-derived method ID and a shared fetch helper; no key, HMAC rounds or implementation body |
| [`build-sample.cjs`](build-sample.cjs) | Deterministically regenerate the public facade using `serverOnlyInitialization:true`, or check the committed artifact for drift; writes atomically |
| [`server.cjs`](server.cjs) | Runnable Node HTTP server that loads the original ESM privately, serves only the generated facade, and authorizes source/RPC requests through HTTP Basic demo credentials |
| [`test/sco-real-example.test.js`](../../test/sco-real-example.test.js) | Live HTTP, native/remote equivalence, source-publication checks, and deterministic snapshot check |

## What changes

The original private function is an actual asynchronous HMAC operation taking 128-bit lowercase hex and returning 256-bit lowercase hex. `partitionScoAsyncModule` isolates its publicly callable interface by parsing the original source. It keeps the module's imports and key material server-side, then generates a small wrapper that invokes the configured same-origin `/obfs/rpc` endpoint. The code sent to the browser is exactly the checked-in `after-public.mjs`.

The stable seed in `build-sample.cjs` makes **this example** reproducible; it is not a cryptographic secret. In a deployment, do not reuse a predictable method identity if rotation is desired. The property most relevant to confidentiality is that the trusted server never distributes the private key or implementation body.

## Run on Windows 11 with PowerShell 7

From the repository root after installing dependencies:

```powershell
$env:OBFS_SCO_DEMO_KEY = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
$env:OBFS_SCO_DEMO_PASSWORD = Read-Host "Choose a demo password of at least 12 characters"
node .\examples\sco-private\build-sample.cjs --check
node .\examples\sco-private\server.cjs
```

Open `http://127.0.0.1:8080/`. The server asks for HTTP Basic credentials; use username `demo` and the password you entered. The page imports `/obfs/public.mjs` and renders the keyed result. `/obfs/before-private.mjs` is never served by the SCO handler. The server returns HTTP 403 to unauthenticated reads/RPC and restricts its protected operation to a valid one-argument input.

For a self-contained automated check, the existing test launches the server with a newly randomized key, loads the exact committed public file as a Node ESM client, performs authorized HTTP RPC, and compares responses with the original private function. Source and RPC authentication-denial tests run in the same fixture.

## Security and performance limits

- The Basic credential mechanism is only for **localhost demonstration**. Passwords must be protected by TLS across networks; production deployments need secure account/session validation, revocation, appropriate authorization, rate limits and operational controls. The demo does not implement a production security policy.
- Legitimate users can ask the service to evaluate any permitted input. It remains an online oracle; source confidentiality is distinct from inability to query or relay its behavior.
- Static client inspection and normal browser DevTools expose the generated fetch helper and inputs/outputs. They do not expose undistributed Node server files or a server-held environment secret under the trusted-server assumption.
- The paired [high-entropy cost study](../../im-results/sco-high-entropy-prf-2026-11-15.md) measured 0.96× to 1.03× RPC/local on two loopback runners for the same 15,000-round workload. Real browser and network latency differ. The separate [one-round key-search study](../../im-results/sco-key-entropy-2026-11-15.md) found 187–216× RPC/local overhead and a successful 16-bit-key attack. Neither study proves universal 2.5× performance or cryptographic security.
- COO and SNO do not share SCO's trusted-server isolation under their stated full-control threat models.

This example is a concrete deliverable and an explicit **opt-in** partition. It does not claim automatic behavioral equivalence for arbitrary JavaScript modules; the partition API accepts only a proven syntactic subset and JSON-compatible method behavior.
