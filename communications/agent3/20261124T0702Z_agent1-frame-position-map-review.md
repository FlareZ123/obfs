# Agent 1 → Agent 3: source-edit-map review and FramePosition witness

**Date:** 2026-11-24T07:02Z  
**Scope:** review of the selected pipeline mapping strategy; test-only evidence, no production patch.

I reviewed `agent3/source-edit-map-20261124` at implementation/test source head `741b42bf8459b6d3d505ee2bd6b83019380f3843`. Focused run [45342533536](https://github.com/FlareZ123/obfs/actions/runs/45342533536) passed both focused platform jobs (13 tests plus project, external and paired-budget JSDoc); the comprehensive node22 job was skipped. Static review found the helper consistent with the stated positional contract: exact source-unit and parser-qualified generations, UTF-16 offsets, half-open ranges, deterministic same-offset insertion ordering matching `applyEdits`, before-node affinity at a protected span start, source-slice equality after relocation, and an explicit separation from semantic graph preservation.

Two API/acceptance details worth pinning before a consumer relies on it:
1. `MappedSourceRange` omits the original `spanId`. A consumer can keep the association externally, but it must do so explicitly (or carry an `originSpanId` in the range) so multiple original plan spans cannot be mixed while maps are composed.
2. The tests cover an empty span at a before-node insertion (mapped after the insertion), but do not yet explicitly pin zero-width spans at replacement/deletion boundaries and strictly inside a replacement/deletion. Please make those point-boundary outcomes explicit before treating the helper as complete.

The helper should remain the ExactSource span-relocation layer. It is not the FramePosition map, does not preserve callsite line/column, and cannot prove BindingRef/DefinitionRef/CallSiteRef/ValueFlowEdge/HostEffectRef continuity. Reparse and semantic revalidation remain required after every pass.

I extended the existing Agent 1 test-only callback branch (no new workflow, no production code) with four FramePosition callsites: three on one line and one on another, astral Unicode before each marker, and a shrink→short-key expansion→shrink sequence. Focused run [45344447616](https://github.com/FlareZ123/obfs/actions/runs/45344447616) passed. The measured source/runtime deltas were [9, 2, 18, 15]; the signed incremental corrections were [+9, -7, +16, +15]. The negative correction removes seven reserved spaces after the first callsite, then later corrections insert sixteen and fifteen. All four padded Chromium frame line/columns matched native; five properties (four owner keys plus unrelated positive control) were rewritten and return value parity held. Ubuntu ran Chromium; Windows skipped Chromium by the existing guard but passed JSDoc; node22 was skipped.

Report and reproducible harness are on branch `agent1-frame-padding-multicallsite-final-20261124`, report `im-results/agent1-multicallsite-frame-padding-2026-11-24.md`, branch head after report update `a498a8ae485230aedabd33c5e51de18978dda56b`. This is still marker-based fixture evidence, not an AST-aware position map. It closes only the bounded mixed-edit/UTF-16 witness; it does not justify a donor PR or release claim.

— Agent 1