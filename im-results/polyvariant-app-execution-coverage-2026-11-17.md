# Frozen COO application: execution-weighted protection coverage and public reconstruction

**Agent 8, 2026-11-17 UTC. Classification: intermediate reproducible evidence, not an academic security claim.** This experiment asks whether the three truly transformed arithmetic functions in the frozen three-module application are actually exercised frequently when the complete stateful application is used. It also checks that a seedless, source-only attacker can replace every one of those frequently executed functions while preserving observable full-application behavior.

## Fixed program and test instrument

- Original program: [polyvariant-app/native](../examples/polyvariant-app/native/) with \`math.mjs\`, \`state.mjs\`, \`entry.mjs\`. Delivered compiler-produced program: [polyvariant-app/generated](../examples/polyvariant-app/generated/). The [builder](../examples/polyvariant-app/build.cjs) regenerates the delivered bytes using the actual COO compiler and an explicit selected arithmetic island.
- Independent adversary: [polyvariant-app-static-clone.js](../sims/polyvariant-app-static-clone.js). It reads **only distributed math source** and reconstructs native-form, algebraically equivalent functions from the visible affine machinery without the original file, compiler, or seed. The caller retains the publicly distributed \`state.mjs\` and \`entry.mjs\`.
- Measurement implementation: [polyvariant-app-execution-coverage.js](../sims/polyvariant-app-execution-coverage.js) plus its [test](../test/polyvariant-app-execution-coverage.test.js). It imports three separate native ESM graphs from temporary directories. After the original, published and attacker-rebuilt sources are fixed, it inserts one function-entry counter at the start of each exported \`round1\`, \`round2\`, \`round3\` **in disposable copies only**. The published files and attack reconstruction are not modified in the repository.
- The corpus is 1, 50, 1,000 and 10,000 sequential stateful events. Records include non-ASCII BMP characters and a supplementary-plane character, so expected call counts use **JavaScript UTF-16 code-unit lengths** after \`String(kind)+':'+String(payload)\`, exactly like the real \`digest\` loop.
- Each graph handles the identical event stream and seed, and the test asserts **full returned JSON equality**, equal state transitions, all reflected state/host records embedded in that JSON, and exactly one external \`host.emit\` callback per event. It verifies each independently counted protected entry equals the number of input code units.

The original 2,467-byte source has an exactly selected **309-byte contiguous source region**, including export spellings and its trailing separator; direct AST function declarations themselves total **284 bytes**. An earlier report used a slightly different **310-byte** region accounting. Both represent approximately 12.5–12.6% of the complete original source; neither value is a measured runtime-cost fraction. The delivered math module is 5,883 bytes; the independent reconstructed math module is 727 bytes on normalized LF files. The other two source modules are unchanged by the compiler.

## Exact cross-platform validation

[Manual workflow run **43997442203**](https://github.com/FlareZ123/obfs/actions/runs/43997442203) completed successfully on **Ubuntu and Windows Node 22.23.4** at commit **\`3ed3ac861b8929cc417a1a8d66bb3d46c0e53072\`**. Both runners passed the focused Node tests, all existing polyvariant affine and complete-application workflow checks, real Chromium testing on Ubuntu, base strict JSDoc, and the separate strict JSDoc project covering this new measurement.

Identical independent outputs on both platforms:

| Stateful events | Digest input UTF-16 code units | Calls to each of round1, round2, round3 | All selected-function calls | External host emissions |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 15 | 15 | 45 | 1 |
| 50 | 628 | 628 | 1,884 | 50 |
| 1,000 | 13,635 | 13,635 | 40,905 | 1,000 |
| 10,000 | 146,340 | 146,340 | **439,020** | 10,000 |

**Every row matched exactly across all three separately executed graph variants:** original native, compiler-produced public, and source-only attacker-reconstructed. The attacker replacement was therefore executed in precisely the same selected hot paths at these tested event sizes, rather than merely cloned as an inert file.

Normalized reproducibility hashes: original three-file source \`42c039f233285da6dc8f837b3ff2aca62ad73b659cc715838c48fc3226cb52a8\`; published math \`2fb5d6d19fe4162f8308882b35668f079d6d377e3be2e39f15f1c1b582a722da\`; reconstructed math \`95829d27668a8b2f69be8c63d5df98a4bc1e2654095d171f1195ed954a72d59d\`. These are artifact identities, **not** integrity protection against full-control client attackers.

The same pinned workflow also independently ran the established uninstrumented seven-pair fresh-module full-session benchmark:

| Events | Ubuntu obfuscated/native | Windows obfuscated/native |
| ---: | ---: | ---: |
| 1 | 1.241× | 1.102× |
| 50 | 1.437× | 1.200× |
| 1,000 | 1.603× | 1.414× |
| 10,000 | 1.265× | 1.305× |

All eight measured whole-program ratios were below the required 2.5× on this particular graph and hardware. This is a whole-session sample, including ESM import, state changes and host calls, with file materialization excluded. The original and attacker-rebuilt graphs are **not** scored as a security or performance improvement because they are attacker controls.

## Interpretation and limits

The new measurement removes an ambiguity in the old 12.6%-of-source claim. Although selected source is a modest fraction of original bytes, the selected functions execute **hundreds of thousands of times** during a sufficiently long stateful session. The public-source attacker reconstructs all three and replays the same observable work at these lengths. Thus weak clone resistance cannot be excused merely by claiming the transformed leaves are dormant.

This does **not** show what proportion of CPU cycles those calls consume. Counters add work and are intentionally excluded from timing; they prove dynamic invocation counts, not exclusive processor time, allocation share or branch coverage. The independent arithmetic recoverer is tailored to a restricted two-case affine grammar and yields algebraically equivalent code, not an exact copy of the original nested arithmetic AST. The tested corpus is finite and contains no adversarial host-intrinsic overrides. The test does not prove universal JavaScript equivalence, attacker human/LLM effort, or performance across other workloads, browsers or machines.

**Decision:** preserve polyvariant affine as an opt-in compatibility and syntax-diversity experiment. Even high actual use of the selected protected leaf calls did not prevent independent source-only reconstruction of these tested operations. Stronger candidates need a measurable increase in independent attack effort against a native/minified control while preserving genuinely sensitive work, host behavior and the complete-session 2.5× performance envelope. SCO server-side partitioning remains the relevant architecture for keeping undistributed implementation bytes away from a full-control client; legitimate remote oracle relaying remains an independent threat.

Related evidence: [original application and source fraction](polyvariant-app-attack-cost-2026-11-16.md), [full source-only reconstructed ESM application](polyvariant-app-native-rebuild-2026-11-16.md), [whole-session performance harness](../sims/polyvariant-app-budget.js).
