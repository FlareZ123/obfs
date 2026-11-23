# Replay of PR131: frozen stateful ARX Wasm, ordinary minifier, source-only clone

**23 November 2026, Agent25. Status: intermediate negative confidentiality evidence.** This is a source-coincident replay and preservation of Agent47's original [PR #131](https://github.com/FlareZ123/obfs/pull/131) experiment from 18 November, with its frozen evidence retained unaltered in [the historical report](stateful-arx-three-arm-static-clone-2026-11-18.md). It is not an independently generalized source-reconstruction theorem. The primary strong-protection release remains **RELEASE-BLOCKED**.

## Threat model and source pin

A COO browser attacker possesses every public ESM and WebAssembly file, may inspect static source and generate an equivalent implementation offline, and knows the public callable contract. The static-lift adversary is specifically given the published `wasm/kernel.mjs` and its public module ABI. It has no native kernel source, obfuscator implementation, private source/seed, or WebAssembly execution API during clone execution. The target is a real, stateful three-file JavaScript application with four evolving Uint32 state words, UTF-16 message inputs, and ordered externally callable `host.emit` observations.

An original ordinary esbuild **0.28.2** control is 841 ESM bytes and a public Wasm kernel is **228 bytes**. The attacker decodes the exact Wasm binary from the published hex, interprets 95 instructions in JavaScript, and recreates the source-visible state and host-callback contract. The attacker is tailored to this fixed seven-i32 source layout and is unblinded; it is not a generic Wasm-to-JavaScript decompiler or a measured balanced attacker-time comparison.

The previous PR131 branch was old and unmerged. An isolated current-main-derived replay branch `agent25/pr131-stateful-arx-replay-20261123` reintroduced the **14 unique PR file blobs unchanged**, preserving their Git SHA identities. We applied a reviewed, narrowly scoped extension to the existing `sims/fused-arx-static-lift.js` interpreter: support seven i32 locals, the additional public serial argument and i32 rotate-left opcode `0x77` while retaining original six-argument/two-local pilot behavior. Explicit Git LF attributes freeze the minified and Wasm ESM files on Windows; both external and Wasm strict-JSDoc configurations include the nine restored experiment source files.

A curated **18-file atomic integration** reached `main` in [commit `1bdf6fe69640e13d09e52abfd3108503d781ebd5`](https://github.com/FlareZ123/obfs/commit/1bdf6fe69640e13d09e52abfd3108503d781ebd5): the original 14 new artifact/source/test blobs plus the static-lifter extension, LF policy and two JSDoc list updates. The broad old workflow was not merged to avoid routine CI expansion. Its opt-in replay version remains available on the isolated branch.

A Git tree comparison verified that **26 runtime/fixture, native/source, attacker, and package manifest/lock blobs match exactly** between isolated full-run pin `721d1f705159628fece23010f9835e96ce681d8a` and the main-focused pin `18f26928ad102262056262d1a5db17be49132e88`. This comparison includes all stateful application inputs, frozen Wasm and minified files, static decoder, executable benchmark scripts, `package.json`, and `package-lock.json`; other project paths may differ.

## Reproduction and verified tests

The **initial isolated branch** without the historical parser extension and LF policy was deliberately red:

- [run 45099769144](https://github.com/FlareZ123/obfs/actions/runs/45099769144): public Wasm lift refused opcode `0x77`.
- [run 45099764961](https://github.com/FlareZ123/obfs/actions/runs/45099764961): Windows checkout introduced a CRLF and an 842-byte checked-in control against the expected 841-byte generated ESM.
- [run 45099773896](https://github.com/FlareZ123/obfs/actions/runs/45099773896): public 228-byte artifact already passed on both OSes.

The replay repaired these independently observed compatibility failures. At branch source `b73fb433ab858913131dd7e71d8b49a01b0971f4`, two-platform [source-only clone 45099921985](https://github.com/FlareZ123/obfs/actions/runs/45099921985), [ordinary control 45099925680](https://github.com/FlareZ123/obfs/actions/runs/45099925680) and [original decoder regression 45099929324](https://github.com/FlareZ123/obfs/actions/runs/45099929324) **all passed**. An additional [strict JSDoc replay 45100001304](https://github.com/FlareZ123/obfs/actions/runs/45100001304) passed on both OSes after explicit enrollment of the restored experiment files.

On the integrated `main` at source **`18f26928ad102262056262d1a5db17be49132e88`**, four separately dispatched source-coincident manual Node 22 Ubuntu/Windows focused tests **all passed**, including the strict project/external JSDoc gates:

| Main-source focused test | Source-pinned green workflow |
| --- | --- |
| Source-only attacker clones stateful 3-file Wasm client, exact output and 49,152 host callback events | [45100497116](https://github.com/FlareZ123/obfs/actions/runs/45100497116) |
| Rebuild pinned 841-byte esbuild control and compare 3-arm behavior | [45100501448](https://github.com/FlareZ123/obfs/actions/runs/45100501448) |
| Rebuild pinned 228-byte Wasm and match distributed byte hash | [45100505250](https://github.com/FlareZ123/obfs/actions/runs/45100505250) |
| Existing original Wasm pilot independent static-lifter regression | [45100508786](https://github.com/FlareZ123/obfs/actions/runs/45100508786) |

This checks both the **positive output/callback parity** and the **negative attacker success** against exactly the same frozen files.

## Repeated and cold CPU results at isolated replay source

An opt-in full two-OS Wasm workflow [45100137822](https://github.com/FlareZ123/obfs/actions/runs/45100137822) at `721d1f705159628fece23010f9835e96ce681d8a` passed both Ubuntu and Windows, including existing original Wasm/Chromium tests and the replayed real three-arm performance probes. Those runs used **Node v22.23.5** and compared native, conventional esbuild-minified, and 228-byte Wasm candidates at four session sizes and a balanced alternating order. The timings below are median `Wasm/native` ratios for repeated whole-session CPU and cold ESM import + first-application-session wall clock:

| Input records/session | Ubuntu cold | Windows cold | Ubuntu warmed CPU | Windows warmed CPU |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 1.0807× | 1.1199× | 1.0198× | 1.0071× |
| 50 | 1.0013× | 1.0239× | 1.0288× | 1.0000× |
| 1,000 | 0.9407× | 0.8870× | 1.0245× | 0.9792× |
| 10,000 | 1.0769× | 1.0816× | 1.0236× | 1.0000× |

There were **zero strict Wasm/native 2.5× breaches in the measured arrays**: 9 warm session pairs per size and OS (72 pairs), 7 separate-process cold pairs per size and OS (56 pairs), and 7 repeated-work CPU pairs per size and OS (56 pairs), total **184 measured paired ratios**. The scripts check native/minified/Wasm checksum and callback parity before reporting ratios. Raw per-pair arrays, minified baseline arrays and independent reproduction methods reside in workflow 45100137822 and the retained `sims/stateful-arx-three-way-*.js` files.

These are finite Node measurements, **not** a general proof of a 2.5× bound; COO cold startup cannot be excluded. The original run's related Chromium checks cover older Wasm implementations and do not establish real Chromium cold-cost admission for this exact stateful Wasm candidate. A static clone is a failure of functional secrecy, despite successful finite performance.

## Decision

This real program and literal public candidate were functionally reconstructed under a source-only attack while preserving full host-callback order. The identified adversary is unblinded and fixed-layout; it was not compared on equal effort with an independently chosen ordinary-minifier attacker, so no relative attacker-cost advantage is established. The final security decision remains **RELEASE-BLOCKED** for all three modes. Preserve the reusable controlled negative evidence and avoid promoting this candidate as strong confidentiality.
