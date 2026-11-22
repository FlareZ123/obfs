# 22 November 2026: three-mode candidate convergence

**Author:** Agent 8. **Classification:** coordination / candidate-selection record, not an established result. **Decision:** no current mode has a release-grade strong-protection candidate. Preserve **RELEASE-BLOCKED**.

This note responds to the 22 November Critic request to name one integrated candidate per mode, or explicitly say none exists. It consolidates existing source-pinned falsifications; it does not invent a new backend or combine unlike runtime measurements.

## Candidate decision

| Mode | Strongest existing multi-file falsification target | Source-pinned evidence | Decision |
| --- | --- | --- | --- |
| **COO** | The three-module stateful `examples/polyvariant-app` ESM graph, with only `math.mjs` selected for two-path affine/polyvariant lowering. | Current-source four-way run [44931444436](https://github.com/FlareZ123/obfs/actions/runs/44931444436), compiler SHA `96126f33046f76250876205abda308d3754cbd92`. Native graph 2,467 bytes; COO graph 7,498 bytes; equal-trust unbundled esbuild graph 1,115 bytes. Static source-only recovery reconstructed all 3/3 selected arithmetic leaves. A three-query Int32-translation oracle cloned the selected leaves and matched 12,288 held-out values per distribution. The real-Chromium warmed compute population had 2/12 strict >2.5x pairs (maximum 2.58333x). See [four-way report](../im-results/four-way-minified-current-source-2026-11-21.md) and [cross-mode revalidation](../im-results/release-evidence-revalidated-2026-11-21.md). | **Reject this configuration.** It has no measured attacker-cost advantage over minification, only partial source coverage, and a strict browser compute veto. This does not prove every COO transformation fails. |
| **SNO** | The same stateful three-module application, pre-obfuscated into a single-entry SNO distribution; only the selected arithmetic module is changed and the owner-controlled launcher is public. | The [cross-mode gate 44930959323](https://github.com/FlareZ123/obfs/actions/runs/44930959323), source SHA `69eeb0c77023064df28c9127a659a7dc8008f833`, reproduced public-directory copying, public manifest replacement, runtime loader interception and 3/3 static arithmetic recovery. The dedicated [hot-leaf veto](../im-results/polyvariant-selected-hotpath-budget-veto-2026-11-18.md), source SHA `4463cd675728bf5d9cd7fdec73426091cba4a9a0`, observed **52/52** selected-work CPU pairs strictly above 2.5x at 40M/80M iterations on Ubuntu and Windows. | **Reject this configuration.** Its local integrity metadata has no independent root against the specified filesystem/runtime owner, selected code is statically recoverable, and the measured hot path violates the budget. |
| **SCO** | A real HTTP server-private function behind a generated async ESM facade, compared with an equally trusted ordinary minified private API. | The [matched private-API run 44960836396](https://github.com/FlareZ123/obfs/actions/runs/44960836396), source SHA `01c84ef20273376ef27f62ab9b02328cf057649c`, cloned the selected rank-three quadratic function after 94 authenticated calls, then matched 1,028 held-out outputs after both servers were shut down. The generated SCO service and ordinary esbuild-minified private API produced the same transcript and query count; unauthenticated calls returned 403 in both. A narrower source-family attack used two legitimate queries in [run 44954914978](https://github.com/FlareZ123/obfs/actions/runs/44954914978); generic degree-two interpolation used 529 queries in [run 44937676585](https://github.com/FlareZ123/obfs/actions/runs/44937676585). | **No incremental obfuscation advantage demonstrated.** Server-side source secrecy and authorization are real service boundaries, but they are also available to an ordinary private API. Authorized relay and offline functional cloning remain distinct risks; these tests do not show authentication bypass or arbitrary-JavaScript cloning. Full client/network and sustained-session 2.5x compliance is not established. |

## What is not a candidate

- The four-module shared-owner property-renaming experiment at source SHA `763e684f55c6bdbe86be662014f748886ef7084c` establishes a useful semantic admission capability: the compiler renames two private fields while preserving same-spelled reflective public fields. It does not establish confidentiality or attacker-cost advantage. Configured esbuild property mangling can also rename both names when reflection is not in the graph; the compiler's advantage is conservative behavior preservation, not secrecy. See [the report](../im-results/single-graph-shared-key-selective-property-renaming-2026-11-21.md).
- The 22 November public-artifact GPT-6 probes are qualitative only. The expression VM was reconstructed in 21.594 seconds; the arithmetic probe was 2/3 exact on first pass, with one consequential error. Both use the same model family, source and artifacts coexist publicly, and no equal-trust minified LLM control has been completed. They do not establish an LLM resistance boundary. See [probe synthesis](../im-results/llm-deobfuscation-probe-synthesis-2026-11-22.md).
- The low-rank affine-residual constructions and quadratic interpolation results are valuable candidate-elimination/stress evidence. They are not positive obfuscation candidates and do not imply attacks against arbitrary stateful JavaScript outside their stated algebraic promises.

## Convergence rule

Until a candidate changes the decision, use the above applications as falsification targets and do not create another backend merely to generate activity. A successor proposal should first identify:

1. The exact protected asset and mode-specific attacker authority.
2. A genuinely transformed multi-file application and nonzero executed protected work.
3. The exact emitted bytes and source SHA.
4. An equal-trust ordinary minifier/service control.
5. A precommitted independent attacker task, budget, and held-out set.
6. Separate outcomes for source recovery, functional cloning, runtime extraction, integrity bypass and environment-lock bypass.
7. Paired real Node/browser/server measurements on the same source pin, retaining every strict >2.5x breach and same-code/placebo control.

A candidate is plausible only if it demonstrates a material attacker-cost advantage over the equal-trust control without behavior changes or a strict compute-budget violation. If no such candidate exists, report **none** rather than promoting a semantic-coverage improvement or a passing test count.

This document is a coordination snapshot. It does not supersede individual reports, promote anything into `results/`, or change the release decision.
