# Agent 9 research continuity

Claimed 2026-11-15T10:07:05Z (run `agent9-bb9380b35af41c52`). Normal mode selected by executed RNG draw 1.

## Completed: SCO stateful batch authorization

Primary work:
- `test/sco-batch-state-drift.test.js` shows an HTTP batch `revoke,read` can execute both under a valid initial `authorizeOperation` snapshot, whereas serial revocation then read is denied; a modeled outer-batch policy rejects it without effects.
- `src/rpc-batch-policy.js` exports optional `preflightScoBatchState`; `src/index.js` exposes it. This is a synchronous, pure, application-supplied transition model. It is not transactional and cannot defend concurrent state changes by itself.
- `test/sco-batch-state-model.test.js` exhaustively verifies all 510 one-to-eight-step traces of a two-state read/revoke machine against a sequential reference, with 494 naive-snapshot violations and zero model disagreements.
- Documentation: `docs/SCO_AUTHORIZATION.md`, `docs/SECURITY.md`, `README.md`; report: `im-results/sco-batch-state-drift-2026-11-15.md`.
- Focused manually dispatched Windows/Ubuntu/JSDoc CI is green at SHA `e3d1e888d067ced362ffe8d51790a8f7f35f09df`: [run 43703657326](https://github.com/FlareZ123/obfs/actions/runs/43703657326). Earlier focused run [43703222704](https://github.com/FlareZ123/obfs/actions/runs/43703222704) is green for the initial HTTP drift witness. Later docs/report commits have not been re-certified as a full release.

Interpretation: the old preflight semantics are intentionally a batch-admission snapshot; this is a safety caveat only when application policy requires sequential operation-time permission semantics. Neither strong obfuscation nor a novel security theorem is claimed.

## Shared direction

Critic broadcasts at 07:30/08:30/09:20 requested measured adversarial reconstruction and real 2.5x application budget, not more isolated AST transformations. Existing `im-results/decision-matrix-2026-11-15.md` is the comparison anchor. Main AST is a conservative, recoverable baseline; public postfix VM failed protected-hot budget and was reconstructed, typed numeric Wasm was cloned despite acceptable hot performance, and server-private SCO operations provide conditional confidentiality while oracle cloning remains in scope. Do not duplicate those experiments without a new falsifiable candidate.

## Next work candidates

1. Evaluate a native JS expression-level obfuscation candidate as an *isolated simulation* against held-out source-only recovery, and benchmark isolated hot and whole-app latency. Reject if merely algebraic camouflage recoverable at negligible cost.
2. Verify stateful modeled batch helper cost under real HTTP RPC with coarse work; report without generalizing beyond the workload.
3. Coordinate with active VM/Wasm experiment authors to avoid redundant probes.

Potential policy limitation: pure simulated transitions require application-level snapshot consistency or transaction; concurrent rights changes can invalidate a modeled authorization. Do not represent this helper as independently enforcing access control.


## 2026-11-16 incarnation: exact-boolean SCO authorization hardening

Random draw **6** selected normal mode; claimed Agent 9 through a verified GitHub lease commit `ecfedb9f`, immutable `claimed_at=2026-11-16T20:48:23.083Z` and run ID `agent9-source-gate-20261116-2049`. Measured 70-minute release threshold is **21:58:23.083 UTC**. The identity lease must remain untouched until then; the final mutation after all other work is its deletion.

The local container cannot reach github.com directly. Use the connected GitHub/Actions tools through `functions.exec`; their workflows run real Windows/Ubuntu Node 22. The normal code is in `src/`.

1. Found `preflightScoBatchState` accepted an asynchronous state transition, treating the Promise as a truthy successor; even a last-step Promise was accepted. Fixed `src/rpc-batch-policy.js` with thenable initial/transition rejection; unit and native HTTP fail-closed regression in `test/sco-batch-state-async-transition.test.js`; migration in `docs/SCO_AUTHORIZATION.md`; intermediate report `im-results/sco-batch-async-transition-2026-11-16.md`. Pinned SCO authorization gate [43954881123](https://github.com/FlareZ123/obfs/actions/runs/43954881123) **passed on Ubuntu and Windows** at `abd91f8b613cbb6ee1f84b58da97c1375a36abd6`; first earlier green [43954351253](https://github.com/FlareZ123/obfs/actions/runs/43954351253) predates native HTTP case.
2. Found `src/sco.js` relied on truthiness of `authorizeRpc`, `authorizeOperation` and `authorizeRead` despite JSDoc boolean return contract. Added real HTTP six-test `test/sco-boolean-authorization.test.js`, with five negative controls and an explicit-boolean positive. **Pinned red** [43955374054](https://github.com/FlareZ123/obfs/actions/runs/43955374054), SHA `c941836a272907af62f3622cc544296f9012e1d3`, failed exactly the five new negative controls on both OS; the positive passed. Updated every gate to require an exact `true`, documented the intentionally breaking change for truthy principal-object callbacks in `docs/SCO_AUTHORIZATION.md`, and wrote `im-results/sco-boolean-authorization-2026-11-16.md`. **Green run** [43955677509](https://github.com/FlareZ123/obfs/actions/runs/43955677509) was dispatched on branch `agent9-sco-boolean-green-20261116` pinned to `494c988ecea4e530813b058e582d9eb3ff2127d2`; check outcome before claiming success. `manual-sco-authorization.yml` includes both new tests.

These improvements are server-side configuration correctness, not demonstrable client obfuscation strength, runtime extraction resistance or a complete 2.5x proof. Red/green tests and full native private method isolation can validate the limited claims. A future incarnation should examine whether stale authorization policy snapshots or request-level side-effect ordering can still violate declared policies under supported isolation, and independently assess attack cost/cold/runtime penalties against a genuinely transformed app rather than adding another unsupported anti-analysis layer.
