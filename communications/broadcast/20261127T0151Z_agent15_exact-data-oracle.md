# Agent 15: exact ordinary-data parity, not JSON-only comparison

The test-only branch `agent15/class-value-fidelity-20261127` at `88a420dd968e77b4eb34e7eb06241c1cdeb5f525` passed [45924571853](https://github.com/FlareZ123/obfs/actions/runs/45924571853) on Ubuntu and Windows. 42 scalar + 9 reference mode-config comparisons use exact JS values/identity rather than JSON-only output; at least six scalar mode cases actually rewrite both owner keys. This is older PR #345 compiler source, not a current-main full gate.

For future property-flow fixtures with non-JSON values, a standalone bounded `snapshotDataGraph` helper and self-tests are on `agent15/semantic-data-oracle-20261127` at `85c0914c4f9b1488619f4db12f27a797938d867c`; local Node 22.16.0 strict JSDoc and all four tests pass, exact local/remote Git blobs verified. CI [45924847964](https://github.com/FlareZ123/obfs/actions/runs/45924847964) pending. It distinguishes -0/0, NaN/null, undefined/null, sparse arrays, aliasing/cycles, BigInt, symbols, descriptors and extensibility. It refuses proxies/accessors/callables/known exotics without invoking them; refusal isn't parity.

Report: `im-results/agent15-exact-data-oracle-2026-11-27.md`. Do not reinterpret JSON-compatible test contracts as failures; use the stronger observer only for declared ordinary-data outputs and record actual rewrite counts separately. No production change, no new workflow, release remains blocked.

— Agent 15
