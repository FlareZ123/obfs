# Non-bijective low-rank masks: a chosen-query image-membership criterion

**Agent 15, 21 November 2026. Intermediate attack-side theorem, pending independent review.**

## Promise and bounded claim

Let F:GF(2)^n -> GF(2)^n be an unknown fixed function with the representation

    F(x) = b XOR A*x XOR U*g(V*x)

where A is invertible, U has output rank at most r, V has input rank at most r, and g is completely arbitrary. Neither F nor g is required to be injective. The attacker receives only n, r, a forward chosen-input oracle and a target output y, without A, U, V, b or g.

After n+1 affine-basis queries, choose

    q = ceil(2^r * ln((2^r-1)/delta))

independent uniform inputs, for any 0<delta<1. With probability at least 1-delta, this preprocessing is sufficient for *every* target y to return a verified preimage x satisfying F(x)=y or correctly decide that no preimage exists. At most 2^r further queries are required per target. One-target total <= n+1+q+2^r. For separately known input-projection bound s and output bound r, use 2^s in the sampling term. This is a conditional, randomized black-box decision result, not a statement about arbitrary JavaScript or generic obfuscation.

## Proof

Query c=F(0), F(e_i), and let the public linear interpolant M have columns F(e_i) XOR c. Since M=A XOR U*D for a linear map D, rank(M)>=n-r. The residual R(x)=F(x) XOR c XOR M*x lies in im(U). Let W be the span of all R(x), with dimension t<=r.

For any nonzero scalar linear functional lambda on W, the Boolean lambda(R(x)) equals h(V*x) XOR L*x for some arbitrary h and linear L. If L is nonzero on ker(V), the expression is balanced over each projection fiber, so Pr[lambda(R(x))=1]=1/2. Otherwise L factors through V and the expression is a nonzero function of at most r uniformly distributed projection bits, so its nonzero probability is at least 2^-r. A batch of q independent uniform draws fails to span W only if one of the 2^t-1 nonzero functionals vanishes on every sample. Its probability is bounded above by (2^t-1)(1-2^-r)^q <= (2^r-1)*exp(-q/2^r) <= delta.

When the full W has been observed, for any y solve the public affine system

    C_y = { x : (y XOR c XOR M*x) belongs to W }.

Every genuine preimage lies in C_y. For x1,x2 in C_y, d=x1 XOR x2 satisfies M*d in W <= im(U). Since A*d=M*d XOR U*D*d, d lies in A^-1(im U), a subspace of dimension at most r. Thus C_y has at most 2^r elements whether or not F is a permutation. Enumerate solutions to [M | basis(W)]*(x,z) = y XOR c with ordinary GF(2) elimination, and check each x with the oracle. Finding one proves preimage existence; exhausting all proves absence, conditional on complete W. If C_y is empty, y is likewise unreachable.

**Constructive out-of-promise false-negative control.** The reproducer also
fixes a 12-bit non-injective `F` equal to the identity except
`F(0x5a8)=0x5a9` and `F(0x5a9)=0x5aa`. Its nonlinear output
differences span only two directions, but recognizing the two rare inputs
requires more than two projected input bits. With a deterministic
sampling transcript containing no modified input, the observed residual span
is zero, and the solver incorrectly calls `0x5a9` unreachable even though
`F(0x5a8)=0x5a9`. This deliberately violates the input-projection
assumption; it demonstrates why a low *output* rank alone does not justify
the advertised non-injective image-membership sampling bound. The check is
neither a probabilistic tail estimate nor a counterexample to the stated
rank-bounded theorem.

The finite sampler cannot independently *certify* global completeness of W. If g depends on arbitrarily many input bits without a low-rank V projection, a rare residual could evade the advertised q samples. The probability guarantee requires fresh independent uniform samples; a fixed-seed PRNG used for deterministic testing is not a substitute.

## Local independent finite witness

The self-contained Node 22.16.0 CommonJS witness `sims/low-rank-affine-nonpermutation.js` constructs random hidden A, U, V, arbitrary g and three families, including many-to-one cases. It independently exhausts all 4,096 input points for every 12-bit specimen; only a forward function callback is supplied to the attacker. A deterministic fixed-seed test run observed:

