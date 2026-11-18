# Conditional selected-work budget envelope for opt-in JavaScript transforms

**18 November 2026.** Analytical planning lemma and bounded numeric illustration. This is a *conditional model*, not an empirically verified runtime bound or academic security result.

## Model and algebra

Let a native repeated-compute workload take `T_native = T_selected + T_other` with nonnegative components. Define its **native dynamic compute fraction** `f = T_selected / T_native`, between zero and one. Assume the transform changes exactly the selected component by a deterministic multiplicative slowdown `s >= 1`, and leaves the other component's cost unchanged, with no interactions among JIT tiers, deoptimizations, allocator/GC, caches, native bindings, concurrency, process scheduling, or input distribution. Then:

```text
T_obfuscated = s * T_selected + T_other
R = T_obfuscated / T_native = 1 + f * (s - 1)
R <= 2.5  iff  f <= 1.5 / (s - 1), when s > 1.
```

This equivalence follows directly by substituting `T_selected = f * T_native` and `T_other = (1-f)*T_native` and rearranging, with a positive denominator. For `s=1` the modeled ratio is 1 for any `f`. If the non-selected region also incurs overhead `h`, then `R=1+f(s-1)+h/T_native`, and the permitted share shrinks. If the transformation *speeds up* some other work, the additive model does not determine an unconditional fraction requirement without its measured savings.

## Illustration using actual selected-leaf CPU medians

The [source-pinned 13-pair protected SNO benchmark](polyvariant-selected-hotpath-budget-veto-2026-11-18.md), [CI 44208868147](https://github.com/FlareZ123/obfs/actions/runs/44208868147), found hot-path ratios:

| Illustrative measured selected path ratio `s` | Maximum `f` from the **ideal additive model** |
| ---: | ---: |
| Windows 40m, 17.6170x | 9.0269% |
| Ubuntu 40m, 21.2530x | 7.4063% |
| Windows 80m, 21.2308x | 7.4144% |
| Ubuntu 80m, 31.2448x | **4.9595%** |

These percentages are **conditional budget envelopes** for a hypothetical larger workload with the exact same slowdown parameter and all unaffected execution time. They are not observed original executed-work percentages, admissibility criteria for unmeasured input, statistical confidence bounds, or authorization guarantees. The underlying selected-leaf ratio varied with trial length, platform and JIT state; the model does not claim it can be transported unchanged.

For the intentionally simpler, statically invertible compact representation, a longer [Windows 400m CPU median 2.7594x](polyvariant-compact-critical-path-2026-11-18.md) would allow a modeled `f <= 85.2563%` under the same assumptions, while the selected-only workload `f = 1` already produced a 2.7594x observed median and 11/13 strict breaches. Even an aggregate workload under 2.5x can mask a genuinely violating selected-only workload, so application composition never substitutes for testing each declared deployment class.

## Practical implications

The repository's approximately 12.5% *original source-byte* selected-graph share is a **static byte fraction**, which has no direct relation to dynamic native compute share `f`. A two-line function called ten billion times may dominate a large unselected program. An admission procedure must measure the actual native selected compute over representative workloads, include long sustained direct selected-function stress, and test both the complete application and its individual hot paths. Record the output/side-effect parity and sampled *maximum strict paired* ratios; median statistical support cannot erase a strict observed violation.

This model applies only to repeated compute under the project-stated exclusion of eligible **SNO server initialization**. COO client initialization and SCO remote-call latency require their own inclusion rules, and the algebra does not authorize amortizing any forbidden overhead. None of this provides resistance to source-only reconstruction, debug instrumentation or owner-controlled checksum replacement.

**Decision relevance:** The original long-polyvariant 17–31x selected-function slowdown gives extremely little native hot-work budget even in an unrealistically favorable additive model. The faster compact encoding improves its ideal fraction envelope but has empirically failed long-duration strict CPU pairs and is source-only recoverable. Both are negative candidates for unrestricted deployment. Use the equation to reject implausible proposals early, then validate retained proposals empirically under the actual user threat model.
