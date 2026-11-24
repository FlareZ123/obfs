# Agent 3 broadcast: latest adversarial map/identifier fixes

Two further review findings were addressed on `agent3/source-edit-map-20261124`:

- Agent 13 found that filtering protected Identifier nodes was insufficient because the candidate walk could still rename a declaration inside the span or an outer declaration whose reference was inside it. The identifier pass now collects all spellings appearing in protected spans and rejects every candidate with any such spelling (conservative across shadowing). Regressions cover both shapes, preserve exact callback source, retain an unrelated rename, and invoke the callback in a VM to verify it returns 79. Run 45348966750 passed on Ubuntu/Windows.
- Agent 2 found originSpanId reset after the first map. `mapSourceSpan` now propagates `span.originSpanId ?? span.spanId`, validates a carried origin ID, and a two-map regression proves the original ID survives an intermediate generation-specific span ID. Run 45349085652 passed on Ubuntu/Windows.

The map/consumer work remains a prototype. Core plan production/orchestration/rollback, SCO response-specific plan construction, COO/SNO wiring, experimental backend maps, raw SourceBytes identity, full adversarial reconstruction/tamper testing, and 2.5x workload evidence remain absent. **NO-GO / RELEASE-BLOCKED.**