- 540 fully truth-table-checked functions; 274 with nonzero residual rank and 203 with singular public interpolants.
- 152 genuinely non-bijective fixtures and 152 separately checked unreachable outputs.
- 540 held-out target checks, with correct preimages.
- 24,576 exact image-membership classifications across six 12-bit r=2/3 non-bijective fixtures, all matching independent full truth tables.
- Maximum tested affine-envelope candidate count 8 and maximum conservatively counted calls 220, below the r=3, delta=1e-10 bound of 221.

These finite observations validate the witness algebra on the sampled cases, not the theoretical probability claim. The candidate must undergo independent proof review and source-pinned multi-platform execution before promotion to `results/`. No source-code secrecy, 2.5x candidate compute compliance, universal environment lock or production obfuscation improvement is claimed.

## Independent rank-two projected refinement

Agent 22's independently authored
[`rank-two projected nonbijective proof and exhaustive peer experiment`](low-rank-projected-nonbijective-ranktwo-peer-2026-11-21.md)
tightens the randomized residual-learning bound for the frequent
`rank(V)<=2` case. For arbitrary vector-valued nonlinear
`g(z_1,z_2)`, its only nonlinear Boolean monomial is
`w*z_1*z_2`, so the global post-interpolation residual
space `W` has dimension **at most one** regardless of the
output perturbation rank. If `W` is nonzero, its residual
indicator either is balanced over a projection fiber or has
one or three nonzero values among the four projected points.
Consequently, every iid uniform draw observes its direction
with probability at least `1/4`, and the exact worst-case
miss probability after `q` draws is `(3/4)^q`.

Thus `q=ceil(ln(delta)/ln(3/4))` is sufficient. At
`delta=.01` this is **17** instead of the generic bound
**23**; at `delta=1e-10`, it is **81** instead of
**97**, yielding at most `n+1+81+2^r` forward calls
for one target under the input/output rank-two promises
(**118 calls** when `n=32,r=2`). This remains a
probabilistic learning claim with no finite transcript
certificate of the input-rank hypothesis.

More generally, a rank-`s` input projection has only
`2^s-s-1` nonlinear Boolean ANF monomials. Each
vector coefficient belongs to `im U`, so
`dim W<=min(rank U,2^s-s-1)`. In the union-bound
part of the original proof, one may replace the factor
`2^r-1` by `2^d-1` with
`d=min(r,2^s-s-1)`, provided `d>=1`.
For `d=0`, the mapping is affine and the residual
sampling phase is unnecessary. This refinement follows
by counting the independent vector-valued nonlinear ANF
directions before composing with V, and does not improve
the `2^s` anti-concentration factor in general.

Agent 22's separate CommonJS witness exhaustively verified
**2,107,392** width-three rank-two input/output
representations under all **168** invertible linear
cores and all **256** nonlinear truth tables per
plane pair, checking **16,859,136** targets with zero
classification mismatches and worst positive residual
support `1/4`. Their independently implemented
32-bit noninjective inverter checks the tightened
`118`-query ceiling on hidden affine wrappers.
Their published [peer report](low-rank-projected-nonbijective-ranktwo-peer-2026-11-21.md)
maintains the exact source and CI provenance.
The upper-bound refinement is already described there;
this section attributes the work rather than claiming
an independent first discovery.

## Stronger bounded-degree attack: no target-time oracle calls

The repository **already contains a full chosen-query bounded-degree
functional clone**:
[`sims/bounded-degree-oracle-functional-clone.js`](../sims/bounded-degree-oracle-functional-clone.js)
and the independent
[`sims/bounded-degree-functional-clone-peer-check.js`](../sims/bounded-degree-functional-clone-peer-check.js).
Its ANF/Möbius model recovers every output bit of `F` using precisely
`D=sum_{j=0}^d binom(n,j)` chosen forward-oracle calls. The preceding
`D+2^r` image-membership bound is therefore valid but **not the
best oracle-query bound** when the complete function is known to have
degree at most `d`.

The [offline composition witness](../sims/low-rank-nonbijective-offline-clone-bridge.js)
reuses that existing full clone instead of copying its interpolation.
It reads the constant and degree-one ANF coefficients as `c` and the
linear columns of `M`. All coefficients of degree at least two
span exactly the global residual image `W`: their XOR combinations
generate `R(x)` for every input, and the Boolean Möbius transform
expresses each coefficient as an XOR of low-weight residual samples.
The bridge therefore builds the same small affine envelope using
**zero additional oracle queries**. Each candidate is tested against
the cloned polynomial in local memory; there is no post-training
server callback.

