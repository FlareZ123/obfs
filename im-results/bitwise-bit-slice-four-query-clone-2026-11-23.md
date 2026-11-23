# Optimal black-box query recovery of bounded-arity bit-slice MBA functions

**Agent 17, 23 November 2026. Classification:** intermediate source-independent functional-cloning and equal-trust attack evidence. The algebra below is a direct application of classical Shannon expansion, **not a novel academic obfuscation theorem**. It does **not** imply arbitrary JS cloning or strong-protection release. Current release decision remains **RELEASE-BLOCKED**.

## Explicit target and contract

An unknown, stateless, deterministic `k`-input function `F:(Int32)^k -> Int32` is *bit-slice-local* if for every output bit position `j` there is a Boolean function `f_j:{0,1}^k -> {0,1}` such that bit `j` of `F(x_0,...,x_(k-1))` equals `f_j(x_(0,j),...,x_(k-1,j))`. Its source may contain arbitrarily many nested per-bit bitwise operations `& | ^ ~` with masks/constants and their algebraically equivalent mixed arithmetic encodings, provided the **observable mathematical function** retains this promise. No assumption about the compiler's seed, source syntax, expression tree, or obfuscated output bytes is needed.

**Excluded:** addition carrying between bit positions unless canceled in the final semantic function, left/right shifts and rotates, multiplication, unknown floating-point or string coercion, stateful functions, implicit host calls, exceptions, mutable prototypes and arbitrary JS. An attacker must first justify the promise, e.g. from independently audited target semantics or a predeclared source family; a few passing held-outs cannot prove it.

## The optimal `2^k`-query learner

For every pattern `p in {0,1}^k`, query `F` once with input argument `i` equal to **-1 if p_i=1**, otherwise **0**. Let the signed 32-bit response be `R_p`. This single result gives `f_j(p)` for **all 32 bit positions** simultaneously.

Define `m_p(x) = AND_{i=0}^{k-1} (p_i ? x_i : ~x_i)` bitwise, and return:

```
G(x) = OR_{p in {0,1}^k} (R_p & m_p(x)).
```

At any bit position `j`, exactly one conjunction `m_p(x)_j` is one: the pattern equal to the `k` input bits at that position. The OR therefore selects exactly `R_p,j=f_j(p)`. Thus **`G(x)=F(x)` for every signed Int32 input tuple**, not merely on held-outs, if the stated fixed-function promise holds.

The bound is tight in the exact worst case for the full `k`-input bit-slice-local family: independently choosing each Boolean table `f_j` gives `2^(32*2^k)` distinct possible functions. A chosen oracle call reveals at most 32 bits, so fewer than `2^k` calls cannot distinguish every member, even with adaptive queries. This is an elementary information-counting argument, not a computational hardness result. For `k=2`, **exactly 4 queries** suffice and are worst-case necessary; for `k=3`, **8**.

The JavaScript attacker `sims/bitwise-bit-slice-clone.js` implements this learner independently of the obfuscator or its compiler seed. It rejects malformed arities and non-Int32 oracle outputs/clone inputs. The returned clone uses only bitwise signed32 operations, with no secret constants beyond the four observed outputs when `k=2`.

## Adversarial tests on actual generated circuits

**Layered MBA**: `test/bitwise-bit-slice-clone.test.js` invokes the actual pre-existing `workplace/layered-mba.js` transform, requiring a real rewrite for 4 different source families × 25 seeds = **100 genuinely modified functions**. The source-blind learner makes exactly **4 black-box chosen-input calls per generated function** (400 total). Native/protected/clone agree for **190,000 independent deterministic held-out input comparisons** across boundaries and pseudorandom values. The same suite enumerates all 16 two-input scalar Boolean functions, checks a 3-input function with eight oracle calls, and demonstrates counterexamples for `(x+y)|0`, `x>>>1`, and stateful responses.

**Direct MBA**: `test/bitwise-bit-slice-direct-mba.test.js` invokes `workplace/mba-i32-lower.js`, requiring nonzero rewrites on another 4 families ×25 seeds = **100 genuinely modified functions**, again cloned with exactly **4 queries each**, matching **188,100 held-outs**. One family has source syntax containing actual carry arithmetic `((x+y)-((x&y)<<1))|0`, yet its final signed32 semantics are `x^y`; the same semantic learner still succeeds. A separate 15-seed family with true `(x+y)|0` semantics is deliberately *not* cloned by four corners; this prevents confusing syntactic MBA status with the theorem's bit-slice-local premise.

**Same-source ordinary minifier control**: `test/bitwise-bit-slice-equal-trust-control.test.js` freezes 4 original source functions and compares independently generated 20-seed layered MBA against same-source esbuild-minified CommonJS output under the same Node `vm` execution environment and same four chosen argument pairs, with 1,060 held-out comparisons per pairing. Both arms are supplied the same control-vs-candidate attacker and 4-call ceiling, with no access to original source during cloning. This demonstrates whether that restricted attack earns a query-count advantage over ordinary public minification. It does not measure static source reconstruction, and the minifier is not a matched private SCO server (both arms are ordinary public code).

## Verified source pins and limitations

- Layered attack, **5 runtime tests passed** on both OS; initial [CI run 45118698434](https://github.com/FlareZ123/obfs/actions/runs/45118698434) at `92e860c935e29cf53d49fe59e7f7b70f1c28fc29` was *red only for strict JSDoc implicit-any negative-control parameters*. Fixed them in `08fee400b8261d2c7df87e194240a8f525fb6e39`.
- **Final Ubuntu and Windows focused green**: [layered run 45118979696](https://github.com/FlareZ123/obfs/actions/runs/45118979696) and [direct run 45118992350](https://github.com/FlareZ123/obfs/actions/runs/45118992350), both at `08fee400b8261d2c7df87e194240a8f525fb6e39`, with runtime assertions, project JSDoc and external strict JSDoc passed.
- Same-source esbuild control: **[CI run 45119075652](https://github.com/FlareZ123/obfs/actions/runs/45119075652) passed on Ubuntu and Windows**, including 80 candidate/control pairings × 1,060 same-source held-out values = **84,800** comparisons per arm, **four requests to the candidate and four to the esbuild-minified control** in every case, plus normal and external strict JSDoc. Executable source pin `40523f918ad3ace2a405df0cea95b2659830f34f`.

The four/ eight-query statements concern **functional output cloning under the stated bit-slice-local promise**, not static source extraction. They are independent of published bytes, VM internals, anti-debug/anti-LLM tactics or the defender's host-lock mechanism. The 2.5× budget is a condition on the defended application's compute and is not measured by these query-only tests. No new production obfuscator backend was introduced, and there is no evidence of incremental strong security against the equal-trust minifier for these functions.
