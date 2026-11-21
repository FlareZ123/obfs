# A black-box query lower bound for rank-r additive-output perturbations

**21 November 2026, Agent 50. Classification: intermediate mathematical context, standard forward-oracle permutation search argument.** This is a companion to the separately reviewed rank-r chosen-query inversion construction. It supports the scale of the `2^r` orbit bound without claiming originality, source reconstruction, or obfuscator security.

## Proposition

Let `n>=r>=1`, let `U` be a publicly known `r`-dimensional subspace of `GF(2)^n`, and put `N=2^r`. Define an oracle family `F_P` that applies any unknown permutation `P:U->U` on `U` and acts as identity on all inputs outside `U`. Every `F_P` is a permutation admitting

`F_P(x)=x + W g_P(x)`

with `A=I` and `im(W)=U` of rank `r`: simply take `g_P(x)` to be the coordinates of `F_P(x)+x` in a fixed basis of `U`. This remains true whether `P` is linear or of arbitrarily high nonlinear degree.

Fix `y in U`, and sample `P` uniformly among all `N!` permutations. Any (possibly randomized and adaptive) inversion algorithm given this full family promise, the exact subspace `U`, and at most `q<N` **distinct forward-oracle queries counted across all phases** has success probability at most

`Pr[correct inverse] <= (q+1)/N`.

Queries outside `U` reveal only known identity outputs and are useless. The target preimage is uniformly distributed among `N` possible inputs. For each queried input in `U` that has not mapped to `y`, the conditional target preimage remains uniform over the unqueried inputs. After `q` misses, a single unqueried guess succeeds with probability at most `1/(N-q)`. Symmetry gives the exact optimal success `q/N+(1-q/N)/(N-q)=(q+1)/N`; optional early stopping does not improve this upper bound.

Consequently, a `>=2/3` target-inversion success criterion on this family needs `q >= ceil(2N/3)-1`, and a deterministic or Las Vegas algorithm requiring **certainty** on every member must in the worst case obtain `N-1` independent forward images, even knowing the nonlinear output subspace and affine core. A rank-r cycle walk taking at most `2^r=N` forward queries has the right worst-case exponential scale, within one query of the certainty lower bound on this special family. This does **not** prove that its `n+1` setup and randomized completion overhead are optimal.

## Exhaustive finite control

Enumerating all 24 permutations of a four-element `U` and fixing `y=0` gives exact optimal success probabilities after `q=0,1,2,3` distinct forward queries of `1/4, 1/2, 3/4, 1`, matching the bound without asymptotics. This elementary enumeration was reproduced independently using Python's `itertools.permutations` and exact rational `fractions.Fraction`. No GitHub CI artifact is claimed for this micro-control; the proposition follows from its symmetry proof.

## Boundaries

The lower bound assumes only *forward* chosen-input oracle access to a uniformly random member of this subfamily and charges all preprocessing queries. Supplying an inverse oracle, an explicit circuit/source, a prior lookup table, unrelated side-channel information, or free preprocessing can invalidate its cost interpretation. It is an information-theoretic black-box observation, not a computational-hardness result about actual code obfuscation.

The positive algorithm's upper bound applies to all promised rank-r permutations; this lower bound only requires a hard subfamily. The general strong-protection release decision remains **RELEASE-BLOCKED**.
