# Chosen-query inversion of compatible permutations with one unknown GF(2) linear wrapper

**Established result.** For any finite width `n`, let `P` be a permutation of `n`-bit words that preserves every congruence modulo `2^k`. Let `L` be any unknown invertible linear map on `GF(2)^n`. Given chosen-input oracle access to either

```text
F(x) = L(P(x))
```

or

```text
F(x) = P(L(x))
```

an attacker can recover the unique preimage of any published target `F(c)` without reconstructing `P` or `L`.

The outer orientation needs at most `2n + 1` distinct oracle queries. The inner orientation needs at most

```text
1 + n(n + 3) / 2
```

distinct oracle queries. At 32 bits these bounds are 65 and 561.

This is a negative candidate-selection theorem. It rules out one unknown invertible bit-linear shell as a source of chosen-query hardness for a compatible permutation.

## Definitions

Write `H_k` for the vector subspace of `n`-bit words whose lowest `k` bits are zero.

A permutation `P` is **compatible** when, for every `k` from 0 through `n`,

```text
x == y (mod 2^k)  implies  P(x) == P(y) (mod 2^k).
```

Because `P` is a permutation of all `n`-bit words, the induced map modulo every `2^k` is bijective. Integer permutation polynomials satisfying the usual `2^n` compatibility conditions are examples. Triangular bit permutations are another example.

The attacker receives a target `y = F(c)` and may evaluate `F` at inputs of its choice.

## Theorem 1: outer linear wrapper

Assume

```text
F(x) = L(P(x)).
```

For every bit position `j`, define

```text
d_j = P(0) XOR P(2^j).
```

Compatibility makes the lowest `j` bits of `P(0)` and `P(2^j)` equal. Bijectivity modulo `2^(j+1)` forces bit `j` to differ. Therefore `d_j` has lowest set bit exactly `j`.

For any `k`, the vectors

```text
d_k, d_(k+1), ..., d_(n-1)
```

form a triangular basis of `H_k`.

The attacker queries `F(0)` and every `F(2^j)`, then computes

```text
D_j = F(0) XOR F(2^j) = L(d_j).
```

The corresponding suffix is a basis of the hidden subspace

```text
S_k = L(H_k).
```

For target `y = F(c)` and any candidate `x`,

```text
y XOR F(x) in S_k
iff P(c) XOR P(x) in H_k
iff P(c) == P(x) (mod 2^k)
iff c == x (mod 2^k).
```

The final equivalence uses bijectivity of the induced permutation modulo `2^k`.

Starting with prefix zero, the attacker tests membership in `S_(k+1)` at each bit. Membership decides whether the secret has bit `k` clear. Failure of membership decides that the bit is set. The recovered prefix is extended until all `n` bits are known.

### Query bound

There are `n + 1` initialization queries: `F(0)` and `F(2^j)` for all `j`. The bit-lifting phase introduces at most `n - 1` new prefix queries because the first candidate is zero and already cached. One final equality check can add one distinct query. Hence the total is at most

```text
(n + 1) + (n - 1) + 1 = 2n + 1.
```

For `n = 32`, the bound is 65.

## Theorem 2: inner linear wrapper

Assume

```text
F(x) = P(L(x)).
```

Define the hidden input subspaces

```text
T_k = { v : L(v) in H_k }.
```

Because `L` is invertible, `T_0` has dimension `n`, and each `T_(k+1)` has codimension one inside `T_k`.

For `v` in `T_k`, compatibility implies that `P(L(v))` and `P(0)` agree below bit `k`. Modulo `2^(k+1)`, the two lifts of the same lower-`k)-bit residue must map bijectively to the two lifts of the output residue. Consequently,

```text
ell_k(v) = bit_k(F(v) XOR F(0))
```

equals `bit_k(L(v))` on `T_k`.

Thus `ell_k` is a nonzero linear functional on `T_k), with

```text
kernel(ell_k) = T_(k+1).
```

The attacker starts from a basis of `T_0`. At level `k`, it evaluates `ell_k` on the current basis, chooses one vector whose label is 1, and XOR-eliminates that vector from every other label-1 basis vector. The remaining vectors form a basis of `T_(k+1)`. The removed pivot is retained as a toggle `p_k` that belongs to `T_k` and lies outside `T_(k+1)`.

To invert a target, keep a candidate whose output agrees with the target modulo `2^k`. XOR with `p_k` preserves the lower `k` output bits and flips the next congruence bit. One oracle comparison therefore decides whether to apply the toggle.

### Query bound

Learning the complete nested flag uses at most

```text
1 + n + (n - 1) + ... + 1
= 1 + n(n + 1) / 2
```

distinct queries.

The inversion phase adds at most `n` distinct queries after cache reuse, including its final equality check. The total is therefore at most

```text
1 + n(n + 3) / 2.
```

For `n = 32`, the bound is 561.

## Reproducible evidence

The 32-bit implementation is:

```text
sims/compatible-permutation-linear-wrapper-blackbox.js
```

It tests both orientations against Rivest-family permutation polynomials of degrees 3, 7, and 15, plus an independent nonlinear triangular compatible-permutation family. It generates dense-looking invertible 32x32 GF(2) maps through elementary column operations. Across 512 deterministic randomized targets, all 512 preimages were recovered exactly. The original reproducer was introduced at commit `0f116cbfb6bec2dfdb82d7853c7ffdab5cea1d13`.

An independent Agent 3 peer check is already preserved on `main`:

```text
sims/compatible-permutation-linear-wrapper-exhaustive-small.js
im-results/compatible-permutation-linear-wrapper-exhaustive-peercheck-2026-11-18.md
```

At width 3, that implementation enumerates the entire model: all 128 compatible permutations, all 168 invertible 3x3 GF(2) maps, all 8 secrets, and both wrapper orientations. It reports 344,064 exact recoveries out of 344,064 cases. The independent implementation and report were pinned at commit `67c538429c2a10657d47c8e6db61f286adb320ce`.

The exhaustive small-width computation is supporting validation. The general statement follows from the proofs above.

## Threat-model consequence

COO and SNO give the modeled attacker a locally executable published artifact, so a protected function that exposes this map is naturally a chosen-input oracle. A one-sided unknown invertible bit-linear layer therefore cannot supply chosen-query inversion hardness for a compatible permutation in those modes.

For SCO, the theorem applies when an authorized interface exposes equivalent chosen-input evaluations. The repository threat model permits unlimited legitimate requests, while a particular private interface may expose a narrower operation. Applicability must therefore be checked against the actual SCO API.

## Scope

This result covers exactly one arbitrary unknown invertible GF(2) linear wrapper, placed on either side of a compatible permutation.

The theorem does not cover the unrestricted two-sided composition

```text
L_out(P(L_in(x))).
```

It also does not claim to reproduce or break the full 2026 Wang et al. construction discussed elsewhere in the repository. The exact external construction was unavailable during this work, and additional interleaving or nonlinear layers require separate analysis.

The theorem establishes a stop condition for a broad candidate class. It does not establish strong obfuscation for any current repository backend, and it leaves the repository's primary release decision unchanged.
