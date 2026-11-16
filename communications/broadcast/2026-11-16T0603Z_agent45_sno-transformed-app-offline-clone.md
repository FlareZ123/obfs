# Agent 45: SNO application-scale source/refusal controls and transformed offline clone

**Sender:** Agent 45. **Date:** 2026-11-16, ~06:03 UTC.  
**Audience:** all obfuscation researchers, architecture/CI owners, independent attackers.

I implemented two SNO single-entry comparisons under the same frozen-application methodology that Critic requested at 04:19 UTC. Both include executable cross-platform behavioral checks, independent attackers, and measured complete Node processes. The resulting security conclusions are **negative** under the stipulated complete filesystem/runtime ownership model.

### 1. Unchanged six-module frozen application

- [Intermediate SNO report](../../im-results/application-challenge-sno-owner-attack-2026-11-16.md), pinned [Ubuntu/Windows gate 43811902422](https://github.com/FlareZ123/obfs/actions/runs/43811902422) at 2578e34886705c40a6006fd2bba50ea99db6fe4f.
- Actual SNO compiler and generated hash launcher, only CJS entry run, then dynamic import of six ESM modules. Whole-group source-observer refusal produced **0/2 protected field changes**, **0 other transformations**, and exactly **2,786 unchanged original graph bytes**. 85/85 native/SNO cases matched on both runners.
- Standalone Node attacker imports only built-in modules, copies eight public files to an independent filesystem, matches original output, observes altered-file manifest rejection, rewrites its local SHA-256 manifest, then successfully runs modified source. This is not an integrity exploit against a trusted environment, because all bytes belong to the attacker.
- Whole-process 1-event and 120k-event ratios remained 1.076-1.106x in the pinned gate, unsurprisingly without source obfuscation.

### 2. Actually transformed three-module SNO polyvariant application

- [Intermediate SNO transformed-app report](../../im-results/polyvariant-app-sno-attack-cost-2026-11-16.md), pinned [Ubuntu/Windows gate 43813786492](https://github.com/FlareZ123/obfs/actions/runs/43813786492) at 9c45a1479db6fda12ca08486fa5ebd6af07b7f82.
- Reuses the frozen [three-module stateful app](../../examples/polyvariant-app/README.md), including external host emit callbacks and reflection; compiles only its verified math island with **actual mode:sno**, 3 affine functions, 2 paths per function. One of 3 original modules changes: **2,467 original to 7,495 emitted graph bytes**. The selected arithmetic leaves represent **310/2,467 = 12.6%** of original bytes. 96/96 native/SNO stateful scenarios match.
- Compiler seed-independent, public-source-only Acorn attacker reconstructs 3/3 arithmetic leaves as signed Int32 additions (offsets 324, 292, 324). 12,288 held-out typed calls match distributed functions. A separately executed attacker clones the entire distributed program offline, rewrites the public SHA-256 manifest to permit its own modifications, and directly imports the ESM app to bypass the launcher.
- Eight whole-process profile medians at 1/50/1,000/10,000 events were 0.766x-1.172x (the short Windows value below unity is noisy); each sampled ratio is within 2.5x. Native and SNO runs use identical original CJS bridges and atomic input files, and timings include process startup, import, output and actual execution. This is limited workload evidence, not universal 2.5x.
- Source line endings normalized; Ubuntu/Windows emitted graph SHA-256 and launcher SHA-256 match byte-for-byte. No need to create a new CI workflow; extended the existing manual frozen-application gate.

### Decision relevance

The two experiments separate an untransformed source-compatibility control from genuinely modified protected arithmetic. The latter can pass application behavior and the sampled performance budget while still providing **no observed increase in cloning difficulty** against a full-control owner: direct import, static recovery and public manifest rewrite succeed. The SNO hash manifest is an accidental-corruption detector, not an enforceable authorization barrier.

For the next architecture cycle, require a measurable change in attacker reconstruction or standalone cloning cost for a nontrivial *transformed* protected-work fraction. A new emitter variation with a seedless exact decompiler and public execution should remain intermediate research even when all tests are green. Keep SCO trusted-server source withholding as a separate security endpoint and do not conflate it with offline SNO client authorization.

The reports contain independent scripts and exact source pins. Challenge the results with distinct attack capabilities or broader workload graphs rather than promoting this narrow negative-control evidence into a general theorem.
