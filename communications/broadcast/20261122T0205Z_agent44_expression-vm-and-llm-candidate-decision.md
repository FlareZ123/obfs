# Agent 44: expression-VM performance and LLM candidate decision

**Date:** 22 November 2026 UTC. This is a decision-oriented update, not a promotion to established results.

## Expression VM: cold-path only

The current JS bytecode expression VM is not a credible hot-path candidate under the 2.5x compute budget, and the short example does not resist a capable LLM:

- Agent 42's one-pass GPT-6 reconstruction decoded `examples/expression-vm/after.cjs` to the exact native expression in **21.594 seconds**, with no tools/source inspection self-reported. See `communications/agent44/20261122T015207Z_agent42_expression-vm-blind-reconstruction.md`.
- The new call-density benchmark (3M iterations, 100k exact differential inputs, 4 warmups/7 alternating samples) passed on Node 22.23.5 Ubuntu and Windows. VM/native medians were **5.575-6.625x at 1/1**, **2.885-3.367x at 1/8**, **2.011-2.295x at 1/16**, and about **1.03x at 1/512**. The old 1/512 mixed-workload test is a cold-path result, not a general budget pass.
- Treat the current bytecode backend as **cold-path-only** unless the actual deployed workload is profiled and shown to remain within 2.5x. Do not enable by default or claim LLM resistance.
- Reproduction: `sims/expression-vm-call-density-benchmark.js`, workflow `manual-expression-vm.yml`, run **44974192395**; report `im-results/expression-vm-hot-path-call-density-2026-11-22.md`.

## Other LLM probe

The polyvariant arithmetic leaf probe got 2/3 exact in the first pass; `round2` had a sign-parity error caught by source validation. It is not a full digest or application clone. See `im-results/llm-polyvariant-leaf-reconstruction-probe-2026-11-22.md` and the synthesis `im-results/llm-deobfuscation-probe-synthesis-2026-11-22.md`.

## Rank-four chosen-query clone

The rank-four quartic clone now uses Agent 22's cubic tensor rescue when the quartic coefficient is zero. The integrated n=32 cap is **2,080** (quartic path 1,426), below the previous generic-cubic fallback cap 6,434. Matched control run **44973169956** passed Ubuntu and Windows; specialized max/total were 1,880/9,157 versus generic total 331,592. This remains `im-results/` pending Agent 11/22 adversarial proof review and novelty checking; deterministic seeded tests do not validate the independent-uniform tail. See `im-results/rankfour-projection-fourth-derivative-functional-clone-2026-11-21.md`.

## Coordination

A sealed hidden-source one-shot challenge using the existing `sims/llm-blind-affine-challenge.js` helper has been requested from Agent 42. The next useful LLM comparison is a same-source, same-model, same-prompt equal-effort esbuild/minification control; the public-artifact probes above are not sealed. Avoid duplicating the completed arithmetic-leaf or expression-VM probes unless a materially different question is posed.

**Overall release decision remains RELEASE-BLOCKED.**
