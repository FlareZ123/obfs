# PR #372 private-class source admission: consolidated candidate no-go

**Date:** 2026-11-25  
**Candidate:** PR #372, head `499060b780fc1b355df7d9610711f77280217276`  
**Disposition:** keep draft / blocked / unmerged. This is an evidence synthesis, not a production fix or a release-security result.

## Executive finding

The new private-class admission proves a narrow in-AST property: the class binding and its one instance do not escape through the admitted source grammar. It does **not** prove that the active source unit is unobservable. Three source-pinned compiler counterexamples now cover distinct host-observation channels:

1. sloppy CommonJS wrapper ExactSource;
2. strict CommonJS wrapper FramePosition;
3. strict ESM module-evaluation FramePosition.

The class and instance remain local in these fixtures; the exported value is primitive. The observed failures are not class-instance escapes. They arise because an external host callback can observe the active enclosing module/wrapper frame, which the AST-local class/function privacy proof does not model.

## Candidate-only evidence

| Channel | Candidate source/test pin | Candidate result | Baseline control | Platform boundary |
|---|---|---|---|---|
| Sloppy CJS wrapper ExactSource | PR source/test commit `93a68ddbf7ddd84f164b303f2d78c0414d1281b8`; current PR head `499060b...` is a report-only descendant | Run [45544329858](https://github.com/FlareZ123/obfs/actions/runs/45544329858): **3/3 failures per OS** across COO/SNO/SCO. A preloaded host callback captures the wrapper via `arguments.callee.caller` and reads `Function#toString`; the generated property spelling is visible. | [45544336152](https://github.com/FlareZ123/obfs/actions/runs/45544336152): **3/3 pass per OS** on current-main control. | Ubuntu + Windows |
| Strict CJS wrapper FramePosition | Same PR source/test pin `93a68dd...`; report-only PR head `499060b...` | Run [45544342871](https://github.com/FlareZ123/obfs/actions/runs/45544342871): **3/3 failures per OS** across COO/SNO/SCO. Native frame column 163; emitted column 165; values match. | [45544348695](https://github.com/FlareZ123/obfs/actions/runs/45544348695): **3/3 pass per OS** on current-main control. | Ubuntu + Windows |
| Strict ESM module-frame FramePosition | Candidate parent PR head `499060b...`; test-only witness commit `b67a24b76217c7a39af7f7421c00ea3514cd22dd` adds one test file | Run [45545516250](https://github.com/FlareZ123/obfs/actions/runs/45545516250): one property rewrite; native frame 1:153, emitted frame 1:133; values 21/21. | Baseline source `c41b591cbe989ca4b6d86eca93700471df9e9ba7`, test-only commit `c6ada9e5c063cf4f147b3d2ebf10fa1a9669e420); [45545522393](https://github.com/FlareZ123/obfs/actions/runs/45545522393): zero rewrites; both frames 1:153. | Ubuntu Chromium; Windows browser step skipped, JSDoc passed |

For the first two rows, workflow metadata confirms runs 45544329858 and 45544342871 checked out `93a68dd...`, which extended the tests to SCO. Current PR head `499060b...` changes only the intermediate report, so it contains the exact tested source/test tree but is not literally the workflow checkout SHA. This pin distinction is recorded in PR comment 7153359499.

The ESM row is Agent 9's **actual compiler differential**, not merely a runtime probe. The test-only branch adds only `test/agent9-private-class-frameposition-browser.test.js` to the candidate or baseline source snapshot. See `im-results/agent9-private-class-frameposition-esm-2026-11-25.md`.

## Source-level review

The candidate's `privateClassNodes` admission is deliberately narrow: top-level non-exported ClassDeclaration, no superclass, a class body containing exactly one ordinary non-static/non-computed MethodDefinition, a zero-argument synchronous method body containing exactly one ReturnStatement with one member-return, one unique const instance, and only direct zero-argument method calls. The exact one-element class-body check excludes static blocks, static/instance fields, accessors and additional methods from the admitted class shape. The existing tests reject direct/indirect exports, aliases, method extraction/binding, prototype/reflection and other instance uses. Within this admitted grammar, independent review found no additional class-instance escape.

The missing fact is different: **active source-unit visibility is not equivalent to callable/value escape**.

- CommonJS execution adds an implicit module wrapper function that is not an AST ancestor represented in the candidate's private-function/class sets.
- ESM module evaluation has a top-level activation frame even though the module is strict and has no user-visible wrapper function object.
- A synchronous unknown host callback can observe the active frame through Error.stack; a sloppy callback can additionally recover a sloppy CommonJS caller and read its Function#toString.
- The same callback need not receive the class, instance, method, or any callable value. The class and instance can remain local while the module frame is still observed.

The shared proposal `workplace/source-observer-carrier-effect-contract-2026-11-23.md` already identifies non-function activation frames (script/module evaluation, class static-block and eval) and requires a generic ActivationRef/FrameRef rather than a function-only definition map. This is an unimplemented proposed contract, not an accepted compiler architecture.

## Repair experiments are not acceptance

Agent 9's report records a separate experimental path:
- per-occurrence property-span padding preserves the tested property-only strict CJS and ESM FramePosition cases while retaining one rewrite;
- a strict-source gate refuses the tested sloppy-CJS class case;
- the identifier span-preserving prototype repairs the tested +16-column identifier regression;
- string encoding remains independently FramePosition-red in the measured full pipeline, and a source-span string strategy is only a hypothesis.

These experiments are not integrated into PR #372 and do not resolve exact-source observation, all host effects, every source shape, or the 2.5× budget. Agent 10's latest prototype workflow run 45550792190 on head `6ec6bdb35bcf74c6573e02694612b44e982db64d` is a focused two-platform run only: focused Ubuntu and Windows jobs succeeded, while the full `node22` job was skipped. It is not full manual-validation acceptance. See the detailed isolation in `im-results/agent9-private-class-frameposition-esm-2026-11-25.md` and Agent 10's prototype report.

A separate Node ESM runtime-only probe is preserved at `sims/node-esm-module-frame-observation.js`, with focused test `test/node-esm-module-frame-observation.test.js` and report `im-results/agent3-node-esm-module-frame-observation-2026-11-25.md`. Focused run [45551053941](https://github.com/FlareZ123/obfs/actions/runs/45551053941) passed Ubuntu/Windows on Node 22.23.4. This validates the runtime observation mechanism only; it is not another compiler differential.

## Decision and next evidence

Keep PR #372 draft, blocked and unmerged. A future candidate must choose and enforce an explicit host/runtime trust contract or model the active module/wrapper frames and unknown-host effects. It must then run exact-source-pinned native/emitted controls for COO/SCO/SNO, real Node and browser execution where applicable, all supported source containers, and the complete behavioral/adversarial/performance acceptance gate. A property-only focused green, span-preserving experiment, or zero-rewrite refusal is not by itself acceptance.

This synthesis does not prove that every class proof is impossible, that every source observer is in scope, or that the broader strong-protection threat model has been solved. It establishes that the current PR candidate has three independently evidenced source-observation regressions and remains **NO-GO / RELEASE-BLOCKED**.
