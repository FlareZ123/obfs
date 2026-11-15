# Source-only static reconstruction of 20 transformed multi-file ESM graphs

**Status:** reproducible independent semantic cloning evidence. Agent 12, 2026-11-15. A bounded experiment rather than a universal program-reconstruction theorem.

## Adversary and question

The current conservative closed-world property renamer changes safe own-field names to seeded, hash-looking symbols and updates each proven importer. The original spellings disappear from the distributed source. Is this transformation sufficient to prevent a static attacker from reconstructing a functionally equivalent readable program?

The attacker receives **only transformed source files**, with no original field names, compiler seed, runtime trace, secret-key dictionary or server memory. It runs the repository's existing source-only normalizer `sims/offline-normalize.js`, which parses emitted JavaScript, identifies the known `_p` hash-looking identifier pattern and rewrites every occurrence to a neutral serial property name. This is structural normalization and does not require guessing the original spelling.

## Reproducible setup

- Attack harness: `sims/interfile-normalization-attack.js`.
- Original independent graph generation and real ESM oracle: `sims/interfile-api-fuzz.js`.
- Automated regression: `test/interfile-normalization-attack.test.js`.
- Manual cross-platform type/safety gate: [GitHub Actions #43699731429](https://github.com/FlareZ123/obfs/actions/runs/43699731429), pinned at commit `91ce9aa07fec93fa307e12bc2d5a203465d98084`, **all 83 focused tests passed on Ubuntu and Windows**, plus strict JSDoc checking.
- Original seed matrix: 20 deterministic graph inputs with distinct private own-field names and values. Each contains a state exporter, an independent bridge importer, and an entry importer.
- Protected output: `obfuscateFiles(...,{mode:'coo',closedWorld:true,strings:false,identifiers:false,seed:'api-interfile-fuzz/'+i})`.
- Differential oracle: original code and normalized attacker output are written atomically into separate directories. Each 20-graph set is executed using the native Node ESM loader in a separate fresh process.

## Observations

| Dimension | Result |
|---|---:|
| Distinct closed-world ESM programs attacked | **20** |
| Source-only reconstructed property identifiers | **at least 40** |
| Files requiring original private field names | **0** |
| Original field spellings recovered by normalizer | **0** |
| Functionally equivalent normalized programs | **20/20** |
| Cross-platform focused gate | **Green** |

The normalizer removed the protected-looking `_p` tokens from all 20 emitted graphs; the output remained parseable and natively executable, and each output matched the original program's JSON result. The original private names were **not** recovered. Exact source restoration is a different and stronger goal than functional program reconstruction.

## Independent evaluation

1. **Static deobfuscation:** a simple seed-agnostic AST attacker succeeded for all 20 examples despite hash-looking property tokens. It produced a semantically equivalent program, although it did not restore original symbol spelling.
2. **Dynamic instrumentation:** none was needed; all inputs were distributed source files. The result does not measure the cost of a debugger-based attack.
3. **Tamper resistance / authorization:** the attacker can repackage the transformed source under COO client control. The experiment does not bypass an actual server authorization boundary.
4. **Compatibility:** the attacker output, compiler output and native baseline agree under independent real ESM loaders on the tested 20 safe graphs.
5. **Performance:** not measured. The obfuscator's whole-program 2.5× budget and decoding startup do not influence this static normalization result.

## Implication

Property renaming can reduce recognizable original names, but randomized hash-shaped keys in a **fully distributed closed-world graph** are insufficient to prevent mechanical recovery of the program's property-flow structure. The existing compiler proof makes it possible for an attacker to normalize all relevant occurrences while preserving behavior. The result is consistent with previous source-only normalization against hand-written fixtures; this contribution demonstrates the mechanism over 20 generated independent multi-module programs with a real-loader oracle.

Further investment in anti-LLM resistance or novel encoding should use this source-only attacker as an explicit baseline and show an independently reproduced increase in reconstruction effort without violating native semantics or 2.5× runtime. Strong source confidentiality in SCO requires genuinely server-retained implementation rather than cosmetic client name diversity.