For promised invertible `A` and `rank(U)<=r`, the improved bound is

`Q_oracle = sum_{j=0}^d binom(n,j)`, with `<=2^r` **offline
candidate evaluations** per target. With singular `A`, replace
the offline candidate count by `2^nu` for consistent envelopes,
where `nu=n+dim(W)-rank([M|W])` is entirely public.

A local Node 22.16 source-matched run at width32, `d=2,r=2`,
trained on exactly **529** unique server calls, produced a public
529-coefficient executable clone, and then classified **2,048**
targets **without any additional attacker-side oracle calls**.
The fixture is a noninjective, full-width quadratic using a nonidentity
rotate-and-XOR affine core and two nonlinear output directions. An
independent four-input output-coset reference checked **1,613
reachable / 435 unreachable** target decisions, with at most four
offline candidate evaluations each. The test's held-out original
oracle evaluations belong to the verifier, not the attack.
The exact-output witness is local until pinned two-platform CI passes.

The same standalone bridge now includes an **exhaustive singular
affine-core control** on eight bits, with hidden nullity `k=2`,
nonlinear output rank two and true degree two. The exact ANF
clone requires **37** fitting oracle queries, then verifies
**all 256 target outputs offline**, against a complete independent
256-input image table. It finds **36 reachable / 220 unreachable**
targets, with **16 candidate inputs** for every consistent output
envelope and zero for inconsistent ones. The public nullity
formula predicts `nu=4`; the source verifier independently
checks those exact candidate counts. This supplies an end-to-end
functional-clone composition for the previous singular-A theorem
without adding a live query after training. This expanded source
also requires a fresh two-platform CI pin.


**Priority and novelty:** The `D`-query complete clone was already
established by other agents; this composition **does not introduce a
new oracle-query complexity result** for degree-bounded source
families. Its practical value is exploiting the low output rank to
avoid a generic `2^n` exhaustive preimage search after cloning.
No independent adversarial advantage over ordinary minification,
production tamper resistance, or strict2.5× runtime is implied.

### Tight full-cloning query bound even for rank-one nonbijective functions

The `D`-query interpolation requirement is not merely a
full-output-rank artifact. Fix the public affine core `A=I`,
public output direction `U=e_0`, and let
`F_h(x)=x XOR e_0*h(x)` for arbitrary scalar degree-at-most-two
Boolean polynomial `h` in `n>=3` inputs. There are exactly
`D=1+n+binom(n,2)` independent ANF coefficients.
Distinct h produce distinct F. Because `A` and `U` are
**public**, each forward output reveals exactly one unknown Boolean
value `h(x)`; adaptive `q`-query transcripts have at most
`2^q` possible response sequences.

For any fixed values of the remaining input coordinates, the two
inputs differing only in bit zero map to distinct outputs precisely
when `h(x XOR e_0) XOR h(x)=0`. That derivative equals the
affine function `a_{e_0} XOR sum_{j=1}^{n-1}a_{e_0+e_j}x_j`.
It vanishes identically if and only if all **n** stated
coefficients are zero. Thus exactly `2^(D-n)` functions in
this family are bijections, and the remaining
`N=2^D-2^(D-n) > 2^(D-1)` are genuinely nonbijective.
A deterministic adaptive forward-oracle algorithm claiming an
**exact full functional clone** on *every* nonbijective family
member must distinguish all N maps, requiring `q>=D`.
The same conclusion holds for any randomized bounded-query
algorithm with worst-case exact cloning success at least
`99%`: averaging over uniform family members, each fixed
random-tape decision tree succeeds on at most `2^q` of N
possible functions. For `q<=D-1`, that fraction is at
most `1/[2(1-2^(-n))]<=4/7<0.99`.

At `n=32,d=2`, **529** chosen Boolean-value observations
are therefore information-theoretically necessary and sufficient
for exact complete cloning within this public, nonlinear rank-one,
nonbijective family. This lower bound applies to **cloning the
entire function**. It is *not* a 529-query lower bound for
deciding the image of one target or finding one preimage.

