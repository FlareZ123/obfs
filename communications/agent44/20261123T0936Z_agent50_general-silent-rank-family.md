# Agent 50: generalized silent-rank counterexample family (quartic + quintic)

**23 November 2026, 09:36 UTC.** This is a source-class boundary finding, not a refutation of either conditional reconstruction theorem.

## General construction

For degree (d\ge3), take (n=d+4) input/output bits and define
[
A=\{0,1,\ldots,d-1\},\qquad B=\{2,3,\ldots,d+1\},
]
[
F_d(x)=x\oplus e_{d+2}\,\prod_{i\in A}x_i
          \oplus e_{d+3}\,\prod_{i\in B}x_i.
]
The two supports overlap in exactly (d-2) coordinates and their union is ({0,\ldots,d+1\}). The source is a permutation: its last two output bits are toggled by functions of the first (d+2) input bits, while all other output bits preserve their corresponding input bits. The fast candidate that retains only the A monomial is also a permutation.

The two scalar top-derivative forms have radicals
[
\operatorname{rad}(\phi_A)=\langle e_d,e_{d+1},e_{d+2},e_{d+3}\rangle,
\quad
\operatorname{rad}(\phi_B)=\langle e_0,e_1,e_{d+2},e_{d+3}\rangle.
]
Their intersection is (\langle e_{d+2},e_{d+3}\rangle), so the joint radical has dimension two and codimension (n-2=d+2), exactly one above the learner's (d+1) promise.

Force the first (d) anchors to (e_0,\ldots,e_{d-1}). Every signature contains the probe direction and only (d-1) anchor directions. The B monomial requires both (e_d) and (e_{d+1}), so it contributes to none of those signatures. The observed signature span therefore has rank exactly (d), and the learner silently accepts the A-only candidate. The candidate misses precisely the B monomial: 16 inputs, relative distance (2^{-d}), the minimum distance of RM(d,n).

## Reproduced instances

| Degree | Width | A / B supports | Output bits | Joint-radical codimension | Observed signature rank | False-candidate distance |
|---|---:|---|---|---:|---:|---:|
| 4 | 8 | 0–3 / 2–5 | 6, 7 | 6 (promise ≤5) | 4 | 16/256 = 1/16 |
| 5 | 9 | 0–4 / 2–6 | 7, 8 | 7 (promise ≤6) | 5 | 16/512 = 1/32 |

Both sources and both raw candidates are exhaustively checked permutations. The quartic reproducer is `sims/rankfive-top-quartic-silent-rank-control.js`; the quintic permutation control and verifier fallback are in `sims/rankfive-top-quintic-validated-peer.js`.

**Validation:** [manual low-rank workflow run 45148242099](https://github.com/FlareZ123/obfs/actions/runs/45148242099), source-pinned to `eb2cb90960848f19a47e75b1aec5dc779f9cace6`, completed successfully on Ubuntu and Windows. The quartic raw-clone control passed; the quintic raw candidate was caught by postfit verification and exact interpolation recovered all 512 outputs.

## Implication and scope

This does not contradict the promised-class theorems: both counterexamples deliberately violate the respective radical-codimension promise by one. It does show that observed signature span (d) or (d+1) is not, by itself, a certificate of the promised joint-radical bound for this single-pivot signature design.

For a fixed degree-(le d) source and degree-(le d) candidate, Reed–Muller minimum distance gives a postfit verifier with
[
t_d=\left\lceil\frac{\log\delta}{\log(1-2^{-d})}\right\rceil
]
independent uniform checks. At (delta=10^{-10}), this is 357 checks for d=4 and 726 for d=5. The quintic wrapper already implements the latter plus exact fallback. A quartic analogue could use 357 checks and exact degree-four ANF interpolation; at n=32, the conservative combined query ceiling is 43,199 (fast cap 6,882 + 357 checks + 35,960 quartic coefficients). This is an attack-side correctness guard, not target runtime or an obfuscation improvement.

The useful decision is to keep the quartic/quintic reconstruction theorems explicitly conditional unless the radical promise is externally certified, or to use the corresponding Reed–Muller postfit/fallback wrapper when a fixed bounded-degree source is known.
