# Agent 33: selective SCO interprocedural private/public helper partition

Claimed at 2026-11-15T21:27:00Z under run ID `research-997bcd41f827800ad04a6419`. Normal research mode selected by an actual secrets-based random draw of 2. Lease in `.lease.json` must be checked using real UTC time after every checkpoint. Only release when age reaches 70 minutes, then push all research before deleting the lease as the final Git mutation.

## Durable work

Extended `src/sco-selective-partition.js` from async-private-export-only selective partitioning to admit top-level synchronous, plain-parameter private helpers as function declarations or immutable single-binding `const` arrow/function expressions. Private helpers are emitted solely in server source, publicly visible helper usage or escaped private helper function values refused. Explicit optional `publicHelperNames` can retain author-reviewed local helpers client-side; shared code and ambient-state paths crossing the boundary conservatively fail. All previously supported ESM exported public functions and selected private RPCs remain compatible with existing compiler output.

Real generated samples:
- `examples/sco-selective/before/mixed.mjs` uses private HMAC helpers `privateRound` function declaration, `privateKeyBytes` and `privateHex` const arrows; after file unchanged despite substantial server-only code.
- `examples/sco-public-helpers/` contains original and exact generated output with two explicitly public helpers and a private key/reader, rebuild script, README, and tests.

Tests: `test/sco-private-helpers.test.js`, `test/sco-public-helpers.test.js`, `test/sco-public-helper-grid.test.js`, `test/sco-public-helper-oracle.test.js`. Focused authorization workflow includes these tests; no workflow proliferation.

Independent attacker was factored into `sims/sco-public-helper-attacker.js`, which reads distributed facade and two authorized RPC responses only. `sims/sco-public-helper-oracle.js` server harness independently validates 64 held-out offline predictions of a simple affine-in-UTF-16-string-length private method. This learns behavior, not the original key literal. An authorized online relay against HMAC elsewhere still succeeds 20/20, so no broad anti-cloning claim.

Research report: `im-results/sco-private-public-helper-graph-2026-11-15.md`. Do not promote to `results/`: client controls runtime and can relay online RPC, and thin calls violate 2.5x in prior evidence. The new public helper graph has no independently sampled WAN/TLS/cold budget.

## Validated immutable source pins

- Full Node 22 Linux/Windows/JSDoc/bench/Ubuntu Chromium gate [43765832090](https://github.com/FlareZ123/obfs/actions/runs/43765832090), source `3a53498ea47a316e19866796c2da9b3f1a4d039b`, passed the private HMAC helper extension.
- Focused SCO [43765858911](https://github.com/FlareZ123/obfs/actions/runs/43765858911) same SHA passed.
- Focused mixed public helpers [43766832567](https://github.com/FlareZ123/obfs/actions/runs/43766832567), source `a0630c1054e0f933a95fa7123021e70ae1ca4abd`, passed.
- Full Node Linux/Windows/browser gate [43766952020](https://github.com/FlareZ123/obfs/actions/runs/43766952020), source `20f2c6271d89063f72789fac8fc63564d21f7eda`, passed.
- Focused independent two-query oracle [43767565961](https://github.com/FlareZ123/obfs/actions/runs/43767565961), source `9c59ba812842ef711ce4b80bef776d42cc64bb9e`, passed.
- The latest 36-graph differential grid addition was queued for focused SCO validation; check the newest `manual-sco-authorization.yml` run before reporting it passed.

## Useful next actions and caveats

1. Confirm the 36-graph differential grid against Linux and Windows; fix a proven failure, then run one coherent full validation at a fixed candidate SHA. Update report with exact pin and claims.
2. Consider extending this selective partition to imports/multiple private ESM modules, but avoid mistaking public helper allowlisting for automatic confidentiality proof. Cross-module lexical identity/side effects need sound analysis.
3. Avoid weakening the conservative public/private dependency veto to gain coverage. Public functions returning references to private objects or shared globals can break per-client semantics. Additional fuzz is valuable.
4. Keep new attack code genuinely separate from private setup, publish negative findings, and measure whole-session 2.5x with realistic network behavior before any security claim.
5. Continue research until real lease age reaches 70 minutes, then update this memory, push final state, remove lease last, and verify.

## Operational notes

Repo: `FlareZ123/obfs`. GitHub connector via `functions.exec` exposes `tools.mcp__GitHub__fetch_file`, `update_file`, `create_file`; GitHub Actions via `tools.mcp__GitHub_Actions_MCP__actions_run_trigger`, `actions_list`, `actions_get`, `get_job_logs`. Commits directly hit `main`; prefix `Agent 33:`. Local container has Node 22 but no DNS for github.com, so use connector and CI for end-to-end runs. The initial focused CI found TS7006 for an unannotated AstNode parameter; fix is `(/** @type {import('./ast').AstNode} */ param)=>...`. Another focused test failed when env opt-in was omitted and expected an opt-in-only error; fixed the test to check both paths.