The offline-bridge executable independently exhausts
all `2^D` scalar degree-two coefficient assignments for
`n=3,4,5`, computes the actual full truth table and
bijection status for each, and checks respectively:
`112/128`, `1,920/2,048`, and
`63,488/65,536` are nonbijective, matching
`2^D-2^(D-n)` exactly. This is a finite sanity check
of the cardinality and uniqueness argument. It does not
make ordinary linear-algebra counting a novel cryptographic
hardness assumption.

## 32-bit randomized source-path check and bit-width correctness

The original `learn` implementation was written for the initial
width-12 exhaustible domain. A subsequent full-width audit revealed
two **real 32-bit JavaScript bitwise traps**: `1 << 32` wraps
its shift count to zero, and `1 << 31` produces a signed input
address. The executable witness now draws from
`crypto.randomInt(0,2**n)` and canonicalizes all input addresses
and oracle outputs as unsigned 32-bit values, with an explicit
`1 <= n <= 32` range check. Deterministic `learnLowDegree`
already normalized its addresses in the earlier 32-bit version.

A fixed-seed input/output rank-two projected 32-bit fixture uses
two independent dense nonlinear output masks, with their projections
chosen to make the map **genuinely non-bijective**. The corrected
`learn` observed **130** distinct training addresses (33 affine
basis plus 97 uniform-seeded residual training samples), including
**49** addresses with the high input bit set. Across **1,024**
held-out target checks an independent reference enumerated the
four known output-displacement coset points and classified
**771 reachable and 253 unreachable** correctly, with at most
four affine-envelope candidates checked per target. The PRNG used
for the reproducible fixture is deterministic; these observations
do **not** prove the theorem's independent-uniform failure tail.
A separate default `node:crypto.randomInt` identity-oracle smoke
test confirms the actual 32-bit cryptographic sampler path executes
and computes zero residual, without asserting any random output
sequence. This expanded source has local Node 22.16.0 verification
and awaits source-pinned Windows/Ubuntu strict-JSDoc CI.

## Generalization: singular affine core and observable envelope nullity

The previous representation need not have invertible `A` for
correct **image-membership** classification once the full residual
span is learned. The affine envelope `C_y` still contains every
genuine preimage for any linear `A`, and exhaustive forward
verification remains exact. The difference is candidate-set size.

Let `k=n-rank(A)` be the hidden affine nullity and
`r=dim(im U)`. If `x_1,x_2` belong to one consistent
affine envelope then `M(x_1 XOR x_2)` belongs to `W`
and `A(x_1 XOR x_2)` belongs to `im U`. Therefore all
candidate differences lie in
`A^{-1}(im U)`, whose dimension is exactly
`k+dim(im A intersect im U)<=k+r`. Every nonempty
candidate set has size at most `2^(k+r)`. The randomized
uniform residual-spanning lemma remains valid because its proof did
not use invertibility of `A`; only the candidate bound changes.

More strongly, if `t=dim W`, the **fully public, measured**
value `nu=n+t-rank([M | W])` is the exact exponent
for every consistent affine envelope: it has exactly
`2^nu` distinct input candidates, since the `t` residual
columns are independent and there is a unique residual-coordinate
vector for each input. An inconsistent envelope has zero
candidates. The attacker can calculate `nu` directly after
training; the hidden `A`, `r`, and `k` need not be supplied.
The `2^(r+k)` bound follows as a corollary when those hidden
structure bounds are promised. Even without a rank bound, a verified
low-degree residual span and small measured `nu` allow exact
noninjective image classification by enumerating the public envelope.

The `envelopeNullity` function and width-12
`singularAffineDegreeWitness` in the shared reproducer test
**24** degree-two, output-rank-two nonbijective fixtures with hidden
affine nullity `k=1` or `k=2`. Independent full truth tables
confirmed **16,504** target classifications, including **16,384**
complete all-target comparisons, with largest measured `nu=4`
and largest candidate envelope **16**. Every nonempty candidate
envelope exactly matched `2^nu`, and none exceeded
`2^(r+k)`. This is a local deterministic finite check, pending
a source-pinned two-platform JSDoc CI run and independent review.

## Deterministic extension: low algebraic degree plus low output rank

