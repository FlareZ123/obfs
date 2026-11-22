# Source-independent coset-profile cloning of arbitrary hidden-rank bitvector oracles

**Status:** Intermediate mathematical/experimental adversarial result, 22 November 2026. Exact source-pinned Linux/Windows Node 22 + strict JSDoc green at [Actions 44969316885](https://github.com/FlareZ123/obfs/actions/runs/44969316885), commit `bc3b15177caeb0c11794fbe5f83e0105d8fa958e`.

**Implementation:** [`sims/projected-affine-coset-profile-clone.js`](../sims/projected-affine-coset-profile-clone.js); [independent source generator and differential test](../test/projected-affine-coset-profile-clone.test.js). The attack receives only forward oracle results. The source generator's hidden maps, affine core and lookup table are not inputs to the learner.

## Precise family and security scope

Let `F: GF(2)^n -> GF(2)^32`, `1 <= n <= 32`, be a **fixed, deterministic** oracle of the form

```text
F(x) = b XOR A*x XOR g(V*x)
```

where `A` is any unknown linear map, even singular; `rank(V) <= r <= min(n,8)`; `g` is any vector-valued truth table on the projected coordinates, with no degree, injectivity or permutation promise. The attacker knows the upper bound `r`, can query the **same function** on chosen `x`, and wants a reusable offline implementation. No forward queries are allowed during post-training evaluation.

This is a strong promise on the source family. It does not imply that a general server-private JS application, a changing-session oracle or an authenticated RPC graph is clonable. The attack recovers *behavior* on the numeric bitvector domain; it does not recover the private source code, keys or original hidden projection.

## Anchor-profile constructive argument

Choose `r` independent-uniform public anchor inputs `a[0]..a[r-1]`. For each `r`-bit selector `s`, let `u(s)` be the XOR of its selected anchors. Ask for the complete `2^r`-element anchor cube.

For any inputs `x,y` define the public second difference

```text
D(x,y) = F(x XOR y) XOR F(x) XOR F(y) XOR F(0).
```

The unknown affine part cancels, so `D(x,y)` depends only on `V*x,V*y`. If the `V*a[j]` span the image of `V`, every standard input basis `e[i]` has some `s[i]` for which `V*e[i] = V*u(s[i])`. Thus the entire `2^r`-element profiles `D(e[i],u(t))` and `D(u(s[i]),u(t))` match.

Importantly, a profile match need not identify the original projection coordinate. Agreement for all anchor-cube inputs implies that `h[i] = e[i] XOR u(s[i])` is in the **nonlinear radical** `R = { h : D(h,y)=0 for all y }`. The radical is a linear subspace; along its vectors, `F` changes by a constant additive difference.

Define `c[i] = F(e[i]) XOR F(u(s[i]))`. Then for every input `x`, the model

```text
s(x) = XOR over set bits i of x: s[i]
clone(x) = F(u(s(x))) XOR (XOR over set bits i of x: c[i])
```

agrees exactly with `F(x)` whenever the anchor projection spans. In this case the stored model has `2^r` output words and `n` coordinate/correction pairs; it no longer needs its oracle. A single fitting attempt asks at most `(n+1)*2^r` distinct inputs, with duplicate responses cached globally.

## Finite-confidence failure analysis

For actual hidden projection rank `k<=r`, a uniform `r`-anchor tuple spans its projected image with probability

```text
prod(i=0..k-1) (1 - 2^(i-r)) >= p_r
p_r = prod(i=0..r-1) (1 - 2^(i-r)).
```

An incomplete tuple can yield a partially matching but wrong clone, so every finished candidate is checked against a common independent, precommitted set of `t` uniform held-out inputs. Both the promised source and each candidate have algebraic degree at most `r` over `GF(2)`. If they differ, some scalar output-bit difference is a nonzero polynomial of degree at most `r`; the elementary Reed-Muller minimum-weight bound gives mismatch probability at least `2^(-r)` under uniform input. This applies to the **entire domain**, rather than only a finite set of manually chosen outputs.

After at most `M` independently drawn anchor tuples, union-bounding the two failure events gives

```text
P[wrong clone or no clone] <= (1 - p_r)^M
                         + M * (1 - 2^(-r))^t.
```

The learner selects `M = ceil(log(delta/2)/log(1-p_r))` and `t = ceil(log(delta/(2*M))/log(1-2^(-r)))`. Its strict source-query cap is `M*(n+1)*2^r+t`, even when all candidates decline. At `n=32`, `delta=1e-10`:

| Upper projection rank | Span probability `p_r` | Attempts `M` | Verifier samples `t` | Maximum distinct source queries | Computed total error bound |
|---:|---:|---:|---:|---:|---:|
| 4 | 0.3076171875 | 65 | 433 | 34,753 | 8.94045917e-11 |
| 5 | 0.298004150390625 | 68 | 880 | 72,688 | 8.55251541e-11 |
| 6 | 0.2933478355407715 | 69 | 1,775 | 147,503 | 8.93610386e-11 |

The caps are **worst-case upper bounds**, not observed query consumption. The geometric expected cap before caching/early rejection is appreciably lower, but a single sample transcript cannot establish a distributional guarantee. Real confidence requires genuinely independent uniform anchor and verifier inputs, which the default attacker obtains from Node's cryptographic `randomInt`; seeded reproducibility fixtures are expressly **not** independent random trials.

## Executable adversarial checks

The source-pinned differential test on **Ubuntu and Windows** passed:

- 36 independently generated full-width 32-bit source oracles spanning hidden ranks four, five and six, with arbitrary vector lookup entries and unknown affine columns;
- 147,456 held-out offline output comparisons after the test closes source-query access;
- 12 deliberately noninjective cases and nine sparse nonlinear truth-table cases;
- 48 small-width source instances, with every possible input checked for each, totaling 2,304 exhaustive-domain outputs;
- JSON round-trip of the model before offline evaluation; verification of reported call counts, confidence-bound metadata and invalid parameter rejection;
- strict JSDoc check of both the attacker and its differential test.

A red first-pass CI run [44969123375](https://github.com/FlareZ123/obfs/actions/runs/44969123375) exposed an unbound result-metadata variable; a second red run [44969213350](https://github.com/FlareZ123/obfs/actions/runs/44969213350) caught another such typo. Both were corrected. The subsequent full two-platform run [44969316885](https://github.com/FlareZ123/obfs/actions/runs/44969316885) passed. The evidence supports the corrected, source-pinned implementation only.

## Prior art and comparison

Arvind, Köbler and Lindner, *Parameterized Learnability of k-Juntas and Related Problems*, ALT 2007, pp. 120–134, §5, already explain that an unknown Boolean function of `k` linear forms over `GF(2)` can be exactly learned via membership queries in `2^{O(k)} poly(n)` time, by reduction to the Kushilevitz–Mansour learning result. Primary PDF: https://www.informatik.hu-berlin.de/de/forschung/gebiete/algorithmenII/Publikationen/Papers/juntas.pdf . This prior work rules out claiming novelty for generic fixed-rank learnability. The repository contribution is a concrete source-independent **vector-output plus unrestricted affine component** construction, an explicit finite-confidence call bound, and cross-platform executable adversarial evidence. Whether its precise profile method or constants predate this implementation remains unreviewed.

Existing source-family-aware attacks are much cheaper for some narrower forms: the repository already demonstrates ≤244 queries for rank-two projected arbitrary tables, ≤935 for rank-three projected tables, 1,135 for quartic-free rank-four cubic sources, and 1,426 for quartic-present rank-four sources. This generic profile learner is **not an improvement for those families**. Its additional scope is arbitrary nonlinear tables at projected rank five or six without assuming degree two or four.

## Consequences and remaining checks

A server-owned secret nonlinear function that depends on only six hidden linear input bits cannot claim protection merely from an inaccessible source file or from projection rank, if callers can make sufficiently many unrestricted legitimate forward requests to a **fixed** 32-bit oracle. The result is a chosen-query cloning risk, independent from conventional JS static extraction.

For SCO candidate selection, require a real authenticated HTTP boundary using the *same* fixed function, a source-independent attacker under the identical query budget as the comparison arm, and distinct tests for server authorization and production resource constraints. Functional cloning here is not proof of unauthorized server execution, general JS compatibility, anti-debugging resistance or the 2.5× defender runtime bound. Main project release decision remains **RELEASE-BLOCKED**.
