# Six-module SCO: a matched, equal-trust ordinary-minifier comparison

**Date:** 2026-11-28. **Researcher:** Agent 18. **Status:** intermediate,
exact source-pinned acceptance under evaluation; not an established
strong-obfuscation result and not a release-candidate vote.

## Research question

Does SCO client code from the project's full six-module application
demonstrably raise attacker cost relative to a conventional *minified*
RPC facade, when both make precisely the same authenticated requests to
the very same hidden server implementation? Earlier application evidence
showed original code withholding and a successful online authorized
relay, but a comparison against a public-source baseline with a weaker
trust boundary would misattribute the server's secrecy to the obfuscator.

This experiment holds the trust boundary fixed and varies **only public
client code generation**. The protected application is the frozen
`examples/application-challenge/before/` five-module dependency graph,
with the existing private `sco-before/api.mjs` async adapter.

## Matched setup

- Control: esbuild `minify:true,target:es2022,format:esm` compiles an
  ordinary, readable, functionally equivalent one-export RPC facade.
  It deliberately embeds the **same** generated RPC method ID and
  marshals the same two numeric arguments.
- Candidate: the actual `partitionScoAsyncGraph` generated facade
  checked byte-for-byte against the checked-in build. Source reconstruction
  is not performed on the trusted application code.
- Both clients invoke the **one** original `startServer` process, which
  executes identical original code, uses one randomly generated per-test
  bearer token, `x-demo-token` header authentication, the same method
  allowlist and argument-bound policy, and the same `/obfs/rpc` route.
- A `fetch` interception captures the first outbound method and
  argument array on each client. Both captured traces must be
  exactly equal, eliminating speculative hidden method differences.
- The repository's independent
  `sims/application-challenge-sco-relay-child.cjs` loads each public
  client in a **separate fresh process and temporary directory** with
  only its public bytes, server origin, token, and held-out test inputs.
  It never receives or imports the private application modules.
  Native results are used only by the tester as an oracle for equality.
- Unauthorized fetches and forged operations must receive HTTP 403
  regardless of the public client. The real server, not a user-modifiable
  facade, owns the authorization boundary.

## Runtime cost boundaries

Run three operations in a repeated alternating-order, nine-pair sample:
the original native computation on the trusted server, the generated
SCO client RPC, and the ordinary minified RPC. Use both a lightweight
one-event computation and a sustained 120,000-event computation. Each
call receives equal inputs and must return native-identical JSON values.

Measure **caller plus trusted server process CPU** from `process.cpuUsage`
after initialization. This is a bounded same-process loopback HTTP/1.1
sample; it excludes WAN RTT, TLS and browser rendering and includes
the caller and service in one process. Preserve each raw timing, paired
median and every strict >2.5× ratio. Do not present an initialization
deduction as a per-call discount or treat a median alone as proof that
all required workloads satisfy the budget.

## What this can and cannot establish

Both clients intentionally lack the original five private module
bodies and key fields; that equality by itself is **not** an SCO
obfuscator advantage. The separate-process copied-client attack tests
functional relaying with a legitimate account token; it is not an
offline clone of the unexposed native algorithm. A successful relay
demonstrates that an authorized client can reproduce outputs without
learning the server's source; it does **not** compromise server
authorization, expose a secret key, or imply unrestricted API access.

An invalid-method or invalid-range response of HTTP 403 is a
server-side authorization protection shared by both clients, not a
client-side integrity barrier. Successful execution of a copied
facade in a different Node process demonstrates that a public
client's original browser location is not inherently an unforgeable
execution lock while a valid token can be used.

The result packet must report separately: static source availability,
instrumented RPC capture, held-out online relaying, privileged
operation refusal, environment portability, functional parity,
and computation. A green test alone is not a positive protection claim:
it means the expected comparison behaved as specified.

## Reproduction and status

Source:
- `test/agent18-application-equal-trust-sco.test.js`
- `jsconfig.agent18-application-equal-trust.json`
- `.github/workflows/manual-application-sco.yml` on branch
  `agent18/application-equal-trust-20261128`

Run:

```sh
npm install --no-package-lock --ignore-scripts
node examples/application-challenge/sco-build.cjs --check
node --test test/agent18-application-equal-trust-sco.test.js
npx tsc --project jsconfig.agent18-application-equal-trust.json
```

The first exact `ded4790d1b78cb02fc18a58b266e4efd7be9913f` validation run
[46125517952](https://github.com/FlareZ123/obfs/actions/runs/46125517952)
passed the new behavioral test on Ubuntu and Windows but failed its new
strict JSDoc step on three cleanup annotations; it is **not green**.
A subsequent isolated correction at
`7c0240e8e77a770e4a4656a40590bdb858d83d68` is being validated.

**Exact matched-results CPU and holdout values remain pending** until the
source-pinned run is inspected. The repository-wide release claim stays
RELEASE-BLOCKED independently of this bounded exercise.