An exact, seedless alternative recovers the complete residual span when
`F(x)=b XOR A*x XOR U*h(x)`, `A` is invertible, `rank(U)<=r`,
and every coordinate of the otherwise arbitrary Boolean vector `h(x)`
has algebraic degree at most `d>=1`. The input functions may depend on
**all** `n` input bits; no low-dimensional projection `V` is required.
The original `h(Vx)` input-rank-`r` promise implies `d<=r`, so this
also derandomizes the preceding image-membership criterion, at higher query
cost for some parameters.

After the affine-basis queries, evaluate each binary input vector of
Hamming weight `2,...,d` exactly once and span their observed residual
vectors `R(x)=F(x) XOR F(0) XOR Mx`. Every coordinate of `R` has a
unique algebraic normal form of degree at most `d`; its coefficients
are determined by values at Hamming weights at most `d`, using the
Boolean Möbius inversion formula
`a_S = XOR_{T subset S} R(1_T)`.
Hence each possible `R(x)` lies in the span of these observed values.
Weights zero and one have residual zero by construction, so
**the residual span is complete deterministically** after exactly
`sum_{j=2}^d binom(n,j)` extra chosen inputs. The same
affine-envelope elimination proves at most `2^r` candidates per output,
and checking those candidates returns a genuine preimage or establishes
that the target is outside the image.

A conservative total upper bound, counting training and candidate probes,
is therefore

`Q <= sum_{j=0}^d binom(n,j) + 2^r`.

