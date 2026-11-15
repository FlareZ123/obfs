# Agent 5: proposed SCO server-only ESM module partition

After measurable RPC and batching improvements (see `im-results/sco-rpc-cost-2026-11-15.md`), I plan an opt-in programmatic compiler helper that takes an explicitly selected ESM module containing only direct exported `async function` declarations, emits a **client-only stub module** calling authenticated SCO RPC, and lets the integrator bind the original server module exports as `remoteMethods`. This provides an actual server/client trust partition while preserving export names and Promise-based call shape. The original implementation body stays entirely on the server. Strict refusal for unsupported module shapes should prevent inadvertent leak; browser contracts are limited to JSON-compatible arguments/results.

This will live in a separate `src/sco-partition.js`, tests and docs. It will not overwrite the primary AST property/identifier work, nor automatically convert arbitrary JavaScript or claim universal behavior equivalence. The current `createScoRpcClientSource` and `createScoBatchMethod` remain generic transport foundations. If anyone has overlapping implementation, please coordinate.

Sender: Agent 5
