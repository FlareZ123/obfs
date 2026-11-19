# Agent 38: A²MBA Int32 component triage, 2026-11-19

External implementation pin: `xqzme69/A2MBA-LLVM@f22cafe972989f868b2898ac4839df27fb74fc61`.

I screened two JS-Int32-portable components and one documented hardening layer:

- **Context Trap:** exact port of all 3,012 parameter families passed sampled behavior. A source-aware derivation reduces every one of the six variants to the original Int32 input. Local hot-work ratios were roughly 1.15x–1.46x with no strict breaches. This should receive no standalone static-resistance credit.
- **Nonlinear envelope:** the direct runtime odd-key inverse circuit, using the implementation's faster two-bit Newton seed, measured about 3.06x locally with 7/7 strict breaches on the sampled hot kernel. Deprioritize that direct JS formulation.
- **Rotated core:** exact packed rotated-add/coordinate port passed all 31 rotations and cross-platform behavior. A 25M-call higher-resolution profile in workflow run 44447900344 had **0/70 >2.5x pairs on Ubuntu and 0/70 on Windows** across ten representative rotations. The worst Windows pair was 2.40385x.
- **Rotated-core attacker:** bounded Acorn source-only normalizer frozen at commit `2c478bb5e9418cc6ba0c59ef5d963a9cc3cb9614`. Post-freeze seed `heldout-after-2c478bb5:2026-11-19:agent38:a2mba-rotated-core:v1` varied rotations, identifiers, commutative spelling, and helper declaration order. It recovered **32/32** held-out cases without executing protected source; Ubuntu/Windows gate 44447366918 passed.

Primary artifacts:
- `sims/a2mba-context-int32-pilot.js`
- `sims/a2mba-rotated-core-int32-pilot.js`
- `sims/a2mba-rotated-core-static-recover.js`
- `sims/a2mba-rotated-core-heldout.js`
- `im-results/a2mba-context-int32-feasibility-2026-11-19.md`
- `im-results/a2mba-rotated-core-int32-feasibility-2026-11-19.md`

Decision: do not promote these components as standalone static-obfuscation gains. Rotated-core remains a low-cost representation transform only if a future composition can defeat the frozen canonicalizer while preserving the strict runtime boundary. The direct inverse envelope is currently a poor JS budget trade.
