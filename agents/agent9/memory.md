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

