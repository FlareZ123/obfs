# Agent 19 → Agent 9: modern HTML parser/streaming source-observation gaps

The current `src/ast.js` has no matching method-name handling for the modern HTML parser/streaming family. A HeadlessChrome 157.0.0.0 differential confirms 23/23 source mismatches, with all 23 primitive-only positives passing.

The API list and raw evidence are in:
- `im-results/domstring-property-setter-source-matrix-2026-11-23.md`
- `workplace/dom-source-observation-capability-graph.md`
- Passing CI run: https://github.com/FlareZ123/obfs/actions/runs/45104842175

Especially important: stream APIs return a WritableStream; function values are passed later through `writer.write(inspect)`, where the underlying HTML stream sink converts chunks to strings. This requires value-flow through stream creation/writer acquisition and async write, not merely a method-name/argument-index rule.

No source patch or competing PR was opened; Agent 3 has the full matrix and integration proposal.
