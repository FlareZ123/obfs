# Same-trust minifier control versus safe imported-key property renaming

**22 November 2026. Intermediate negative source-only attacker evidence.**
The original compiler source and application grammar are controlled by this
repository. This test demonstrates a bounded static transformation recovery
mechanism; it is not a human attacker-cost study or general deobfuscation
result.

## Exact executable boundary

Pinned
[Ubuntu/Windows focused run 45028691345](https://github.com/FlareZ123/obfs/actions/runs/45028691345)
passed on both Node 22 runners with project and external JSDoc at source
cf2119db5a9f4fa872d65c04c2d1894f92b8a640.

Executable: test/imported-key-fourway-attack.test.js.
The fixed generator seed is 0x56221122; 16 three-module ESM graphs each have
a uniquely spelled immutable string key, an owned object with two fields,
and a pure cross-module identity function. Each graph has four compared
distributions:

1. Original unbundled ESM files, withheld from the static normalizer.
2. COO closed-world output with strings and identifiers disabled, requiring
   at least one genuinely renamed owner field per graph.
3. An offline, seedless AST normalizer over the *emitted files alone* using
   sims/offline-normalize.js, replacing hash-shaped identifiers/literals
   with consistent arbitrary neutral names, without recovering originals.
4. Separate per-file esbuild 0.28.2 transformSync with format=esm,
   loader=js, target=node22, minify=true and no bundling, using only the
   same original public files and identical three-file distribution trust.

Every distribution executes in its own isolated Node ESM subprocess.
The test requires zero stderr, successful termination and identical
stdout for all four variants. No original-source bytes are supplied to
the normalizer. The minifier is an equal-trust size and functional
control; it is not itself fed the protected outputs.

## Exact observations

Ubuntu's log reported the following aggregate output over the 16 graphs:

| Population metric | Value |
| --- | ---: |
| Cases with all four output variants equal | 16/16 |
| Compiler-reported genuinely renamed fields | 32 |
| Offline AST-normalizer detected/replaced hashed property labels | 32 |
| Offline static normalizer oracle queries | 0 |
| Original aggregate UTF-8 source bytes | 4,315 |
| COO aggregate UTF-8 bytes | 5,036 |
| Normalized aggregate UTF-8 bytes | 5,756 |
| Equal-trust esbuild aggregate UTF-8 bytes | 4,107 |

The source-only AST normalizer recovers a functionally equivalent
program by renaming hash-shaped source tokens consistently. It
**does not recover the original field spellings** or prove the original
program syntax was uniquely reconstructed. The byte totals are sums
of unbundled generated JS source, not compressed size or runtime memory.

The first attempt,
[run 45028629714](https://github.com/FlareZ123/obfs/actions/runs/45028629714)
at 9ed7cd988d217804b637e9ca07c8c8e9532a2b42,
was an invalid positive fixture: a gratuitous Reflect.get in the
consumer conservatively suppressed all property renaming, so its
positive rewrite-count assertion failed at case 0. The corrected
source uses two direct immutable-key reads, retains the cross-file
identity transport, and passes the genuine-positive gate. The first
red fixture was **a conservative compiler refusal**, not a source
behavior mismatch or a demonstrated confidentiality bug.

## Interpretation

This selected owner-field family exhibits **zero resistance to this
existing offline structural recovery method** when measured as
functionally equivalent executable output under the stated source-only
attacker. Ordinary unbundled minification produced fewer bytes and
equal behavior for the same 16 inputs. No measured human analysis
hours, independent LLM performance, or runtime costs were scored.
Therefore an incremental security advantage for this field-renaming
strategy over minification remains unestablished. The top-level
strong-security release decision remains RELEASE-BLOCKED.

Source and threat notes:
[existing static normalizer](../sims/offline-normalize.js),
[closed-world contract](../docs/CLOSED_WORLD_PROPERTY_PROOF.md),
[methodological benchmark references](../resources/obfuscator-testing-and-deobfuscation-benchmarks-2026-11-22.md).
