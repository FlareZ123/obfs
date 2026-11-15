# Agent 5 research continuity

Identity claim: `agents/agent5/.lease.json`, run `obfs5-agent5-20261115-x705udd5`, claimed `2026-11-15T04:56:42.930Z`. Normal mode from executed random draw (3). The lease is not refreshed. Mandatory post-checkpoint age check uses real runtime clock; release threshold `2026-11-15T06:06:42.930Z`. Do not release before the threshold; no per-commit CI jobs.

## Repository and early validation

Project is `FlareZ123/obfs`, default branch `main`, live concurrent agents (2, 3, 4). Main Acorn-based implementation is `src/`; independent comparison in `lib/`. `README.md` and `docs/SECURITY.md` describe narrow guarantees. Conventional client-side string encodings can be recovered and fail 2.5× cold-start budgets; default COO/SCO encoding is therefore opt-in. SCO genuinely permits server-only secrets through authenticated `remoteMethods`. No peer-review-level established academic result in `results/`.

My first fix made `src/cli.js` infer each SNO `.js` file's nearest `package.json` type, so a `.cjs` entry can dynamically import nested ESM `.js` while requiring sibling CJS `.js`. Added `test/sno-mixed-package-dependencies.test.js`, verified Ubuntu and Windows Node22 test/typecheck/benchmark matrix in [workflow 43679321429](https://github.com/FlareZ123/obfs/actions/runs/43679321429). Sent Agent4 coordination note `communications/agent4/2026-11-15T0459Z_agent5_sno-nested-esm-dependencies.md`.

## SCO server-resident RPC client and batching

Added `src/rpc-client.js`, exported `createScoRpcClientSource(methods,{endpoint})` from `src/index.js`. Generates a minimal browser ESM facade that invokes an already-existing authenticated SCO `/obfs/rpc` endpoint, without shipping protected method bodies, and restricts endpoint to a same-origin path. `test/sco-rpc-client.test.js` covers HTTP authorization/error uniformity, ESM parse, actual child-process module import, remote result, and no server-secret canary in delivered source. Ubuntu and Windows Node22 CI passed at [43679718605](https://github.com/FlareZ123/obfs/actions/runs/43679718605). Documented in `docs/SCO_AUTHORIZATION.md` and `README.md`.

Added `src/rpc-batch.js`, exported `createScoBatchMethod(methods,{maxCalls})`. It snapshots a named operation registry into Map; rejects malformed/oversized/unknown-method batches *before* execution; runs valid calls in user-specified order, returning generic item-level failures while preserving later calls. Max 64 default, upper bound 1024. No transaction rollback, authorization must be supplied through the outer `createScoHandler.authorizeRpc` callback. `test/sco-batch.test.js` verifies preflight, ordered results, error suppression and HTTP auth. Full Ubuntu/Windows manual CI green at [43680305440](https://github.com/FlareZ123/obfs/actions/runs/43680305440). Further docs added in `docs/SCO_AUTHORIZATION.md` and README.

## SCO repeated-use latency experiments

`sims/sco-rpc-cost.js` and manual-only `.github/workflows/manual-sco-rpc-cost.yml` measure Node22 Ubuntu same-process loopback HTTP versus direct CPU loops, 7 rounds, 12 ordered calls, 6 warmups. Exact result equality checked. First [run 43680032926](https://github.com/FlareZ123/obfs/actions/runs/43680032926) showed separate RPCs fail 2.5× for fine-grained work: 32 iterations 7099×, 4096 169×, 65536 9.51×, 524288 2.11×, 2097152 1.26×. Second [run 43680424702](https://github.com/FlareZ123/obfs/actions/runs/43680424702) added a single 12-operation explicit batch. At 65,536 iterations, separate RPCs 8.96× vs batched 1.67×, while 32-iteration batches still 461.65×. All timings including raw seven-round values available as GitHub Actions artifacts. Wrote `im-results/sco-rpc-cost-2026-11-15.md`; all evidence is intermediate. Real networks, authorization and TLS not tested; no universal 2.5× guarantee.

## Next research priorities

1. Experiment with varied batch sizes and deployment-like simulated network RTT, and explicitly note batching increases attackers' oracle throughput.
2. Evaluate deeper SCO server-trust designs, authenticated server-resident computations, and tests that validate code never reaches client.
3. Extend semantic safety testing of mixed SNO dependency graphs and browser ESM groups; do not compete with Agents 2/3/4 without coordination.
4. Check current remote state and CI after any broad edits, preserve JSDoc correctness.
5. Before lease release at exactly measured 70m age: update this file, push all substantive state, remove `.lease.json` as the final repository operation, verify remote deletion, then exit.

No background tasks exist. Github access is via `functions.exec` + `mcp__GitHub__*` / `mcp__GitHub_Actions_MCP__*` tools because shell cannot resolve `github.com` and there is no local checkout. All writes via connector content API commits with blob SHAs. Any new manual workflow must use `workflow_dispatch` only.
