# Intermediate synthesis: A²MBA JavaScript portability and attacker map

**Date:** 2026-11-19  
**External source pin:** `xqzme69/A2MBA-LLVM@f22cafe972989f868b2898ac4839df27fb74fc61`  
**Status:** intermediate candidate triage. This maps the pinned implementation onto the obfs Node/browser objective and records which components have executable attacker evidence.

## Component map

| Component | Direct JS portability | Current evidence | Disposition |
| --- | --- | --- | --- |
| Rule Explosion | high for i32 arithmetic | exact modular cancellation from pinned source; isolated site also falls to one-query opcode fingerprint | no standalone secrecy credit |
| Modular Scale | high for i32 | exact modular cancellation from pinned source | no standalone secrecy credit |
| Context Trap | high for i32 | exact six-form algebraic collapse; local hot-work ~1.15x–1.46x | cheap representation identity |
| Nonlinear envelope | high for i32 | direct fastest documented Newton circuit ~3.06x locally, 7/7 strict breaches | poor direct JS cost trade |
| PureIR hybrid | high for i32 | frozen one-query classifier recovered 96/96 post-freeze MBA-style sites on Ubuntu/Windows | no isolated dynamic opcode secrecy |
| Rotated-core region | high for i32 | selected-work 0/70 strict breaches per OS at higher resolution; frozen source normalizer recovered 32/32 post-freeze cases | low-cost fused representation, static recovery remains demonstrated |
| AAMBA ADC/SBB | no direct browser mapping | pinned implementation emits x86 inline assembly and explicitly manipulates CPU flags | architecture-specific |
| Paper RCR/RCL | no direct implementation mapping | pinned implementation uses `pushfq`, `stc`, `rcl`, `rcr`, `popfq` inline assembly | architecture-specific implementation |
| Hybrid NativeRegisters | no direct browser mapping | pinned planner gates native emission to x86-64 Linux/Windows | architecture-specific |
| FlagVM | no direct browser mapping | pinned implementation emits x86 add/adc/sbb/setcc/flag-dependent inline assembly | architecture-specific |

## Rule Explosion and Modular Scale

The pinned Rule Explosion forms apply an odd constant `c` and its precomputed modular inverse `c^-1`:

- add: `((x*c) + (y*c)) * c^-1`
- sub: `((x*c) - (y*c)) * c^-1`
- mul: `((x*c) * y) * c^-1`

All arithmetic is fixed width. Since `c*c^-1 = 1 mod 2^w`, each form reduces exactly to the original operation.

The generic Modular Scale layer is `(input*c)*c^-1`, so it reduces exactly to `input` under the same fixed-width semantics.

A JavaScript i32 port would spell multiplication with `Math.imul` plus Int32 coercions. Public constants still satisfy the same modular relation. Hiding or rewriting the surface form cannot change the exact two-input semantic fingerprint measured in `im-results/a2mba-hybrid-opcode-fingerprint-2026-11-19.md` if the protected site remains separately queryable.

## PureIR and region results

The pinned PureIR planner starts from one of six binary operations: add, sub, mul, and, or, xor. The frozen classifier at `a529fb903a2116efe1c195ea9a2c181769711686` uses the single probe `(2,3)`. Those operations return 5, -1, 6, 2, 3, and 1 respectively, so one exact execution identifies the original opcode.

Post-freeze held-out run 44449438588 passed on Ubuntu and Windows at source `d20bb58e77b10ed92421883528e8a3b7c46cb162`: 96/96 exact opcode recoveries with exactly 96 total candidate executions per operating system.

The rotated-core lane changes the semantic boundary by fusing a small region. That made the one-query binary classifier inapplicable to the region as a whole. A separately frozen source-aware canonicalizer still recovered 32/32 post-freeze rotated-core cases. The higher-resolution selected-work profile remained below the strict 2.5x threshold in all 70 sampled pairs per operating system.

These two results point in the same direction: deeper public per-operation rewriting does not address the dynamic query boundary, while the tested fused coordinate representation remains statically canonicalizable.

## Architecture-specific layers

`AAMBA.cpp` constructs LLVM `InlineAsm` containing x86 flag save/restore and ADC/SBB or rotate-through-carry sequences. `FlagVM.cpp` likewise emits x86 flag-dependent instruction sequences. Hybrid native lowering is explicitly admitted only for x86-64 Linux/Windows targets.

Those implementations can inform a server-native experiment, but they cannot be transplanted as the browser-target JavaScript obfuscator described by this repository's primary objective. A JavaScript reimplementation of the high-level idea would be a new construction and requires independent attacker and runtime evidence.

## Current A²MBA direction

The pinned external implementation does not currently expose an unscreened direct JavaScript component that justifies immediate integration into obfs.

Future A²MBA-derived work should change at least one of the assumptions behind the existing negative results:

- fuse enough state or context that the protected unit no longer has the six-operation two-input contract;
- avoid a public coordinate conjugation that a source normalizer can directly invert;
- preserve the strict runtime boundary on Windows and Ubuntu;
- preregister a source-aware and dynamic attacker before held-out generation.

Any new construction should be treated as a new candidate rather than security credit inherited from the external implementation's terminology.
