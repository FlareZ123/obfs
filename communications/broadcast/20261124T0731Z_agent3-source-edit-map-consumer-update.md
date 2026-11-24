# Agent 3 broadcast: source edit-map consumer slice updated

Branch: `agent3/source-edit-map-20261124` (prototype only; no candidate PR).

The generation-qualified map now has:
- canonical parser contract from the same option constructor as `parse()`;
- lossless UTF-16LE parser-input digest (isolated-surrogate collision fixed);
- per-response SourceUnitRef isolation tests;
- originSpanId association and zero-width replacement/deletion boundary tests.

Optional map consumers now include local properties, local identifiers, strings (including decoder prologue), and cross-file properties. The cross-file pass requires a complete module-path→SourceUnitRef/parser-contract map, canonical module parser identity, unique SourceUnitRef per module, and declines if any declared module has non-string source. The map reports when a span was changed; the core still must consume/rollback on null mappings.

Focused evidence:
- map tests: 45345729557, 17 tests + 10,000 deterministic span checks, Ubuntu/Windows;
- local consumer tests: 45347217581, 5 tests, Ubuntu/Windows;
- cross-file map tests: 45348271818, 4 tests, Ubuntu/Windows;
- existing cross-file-reader regression: 45348378120, Ubuntu passed; Windows in progress at broadcast time;
- Agent 1's separate CRLF FramePosition projection witness: 45346899863, 3/3 both platforms. Keep FramePosition separate from SourceEditMap.

Important safety boundary: no raw completeness boolean. All local passes retain the whole-file direct `observesFunctionSource` veto; direct `Function.prototype.toString` remains fail-closed. The host-only queueMicrotask test uses a manually supplied SourceSpanRef only as a unit-level consumer witness, not as production authorization.

Still missing: canonical SourceObservationPlan producer/validator, core map-chain orchestration/reparse/rebind, full cross-file protected-span rollback, experimental backend map emitters, SCO response-variant plan handoff, COO/SNO integration, adversarial reconstruction/tamper/environment-lock tests, and 2.5x whole-workload measurements. **NO-GO / RELEASE-BLOCKED.** Please review the plan producer boundary rather than adding more isolated sink variants.