At `n=32` with `d=r`, this is **35** calls for `r=1`,
**533** for `r=2`, and **5,497** for `r=3`. This is a
deterministic, conditional oracle-call bound, with no claim about the
instruction cost of the full solver or universal JavaScript behavior.
Known-degree Boolean interpolation is standard (for an explicit
ANF/Möbius coefficient formula, see [the Boolean-function algebraic-degree
study](https://link.springer.com/article/10.1007/s12095-025-00839-x)
and [the ANF implementation reference](https://booleanfunction.github.io/efficient-implementation.html)),
and the repository already has separate bounded-degree
*functional-cloning* attacks; the refinement
here couples a complete residual span to small-coset
**non-injective image membership**. Novelty needs independent review.

The new `learnLowDegree` implementation is in the **same**
`sims/low-rank-affine-nonpermutation.js` witness. Its local deterministic
source-only run checked **180** independent original
input-projection fixtures and **12** additional full-input quadratic,
rank-two output-displacement fixtures. Exact full-domain truth tables
established the observed residual span was globally complete, and
**17,700** direct image-membership classifications agreed with independent
truth tables. All 12 quadratic specimens had no nonzero direction with
constant derivative, certified by their degree-two structure and
basis-derivative checks; consequently none admits an alternate
lower-rank input projection in an affine-plus-projected form. The largest
observed conservative training-plus-candidate query count was **307**
(the width-12 `d=3,r=3` worst-case bound). An additional **32-bit** quadratic source-side witness uses two
linearly independent fixed 32-bit output displacement masks, a hidden
nonidentity invertible GF(2) affine core (16-bit triangular mixing
followed by a 9-bit rotate and constant), and two different quadratic
pair parities covering all 32 input coordinates. The independent
reference explicitly reverses the affine core after enumerating the
true four-point output-displacement coset, whereas the attacker
observes only the forward oracle, rank and degree promises. It also
checks 2,048 random affine inverse roundtrips.
The first quadratic has a nondegenerate pairwise polar form, so no
nonzero input direction has a constant derivative; the published
`rank(V)<=2` input-projection hypothesis is inapplicable, while
the rank-two **output** and degree-two hypotheses hold. Deterministic
learning made exactly **529** basis/weight-two oracle observations,
then classified **2,048** held-out 32-bit targets against an
independent oracle using the four true displacement coset points:
**1,743 reachable, 305 unreachable**, with at most four candidates
checked per target. The fully independent reference uses the known
two output directions only as a verifier; the attacker receives
forward queries and the rank/degree promises, with neither the affine
core nor the output directions supplied. This validates a genuinely
noninjective 32-bit non-projection instance locally.

A new **full parameter enumeration** at width three checks
all **42** ordered independent rank-two input projections,
all **42** independent output bases, and every one of
the **256** possible two-bit to two-bit nonlinear truth tables,
for **451,584** represented functions at public `A=I,b=0`.
It checks **all eight targets per function**, totaling **3,612,672**
exact classification comparisons against independently enumerated
8-point output truth tables. Of the parameterizations,
**379,008** are nonbijective and **261,504** have a singular
public affine interpolant. Each deterministic learner makes exactly
seven degree-two training observations, with at most four candidate
inputs subsequently checked. This fully enumerates that finite
low-rank input/output projection parameter space, with repetitions
allowed between equivalent representations. It does not exhaust all
32-bit or arbitrary JavaScript mappings, and it does not test a
different hidden full-rank A directly. Locally this expanded complete
standalone witness took about five seconds on Node 22.16.0; a matching
Windows/Ubuntu source-pinned CI result is still required.

The original deterministic width-12 source including 192 finite
fixtures passed source-pinned Ubuntu/Windows Node 22 and strict JSDoc
in [manual run 44955704794](https://github.com/FlareZ123/obfs/actions/runs/44955704794)
at `5e46ee14e724ed290d089ed493b270a9ddbe8ca0`.
The first, **unwrapped** width-32 source also passed the Ubuntu/Windows
workflow in [run 44955906851](https://github.com/FlareZ123/obfs/actions/runs/44955906851)
at `504b62bcd268cf10bbed13bc8f6134c2a10aafeb`.
The revised, wrapped width-32 witness is a **new source revision**
requiring separate two-platform CI; its local execution alone cannot
extend the above source-pinned claims. Independent mathematical review
remains necessary.


**Explicit false degree declaration.** The executable control `outOfDegreePromiseControl` builds the rank-one mapping `F(x)=x XOR (x_1*x_2*x_3)e_0` on 12 bits. It is a bijection, with exactly algebraic degree three. Every affine-basis and Hamming-weight-two residual is zero, so declaring `d=2` makes the deterministic learner incorrectly report output `0x0e` unreachable even though `F(0x0f)=0x0e`. Declaring the correct `d=3` recovers the missing residual direction and its exact preimage. This is a falsifier for **using the degree bound without proof**, outside the positive theorem's declared promise. It demonstrates that a successful finite training transcript cannot certify the degree hypothesis.

## Matching negative control: output rank two alone permits exponential image-membership uncertainty

This is an elementary forward-oracle lower-bound construction, **not a
novelty or production-obfuscation claim**. It makes the input-projection
assumption in the upper-bound theorem decision-critical.

Let `n>=3`, `e_0=1` and
`H=GF(2)^n \ {0,e_0,...,e_(n-1)}` of size
`N=2^n-n-1`. Fix the public target `y=0`, public affine core
`A=I,b=0`, and even reveal the complete family of possible oracles.
Define `F_none(0)=1`, and `F_none(x)=x` for every other input. For
each hidden `h in H`, define `F_h(h)=0` and
`F_h(x)=F_none(x)` elsewhere.

Every oracle has an affine plus nonlinear *output*-displacement
representation of rank at most two:
`F_none(x)=x XOR u(x)` where `u(0)=1`, zero elsewhere;
`F_h(x)=x XOR u_h(x)` where `u_h(0)=1`,
`u_h(h)=h`, and otherwise zero. The displacement subspace of
`F_h` is exactly `span{1,h}`, dimension two. All functions are
non-injective. But `0` is unreachable for `F_none` and has
the unique preimage `h` under `F_h`.

**Exact deterministic lower bound.** Each of the `N` hidden inputs
must be queried in the worst case for a zero-error algorithm that always
decides whether `0` is reachable in this family. Until a particular
`h` is queried, `F_h` and `F_none` return identical responses,
even to adaptive queries, and require opposite answers.

**Randomized bounded-error lower bound.** For any adaptive randomized
algorithm making at most `q` forward queries and having error at most
`delta<1/2` on *every* family member, coupling its random coins when
run against `F_none` and a uniformly chosen `F_h` gives
`q/N >= 1-2*delta`. The coupled transcripts can differ only if the
`F_none` execution queries the uniform hidden `h`, which occurs
with probability at most `q/N`. Yet correctly distinguishing the
negative baseline from positive alternatives requires a probability
difference of at least `1-2*delta`. Therefore
`q >= (1-2*delta)*(2^n-n-1)`. This lower bound counts all query
phases and holds even when `A`, the target, and the family are public.

These oracles **violate the input-projection rank promise** of the
positive upper-bound theorem. In fact, each fixed `F_h` has
nonconstant directional derivative along every nonzero input direction:
outside the two modified inputs the derivative is `k`, but at input
zero it is different. In any representation
`F_h(x)=b'+A'x+U'g(V'x)`, a nonzero direction in `ker V'`
would make its derivative constant, which is impossible. Thus `V'`
must have full input rank `n`; this is stronger than merely saying
the displayed representation uses `V=I`.

The deterministic width-eight witness in
`sims/low-rank-affine-nonpermutation.js` enumerates all **247**
hidden locations, evaluates all **63,232** resulting
input/output pairs, verifies every rank-two displacement and all
**2,223** matching basis-query responses, and checks that **217**
hidden alternatives remain indistinguishable from the negative baseline
after 30 additional distinct candidate probes. These are finite exact
controls for the family, not a general theorem proof by enumeration.

The result rules out an input-projection-free extension of the
`O(2^r)` non-injective image-membership decision criterion at fixed
output rank `r=2`. **Do not confuse this oracle lower bound with
obfuscation security:** an attacker holding published COO files or
full-control SNO filesystem/memory can read an explicitly encoded hidden
location or instrument its check. Even for SCO private code, the
specified unlimited authorized request model, side channels and
unmodeled static leakage require separate attack and runtime-cost
comparisons. The lower bound considers *only forward black-box
evaluation* of a particular promised family, and charges all queries. It does not conflict with the separate,
already-established **permutation** inversion attacks, whose
bijectivity promise excludes the negative baseline here.

## Independent peer audit and original-claim status

- **Agent 1**, in
  [the 22:25 UTC peer note](../communications/agent15/20261121T2225Z_agent1_nonbijective-lower-bound-peer-review.md),
  independently checked the hidden-location rank-two family, the
  adaptive randomized coupling inequality
  `q/(2^n-n-1)>=1-2delta`, and the derivative obstruction
  to any alternate lower-rank input projection. They found no
  counterexample but explicitly did not assess originality or run
  a new source-pinned empirical corpus.
- **Agent 18**, in
  [their 22:28 UTC peer note](../communications/agent15/2026-11-21T2228Z_agent18_nonbijective-lowrank-proof-peer-check.md),
  independently audited the deterministic ANF residual-span proof,
  noninjective candidate enumeration, and sparse output-rank
  lower bound. Their **separate standard-library Python prototype**
  (fixed seed `20261121`, `n=4`, random invertible A and rank-two
  output perturbations, degree<=2) checked **2,000** functions,
  including **1,989** noninjective specimens and **1,272**
  singular public affine interpolants; **32,000** target
  classifications agreed with independent whole-domain truth
  tables, with max four candidates. This reproduces the mathematical
  property via a second implementation, but does **not** replicate
  the Node elimination routine at larger widths.
- **Agent 22** independently implemented
  [a width-three GL(3,2) rank-two peer verifier](../sims/low-rank-nonbijective-peer-width3.js)
  and typechecked it under the existing two-platform workflow,
  initially finding and repairing a nullable-JSDoc type annotation.
  The independent source passed
  [run 44956549468](https://github.com/FlareZ123/obfs/actions/runs/44956549468),
  pinned to `0d259d16572546a589c2a5081341dbb52ed84a8c`.
  Its coverage is independent from Agent 15's 451,584-map
  `A=I` truth-table enumeration.

These are meaningful independent **correctness** checks. Neither
peer report establishes mathematical originality relative to prior
literature, and the Boolean Möbius interpolation ingredient is
classical. Keep this complete study **intermediate** until a
novelty review and a direct security-versus-minification decision
justify promotion. None of the claims unlocks the original
COO/SCO/SNO release blockers.

## Relationship to prior repository results

The previously established rank-r permutation attacks (`im-results/affine-low-rank-oracle-inversion-2026-11-21.md` and `im-results/affine-low-rank-deterministic-completion-2026-11-21.md`) permit arbitrary full-input nonlinear displacement, but rely on bijectivity for their efficient orbit-based inversion. This witness instead handles possibly non-injective functions under a *low-dimensional input projection* promise, and can classify outputs that are not in the image. It is a new scoped branch of the repository's attack-side candidate-veto research rather than a new protected transform. The project remains RELEASE-BLOCKED for the primary strong-protection objective.
