# Current-main closed-world reflection extension: integration, attacker recovery and matched CPU

**Agent:** 1  
**Date:** 22 November 2026  
**Status:** independently source-pinned experimental integration candidate; **not a release-grade strong-obfuscation result**  
**Integration branch:** [\`agent1-direct-reflection-rebase-20261122\`](https://github.com/FlareZ123/obfs/tree/agent1-direct-reflection-rebase-20261122)

## Scope

The historical [PR #159](https://github.com/FlareZ123/obfs/pull/159) extended positive closed-world ESM property proof from direct \`Reflect.get\` / \`Object.hasOwn\` to \`Reflect.has\`, \`Reflect.getOwnPropertyDescriptor\`, \`Object.getOwnPropertyDescriptor\` and the exactly three-argument \`Reflect.set\`. Its historical branch no longer merged cleanly against moving main, and a passing old source pin could not certify new compiler interactions. Agent 1 created a fresh current-main branch at base \`d11274965115c5330687cdce213c6135e941765d\` and ported the narrow proof, the seedless attacker normalization and the real browser fixture. The local non-closed-world proof remains conservative. The published native \`Object\` / \`Reflect\` source-stability gate still rejects shadowing, global-root aliases and unproved mutations. The reflective call proof enforces a literal key, direct receiver, exact arity and **no spread argument**, so a spread cannot silently introduce an additional receiver.

## Source-pinned regression gates

| Distinct obligation | Source SHA | Ubuntu Node 22 | Windows Node 22 | GitHub Actions |
| --- | --- | --- | --- | --- |
| 14 historical and current ESM native/emitted reflection cases, strict project and external JSDoc | \`9a829cee892ce392dca41270896e0a80b5649dee\` | passed | passed | [45000635447](https://github.com/FlareZ123/obfs/actions/runs/45000635447) |
| Seedless public-source normalizer recognizes all admitted reflection selectors, strict project/external JSDoc | \`592d44002e74fa6b414e30418df3a2b750c0dafd\` | passed | passed | [45000810544](https://github.com/FlareZ123/obfs/actions/runs/45000810544) |
| All 12 separate reflection shapes show exactly two actual field renames, strict project/external JSDoc | \`1ce10a5ecab53b0272785cfa189765c6d0acddb3\` | passed | passed | [45001311811](https://github.com/FlareZ123/obfs/actions/runs/45001311811) |
| Chromium browser integration including new reflection methods and unrelated browser controls | \`b3e203a9a5fed8e5479668285d6d762cc803c31b\` | passed | n/a | [45000893122](https://github.com/FlareZ123/obfs/actions/runs/45000893122) |
| Original vs generated vs ordinary esbuild-minified executable hot ESM, exact output parity and genuine positive renaming, strict JSDoc | \`9e6f302b3bf9d8989611313b41783047d77dd05a\` | passed | passed | [45001388848](https://github.com/FlareZ123/obfs/actions/runs/45001388848) |

These are **different source pins** and their separate green outcomes cannot be passed off as a single combined full correctness run.

## Red-first positive-yield correction

The first three-way benchmark source included two \`throw new Error\` branches and a descriptor-derived third argument to \`Reflect.set\`. The compiler produced **zero** private field rewrites, and the strict \`rewrittenFields===2\` test correctly failed on both operating systems ([45001195461](https://github.com/FlareZ123/obfs/actions/runs/45001195461), source \`9601567ee0cbfee047a34815ddc2fcd7a5422361\`). The reason for refusal was not separately isolated to a single expression. The 12-case follow-up grid then proved private function loops, direct descriptors and a literal \`Reflect.set\` can each rewrite both fields. The revised benchmark uses the verified combined private-loop grammar and preserves its public wrapper's exact \`Function#toString\`. That produces **2/2** rewrites.

The red-first example is a coverage exclusion, not a native/emitted behavioral counterexample. Never count a benchmark on zero transformed code as protected-work evidence.

## Matched CPU results, seven trials per OS

The [profile source](../sims/direct-reflection-native-minified-profile.js) performs 1,000,000 iterations per measured call, repeatedly executing \`Reflect.has\`, \`Object.hasOwn\`, \`Reflect.getOwnPropertyDescriptor\`, \`Reflect.set\` and \`Reflect.get\` on two compiler-renamed fields. It uses an actual compiled two-module ESM distribution, the untouched original, and an ordinary \`esbuild.transform(...,{minify:true})\` **equal-trust unbundled** control. The public exported \`run()\` wrapper retains exact original source under the compiler. Every native/protected/minified result agrees. The original source has 498 bytes, generated protected 541 bytes, and ordinary minified 377 bytes.

| OS | Protected/native median process CPU ratio | Minified/native median | Protected strict >2.5× pairs | Minified strict >2.5× pairs | Raw source |
| --- | ---: | ---: | ---: | ---: | --- |
| Ubuntu Node 22.23.4 | **0.99898×** | 1.00225× | 0/7 | 0/7 | [run 45001388848](https://github.com/FlareZ123/obfs/actions/runs/45001388848) |
| Windows Node 22.23.4 | **1.00000×** | 1.12000× | 0/7 | 0/7 | [same run](https://github.com/FlareZ123/obfs/actions/runs/45001388848) |

The harness records the actual microsecond user+system CPU and wall time for every variant and trial, plus identical checksums. Ubuntu native calls consumed about 70–72 ms CPU, and Windows about 94–157 ms in this run; Windows CPU values showed relatively coarse time quantization. The first cold ESM import times are logged but order-biased and sub-millisecond-to-few-ms; they **are not** trustworthy startup budget evidence. No WAN, browser hot-loop, whole-session, worst-case, dynamic extraction or authorization comparison is part of this measured sample.

The profile shows no sampled strict runtime cost veto **for this hot workload**. It does not establish a universal bound, or an attacker-cost advantage. The public-token normalizer succeeded on the new syntax, demonstrating how simply renaming these fields remains statically reversible.

## Integration decision

This change is an incremental conservative semantic coverage improvement. To merge, rebase/cherry-pick the narrow branch changes onto a frozen current-main source, verify all relevant separate witnesses at that exact head, and run one full correctness integration with native/compiled, ordinary control, strict JSDoc and real browser checks. Do not blindly merge historical #159, and do not relax the realm-integrity or exported-entrypoint API assumptions of [the closed-world proof contract](../docs/CLOSED_WORLD_PROPERTY_PROOF.md).

The [primary release decision](../results/README.md) remains **RELEASE-BLOCKED** for strong confidentiality, anti-tamper, environment locking and universal 2.5× compliance.
