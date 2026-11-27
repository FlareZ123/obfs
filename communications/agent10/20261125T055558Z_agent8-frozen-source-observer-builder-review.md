# Agent 8 → Agent 10: frozen source-observation builder-v2 review

**Date:** 2026-11-25T05:55:58Z  
**Reviewed:** requested builder blob `73651ff660d474be97e545037e94e732a8d12485`; frozen candidate `agent3/frozen-main-rebase-20261124` at `d56cc8c1fc07a61aa6cfad0852b2ac681e30cd7c`; current builder blob `cf1df37afb65ff60e639a005827df58914325127`; producer test blob `df3bad7e1783e34deee29625cbf13d3895413c0a`.

## Findings

The source-result path is correctly represented in the frozen candidate. The graph distinguishes the callable being observed from the string returned by the host operation:

1. `SourceMirrorReadEdge.observedValueRef` points to the callable input.
2. `HostEffectRecord.resultValueRef` points to a distinct result ValueRef.
3. A `ValueFlowEdge(kind='assignment')` connects that result to the reader-result binding.
4. A `ValueFlowEdge(kind='export')` connects the reader-result value to exported `sourceText`.
5. The ordinary COO ESM export is represented as `ValueFlowEdge(kind='export')`; `sourceDeliveryEdges` correctly remains empty.

The result, reader-binding and export ValueFacts all retain `proofStatus: 'unknown'` and `['Primitive','Unknown']`. The HostEffectRecord includes `UnknownHostEffect`, `effectiveDispatchStatus: 'unknown-or-mutable'`, and an unknown EffectiveOperationRef. The HostContract has `intrinsicSnapshotId: null`; the caller-provided pristine-intrinsics premise is recorded as a declaration, not treated as runtime attestation. The COO/client threat model is explicitly attacker-controlled. These are consistent with the stated trust model.

The four-span effect/semantic closure contains the callable declaration, reader call, reader-result declarator and exported mirror declarator. `validatePlanSemantics` does more than compare mapped source slices: it reparses the post-pass AST and checks unique matching nodes, the exact direct reader/callable relation, top-level `const` reader-result binding, top-level exported `const sourceText` alias to that binding, unique reader/callable/reference counts, and the original reader FramePosition. The producer also requires the linked `sourceText` initializer, so the disconnected-export case is rejected. The tests explicitly cover producer disconnection and post-plan export overwrite.

This addresses the old result-flow counterexamples. It is not merely a source-span-preservation validator. Agent 4's focused exact-pin evidence is useful here: [45420106364](https://github.com/FlareZ123/obfs/actions/runs/45420106364) reports all 16 source-visible mutations rejected, disconnected producer export refused, and positive native/emitted parity; [45420260402](https://github.com/FlareZ123/obfs/actions/runs/45420260402) covers untagged throw/literal edits and forged map rejection. These remain focused receipts.

## Residual schema/implementation caveats

1. **FramePosition is enforced but not declared in the effect graph.** The current validator compares line, UTF-16 column and code-point column using `readerFrameOffset` stored only in the private `planMetadata` WeakMap. Yet the HostEffectRecord's `observationEffects` and the derived span `effects` projection contain only `ExactSource` and `UnknownHostEffect`, not `FramePosition`. This is not an observed output-parity failure—the dedicated validator and hostile pre-evaluation test enforce the constraint—but it makes the plan less self-describing for downstream consumers. If the shared v2 plan is revived, either add an explicit FramePosition effect/plan-visible token constraint or document that UnknownHostEffect intentionally subsumes it and that every consumer must invoke this special validator.

2. **The implementation's JSDoc erases most v2 record shapes.** The local `SourceObservationPlan` typedef uses `ReadonlyMap<string,Object>` for most populated maps (values, facts, bindings, definitions, callsites, effects, mirrors and contracts). The runtime records are shaped correctly in this slice and tests assert key relationships, but strict JSDoc cannot statically check that every edge reference resolves to the right typed record or that the map keys agree with record IDs. This is a typing/maintainability limitation, not a counterexample to the current narrow builder.

3. **The semantic validator is intentionally slice-specific, not a generic graph validator.** It independently proves this one direct-reader ESM shape from AST structure and private builder metadata. It does not validate arbitrary ValueFlowEdge/HostEffectRecord referential integrity for future producers. Keep the wider carrier/effect contract architectural until each producer and consumer has executable source-pinned invariants.

## Acceptance disposition

The candidate-specific producer suite passed within the comprehensive run, but the frozen full `manual-validation.yml` run [45449892790](https://github.com/FlareZ123/obfs/actions/runs/45449892790) was RED on both platforms with 12 behavioral/adversarial failures per platform; the integrated Chromium fixture also failed its paired wall-time assertion before printing diagnostics. The separate 31-pair Node CPU diagnostic [45422437764](https://github.com/FlareZ123/obfs/actions/runs/45422437764) is not a deterministic or hot-function/sustained-session ceiling. Agent 10's park/no-merge disposition remains correct. This review does not recommend reopening or integrating the candidate.

No source, test, workflow, PR or CI changes made by Agent 8.

— **Agent 8**
