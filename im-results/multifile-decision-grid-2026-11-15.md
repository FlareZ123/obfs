# Pinned four-module ESM comparison with real Node linking and a host API

Date: 2026-11-15. Researcher: Agent 8. Status: intermediate, manually reproducible engineering evidence; includes both transformed coverage and a limited source-only attacker challenge.

## Reproduction and scope

- Implementation and immutable corpus: `sims/multifile-decision-grid.js`.
- Pinned head: `6f2af6cf765b6d80ecd784d1ae5742bf0e0a639e`.
- Manual CI: [run 43691781949](https://github.com/FlareZ123/obfs/actions/runs/43691781949), successful on Node 22.23.4 Ubuntu and Windows.
- Original source group: four executable `.mjs` files, 964 bytes in total. `state.mjs` exports a two-field private object and a two-property reader; `consumer.mjs` imports both, uses an alias and calls the imported helper; `external.mjs` delegates to `globalThis.window.api.bridge`; `entry.mjs` links all modules and runs deterministic arithmetic against the ambient API.
- Same source/graph for the primary Acorn `src/` pass and independent TypeScript-checker `lib/` pass. Four unpublished deterministic build seeds per candidate. Both pass `closedWorld:true`, and main pass uses `strings:false,identifiers:false` to isolate object-property transformation. All source files and their SHA-256 values are available in the script and machine-readable CI output.

Native Node ESM linker and real subprocesses execute original, transformed and attacker-normalized graphs. No mocked import system is used. Five native process trials per measured candidate verify repeated deterministic output and report timed hot loops from within the module process, excluding process startup. External `window.api.bridge` remains a defined host interface. Every trial's output matches the baseline checksums and reports the host API is intact.

## Transform coverage and source-only attacker

The offline attacker receives **only transformed files** with no original source, seed, runtime debugging, or output oracle. The attacker independently assigns readable sequential labels to hash-looking names using `sims/offline-normalize.js` (Acorn) and `sims/reconstruct.js` (TS comparator). The reconstructed files are then linked and executed in native Node. This measures mechanically neutralizing the obfuscator's emitted spelling, not recovering original key names.

| Candidate | Original bytes | Output bytes | Properties renamed | Normalized names (four seeds combined) | Native semantic successes | Executable attacker-normalized graphs |
|---|---:|---:|---:|---:|---:|---:|
| Main Acorn `src/` | 964 | 964 | **0** | 0 | 4/4 | 4/4 |
| TypeScript checker `lib/` | 964 | 991 | **2** | 8 | 4/4 | 4/4 |

The main pass conservatively declined the compound imported-reader flow, leaving the input unchanged under the selected settings. This is a coverage limitation, not a behavior change. The comparator admitted one private object with two fields and rewrote its statically provable uses in this fixture. The normalization attack defeated the cosmetic hashed spelling of those two fields on all four seeds. It does not infer their original semantic field names and does not establish an unrestricted JS deobfuscator.

## Runtime observations

Median five native-run hot-loop timings, original and candidate, for the program's 50,000-iteration measured segment. The results are not reliable evidence of a systematic optimization because each trial uses a fresh Node process and V8 JIT behavior can differ. All ratios fall below the requested 2.5× constraint in this one workload.

| Platform | Original hot median | Acorn hot median / ratio | Checker hot median / ratio |
|---|---:|---:|---:|
| Linux Node 22 | 2.138 ms | 2.183 ms / 1.021× | 1.356 ms / 0.634× |
| Windows Node 22 | 1.797 ms | 1.667 ms / 0.928× | 1.602 ms / 0.892× |

Lower observed ratios should be interpreted as timing noise and potentially different JIT schedules for this small sample, rather than proof that obfuscation speeds up arbitrary code. Compiler construction cost, initial module import, browser startup and cross-machine network are **excluded** from this hot segment. Separate prior measurements document cold-start and RPC violations.

## Five evaluation dimensions and decision

- **Static reconstruction:** one candidate emitted no changes; the other emitted deterministic hashed fields that the offline attacker converted to readable placeholders, preserving native execution across all four seeds. No increase in adversary reconstruction cost was established.
- **Runtime instrumentation:** no DevTools, debugger, memory dump or trace challenge was run here. The script-only attacker had enough source to neutralize naming.
- **Tamper and authorized environment:** local COO rewriting cannot enforce a trusted client runtime. The `window.api.bridge` receiver was preserved, but it is a host interface test rather than a resistant environment lock.
- **Semantic compatibility:** native ESM linking, imported parameters and aliases, integer arithmetic, and external API calls matched the original under four seeds. This finite sample does not prove general JavaScript behavior.
- **Performance:** selected hot-loop medians below 2.5× on both platforms. Startup is not measured in this report, so the result is insufficient to certify full COO budget compliance.

**Decision:** retain the main conservative pass for low-risk behavior-preserving transformations, treat the checker as a potentially broader experimental proof engine, and do not describe hash-like property renaming as strong static protection. For a production chooser, distinguish a measured coverage gain from measurable adversary resistance. Pair future coverage expansions with real application graphs where the added fields materially matter and with stronger attackers than label normalization.

Related evidence: [same-source VM/AST comparison](decision-grid-2026-11-15.md) and [SCO private-source/latency challenge](sco-trust-challenge-2026-11-15.md).
