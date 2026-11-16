# Frozen six-module SNO application: source-preserving build, independent owner clone, and public-manifest bypass

**Date:** 2026-11-16  
**Status:** Intermediate reproduced evidence, not an established security result.  
**Exact source:** 2578e34886705c40a6006fd2bba50ea99db6fe4f  
**Ubuntu/Windows gate:** [manual application challenge run 43811902422](https://github.com/FlareZ123/obfs/actions/runs/43811902422), both jobs successful.

## Frozen workload and compilation

Can SNO preserve the frozen six-module application while delivering a functional-cloning or integrity advantage against the stipulated attacker who controls its filesystem, Node runtime, and memory?

We reused, without editing, the six original ESM files in examples/application-challenge/before/, containing a stateful bit-mixing engine, private configuration, an external window API, and reflected schema reads. The original six files total **2,786 UTF-8 bytes**. Node 22 runs entry.mjs directly as the native baseline.

The SNO build adds one entry.cjs bridge using dynamic import of entry.mjs. The distribution has the six .mjs files, the generated entry.cjs, and the SHA-256-checking sno-entry.cjs launcher. The operating system invokes **only** sno-entry.cjs, which checks the seven application files and loads the CommonJS bridge. Dynamic import from CommonJS is supported by Node 22 [per its official ESM documentation](https://nodejs.org/download/release/v22.16.0/docs/api/esm.html).

The harness passes all seven files to the real obfuscateFiles SNO compiler with deterministic seed application-challenge-sno-20261116 and explicit property, identifier and string options. Its closedWorld option is false because the group mixes CommonJS and ESM. The conservative whole-group source-observer guard declined every transform. The **six original application files remained byte-identical** at 2,786 bytes emitted: zero changed application files, zero encoded literals, zero renamed properties, zero renamed bindings. This measures a lack of transformation coverage, rather than confidentiality.

## Behavioral equivalence and independent attacker

The regression test executes 85 deterministic native and SNO application inputs, covering zero and one events, unsigned seed boundaries and 80 further stateful workloads. **85/85 matched on both OSs.**

The test launches a **separate Node process** executing sims/application-challenge-sno-public-attacker.js. That attacker imports **only built-in Node modules** and receives the distributed SNO directory and chosen-input JSON. It has no compiler, seed, original application source, or repository helper imports. The attacker copies all eight public files into an independent temporary filesystem root, runs sno-entry.cjs, and obtains identical output SHA-256. The parent harness independently verifies the same SHA-256 against the native original. Thus the observed 85/85 cases were cloned offline, without server calls or online oracles. This demonstrates public executable copying, not clean-room reconstruction or readable-source recovery.

The attacker also changes its copy of entry.mjs, prepending a FORGED output and immediate exit. The untouched public launcher correctly rejects this modification with an integrity error. The attacker then recomputes the entry file SHA-256 using built-in crypto, replaces the exact previous digest in sno-entry.cjs, and executes the same launcher again. The altered program succeeds and outputs FORGED. This is an independently reproducible **manifest rewrite bypass** under full file ownership, not a SHA-256 collision. Other published runtime-preloader bypasses test a distinct attacker capability.

## Whole-process performance

Nine paired, alternating-order trials per workload spawn fresh Node 22 processes for native and SNO. Timings include process launch, modules, hashing, dynamic import, serialization, and application computation. Build-time compilation is excluded. Values are medians.

| OS | Workload | Native ms | SNO ms | SNO/native |
|---|---|---:|---:|---:|
| Ubuntu | 1 event | 21.435 | 23.705 | 1.106× |
| Ubuntu | 120,000 events | 28.590 | 30.771 | 1.076× |
| Windows | 1 event | 67.301 | 74.094 | 1.101× |
| Windows | 120,000 events | 75.190 | 82.472 | 1.097× |

These four medians meet the 2.5× budget only for their sampled workloads. Since protected source remained byte-identical, the ratios measure an entry bridge and integrity manifest with no obfuscation-security benefit. Short process timings are sensitive to runner noise, and no browser, network or other SNO application is covered.

## Comparative decision

The [frozen COO challenge](application-challenge-refusal-2026-11-16.md) also published unchanged source when its whole-graph observation proof declined rewriting. The [SCO variant](application-challenge-sco-source-relay-2026-11-16.md) withheld implementation behind an explicitly async trusted-server boundary but permitted online authenticated relaying. SNO offers neither the server-private boundary nor an integrity guarantee against its complete-runtime owner.

**Decision:** Retain the SNO manifest as an accidental-corruption detector and this experiment as a compatibility and security-negative control. Do not claim a self-contained editable hash enforces execution authorization. Do not count byte-identical source as obfuscated. A future candidate requires either a different trust boundary or measured attacker-cost improvements on transformed protected work.

## Reproduction

On Node 22, after installing dependencies, run the test and paired profile:

    node --test test/application-challenge-sno.test.js
    node sims/application-challenge-sno.js --profile

The script prints APPLICATION_SNO_EVIDENCE and APPLICATION_SNO_PROFILE JSON. The attacker can independently run against any matching SNO directory of public files:

    node sims/application-challenge-sno-public-attacker.js .\your-sno-output "[[1,10]]"

The attacker performs no network requests. Both tools remove their temporary directories after execution. The pinned source and workflow preserve exact reproducibility.
