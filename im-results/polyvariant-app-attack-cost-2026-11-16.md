# Frozen multi-file COO app: protected fraction, functional clone and full-session cost

**Agent 2, 2026-11-16.** Status: reproducible intermediate negative attacker-cost result. No security-hardness or academic obfuscation result is asserted.

## Immutable application and delivered artifact

The [frozen reference](../examples/polyvariant-app/native/) and [real compiler-generated distribution](../examples/polyvariant-app/generated/) each contain math.mjs, state.mjs and entry.mjs. [Builder](../examples/polyvariant-app/build.cjs) deterministically regenerates and byte-verifies them. Original source: **2,467 bytes** total; distributed: **7,518 bytes**. Three integer-normalized arithmetic leaves totaling **310 bytes**, or **12.6% of original source**, are selected for the two-path polyvariant backend. The math file is 832 bytes, or 33.7% of original source, and grows to 5,883 bytes after transforming its three selected functions. The other 1,635 source bytes are emitted unchanged.

The application runs string-dependent stateful digests and exports a session API. It observes dynamic input conversion, stateful event order, reflected own keys and descriptors, and an external host-supplied emit API. Its arithmetic leaves are invoked repeatedly within its iterative digest. The source-byte percentages cannot establish a percentage of runtime cost, which varies by the supplied records.

**Conservative proof limitation:** whole-graph obfuscation of all three files is refused because of reflective source/shape observation in the stateful modules. The builder explicitly isolates the safe math module and ships state and entry unmodified. The [11-test focused suite](../test/polyvariant-app.test.js) asserts this refusal and then checks **96 held-out stateful scenarios** across native and transformed output, including host callback traces, reflected descriptor results and key order.

## Independent attacker and baseline comparison

1. The seedless [AST attacker](../sims/polyvariant-affine-static-recover.js) parses the *distributed ESM* math.mjs alone, selects each of the three exported two-case affine leaf functions, and evaluates case arithmetic without executing distributed JavaScript. The differential test verifies each recovered function over hundreds of held-out signed integers.
2. The [attacker-only functional clone](../sims/polyvariant-app-functional-clone.js) imports the public generated entry.mjs and locally supplies the documented host emit callback. It immediately executes the whole application offline with arbitrary caller-selected JSON events. This attack needs no original source, build seed, authorized URL or server.
3. The native and minified-but-semantically-identical baseline share the same fully exposed application interface: direct import and local host emulation also permit functional cloning. The polyvariant output does **not** demonstrate increased effort against this functional-cloning attack. Attack effort is bounded constructively by a short executable script; no timed human or LLM attacker-cost study has been performed.

No real unauthorized-tamper or host authorization security survives complete client runtime control in this example. The app intentionally has no SCO private computation boundary. Static source-only arithmetic reconstruction and offline functional cloning are independently demonstrated; no unsupported inference about stronger unrelated architectures is made.

## Pinned whole-session cost

The [cross-platform green workflow 43804995746](https://github.com/FlareZ123/obfs/actions/runs/43804995746) at exact SHA **00f4ffff4dfded00bd00edb4807a8dab934312aa** passed eleven targeted tests on Windows and Ubuntu, strict JSDoc, deterministic output, public clone, browser arithmetic fixture, startup and session benchmarks. The [app-scale budget harness](../sims/polyvariant-app-budget.js) measures seven alternating paired sessions on **fresh unique three-file ESM module graphs** for each event count. It includes actual module import, state processing, JSON output, external host callback and result verification. File creation before the timer is excluded. It does not measure browser network delivery or generalize to other workloads.

| Events per session | Ubuntu full-program ratio | Windows full-program ratio |
| ---: | ---: | ---: |
| 1 | 1.328× | 1.146× |
| 50 | 1.358× | 1.227× |
| 1,000 | 1.293× | 1.472× |
| 10,000 | 1.387× | 1.317× |

All eight recorded app-level ratios were below 2.5×. This contrasts with the isolated, fully protected arithmetic-only short-session experiments, where startup-inclusive ratios often failed. **Most of this application remains untransformed**, so the end-to-end overhead includes substantial unchanged module work. The result illustrates why a whole-session budget without protected-work coverage can favor transformations with little security exposure.

## Decision

**Do not promote polyvariant affine as evidence of meaningful clone resistance.** Its actual multi-file distribution can be copied and run offline, and the three arithmetic leaves can be reconstructed from source. The compiler is a correct-by-tested-scope native syntax-diversity option. Its measured whole-application cost can satisfy 2.5× where the protected fraction is low. Further progress requires a different trust boundary or a genuinely measurable attacker-cost advantage on frozen workloads, independently distinguishing static recovery, runtime instrumentation, tamper response, authorization and full-session performance.
