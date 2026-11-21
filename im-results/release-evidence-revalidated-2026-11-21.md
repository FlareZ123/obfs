# Cross-mode release gate revalidation at current compiler source

**21 November 2026. Intermediate evidence, not a security promotion.** Maintainer source exact head `69eeb0c77023064df28c9127a659a7dc8008f833`, two-platform manual [GitHub Actions run 44930959323](https://github.com/FlareZ123/obfs/actions/runs/44930959323). Node.js 22.23.4 on Ubuntu and Windows. Both jobs passed all steps, including dependency recording, strict external JSDoc, 12 release-decision unit tests, full COO/SNO/SCO application executions and retained raw audit artifacts.

## Why this rerun matters

The preceding mainline dispatch [44930791950](https://github.com/FlareZ123/obfs/actions/runs/44930791950) exited on both operating systems before reaching adversarial or budget measurements. The frozen three-module COO public-math reconstruction asserted a historic fixed published math byte count of 5,883. The current compiler instead emitted a valid 5,863-byte math module. Byte-length drift alone is neither evidence of a new security property nor proof of a functional incompatibility.

The repaired producer now requires (1) exactly three functions **actually selected** for polyvariant lowering in the live compiler, (2) source-only recovery of all three, each with at least two native case paths, (3) published module larger than the original, (4) distinct source hashes for published and reconstructed math, and (5) unmodified state/entry modules. It records complete graph SHA-256 digests and raw paired measurements in the release report. This permits a changed compiler version to be re-evaluated without silently accepting a vacuous no-transformation candidate.

The common three-file native graph is 2,467 bytes; the emitted graph was 7,498 bytes; the public-only reconstructed graph was 2,342 bytes. Its graph digests agree across both jobs:

- Native: `42c039f233285da6dc8f837b3ff2aca62ad73b659cc715838c48fc3226cb52a8`
- Published COO: `611a2f64b5421e0e2e150cf1cca1910ac52cb49235b9321f5aa3a3e776f1545d`
- Public reconstruction: `77d535303fb563508777debc373b104c6b02c6e9959f67cf8c95e652f09579b0`

## Observed release evidence

| Source-pinned outcome | Ubuntu | Windows |
| --- | ---: | ---: |
| Protected COO functions recovered using distributed bytes | 3 / 3 | 3 / 3 |
| SNO public copy, integrity manifest forgery, loader interception | Witness succeeded | Witness succeeded |
| SCO authorized-token relay of existing service | Witness succeeded | Witness succeeded |
| Strict observed over-budget pairs in twelve-population compute-oriented join | **36** | **35** |
| Maximum paired ratio in that join | **31.53293×** | **22.19355×** |
| Final decision | **RELEASE-BLOCKED** | **RELEASE-BLOCKED** |

The twelve-population joined diagnostic uses **different runtime boundaries**, carried independently in the artifact: COO native-versus-published Node process samples; SNO post-initialization process CPU for actual application work and directly exercised selected leaves; SCO fresh localhost request/service latency. The joined strict sample count is useful as a conservative release veto, **not** a uniform measurement of pure JavaScript CPU or a probability bound on arbitrary inputs. The historical cold SNO-plus-SCO join had 10 and 9 sampled breaches, respectively, but includes different boundaries.

SCO here demonstrates only authorized same-account functional relay. It does **not** demonstrate private server-source extraction, cross-account authorization bypass, or independent offline cloning. COO source reconstruction and SNO owner execution are scoped to selected tested applications. Source-byte integrity is not an end-to-end authorization root when the SNO adversary controls its own runtime and manifest.

## Decision and reproduction

The latest run is still **RELEASE-BLOCKED** under the primary objective. The exact full report and paired samples are published as GitHub Actions artifacts `release-evidence-Linux` and `release-evidence-Windows` for run 44930959323. A current-source rerun is available through manually dispatching `.github/workflows/manual-release-evidence.yml`; the evidence must always name its new source pin and must be evaluated again after compiler changes.

No generic deobfuscation impossibility or universal 2.5× bound follows from this run. It repairs an evidence pipeline defect and independently reproduces a negative release decision under contemporary emitted bytes.
