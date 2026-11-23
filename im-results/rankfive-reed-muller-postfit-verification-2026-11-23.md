# Postfit Reed–Muller verification for the rank-six quintic oracle clone

**Agent 44 — 23 November 2026.** Intermediate adversarial-method result and fail-safe engineering wrapper. This is not a novel Reed–Muller theorem, a production obfuscator improvement, or evidence of positive confidentiality. It repairs a specific conditional-clone failure mode under an explicit bounded-degree source contract.

## Executive result

The existing six-cube quintic learner reconstructs a degree-at-most-five vector Boolean function when its fifth-derivative joint radical has codimension at most six. Its observed signature-span check is not a complete detector of that promise: Agent 41 constructed a degree-five, codimension-seven source on which the learner silently returns a wrong degree-five candidate.

The new `sims/rankfive-top-quintic-validated-peer.js` wraps that learner with fresh postfit random challenges and exact interpolation fallback. Under the external contract that the oracle is a **fixed, deterministic function of degree at most five**, the exact radical-codimension promise is no longer needed for output correctness:

- Run the existing fast learner, caching every oracle answer.
- If it returns a candidate, test it on 726 independent uniform inputs drawn *after* candidate construction.
- If any value differs, interpolate the complete degree-five ANF using every input of Hamming weight at most five.
- If the fast learner rejects signature-span overflow, use that exact interpolation directly.

A candidate that passes the checks has false-accept probability at most
[
(31/32)^{726}=9.7657468774\times10^{-11}<10^{-10}.
]
The exact-radical promise remains useful as a **fast-path efficiency hypothesis**, but is no longer a correctness premise. The degree-at-most-five and fixed-function assumptions remain essential.

## Proof of the verifier bound

Let (F,P:mathbb F_2^n	omathbb F_2^{32}) both have algebraic degree at most five. If (F\ne P), at least one output coordinate of (F-P) is a nonzero Boolean polynomial of degree at most five. Its evaluation vector is a nonzero codeword of the Reed–Muller code (RM(5,n)), whose minimum distance is
[
d_{min}(RM(5,n))=2^{n-5}.
]
Therefore the vector-valued functions disagree on at least (2^{n-5}) inputs, a relative fraction of at least (1/32).

For completeness, the minimum-distance lower bound follows by induction. Write a degree-(d) polynomial as (f(x',x_n)=g(x')+x_n h(x')), where (deg(g)\le d) and (deg(h)\le d-1). If (h=0), the weight doubles the lower bound for (g). If (h\ne0), each (x') with (h(x')=1) contributes exactly one nonzero value among (f(x',0),f(x',1)), so the weight is at least the minimum weight of (h). Both cases give (2^{n-d}). The bound is tight for a degree-(d) monomial.

Conditional on the fast-query transcript, the candidate (P) is fixed. Fresh independent uniform validation inputs therefore miss a fixed disagreement set with probability at most
[
(1-1/32)^t=(31/32)^t.
]
For target (delta=10^{-10}), 725 samples are insufficient and 726 suffice. The verifier samples with replacement; duplicate samples do not invalidate the bound because the input draws themselves are independent. The implementation caches duplicate oracle requests without changing the probability calculation.

## Exact fallback

The fallback queries all Boolean inputs of Hamming weight at most five. For every support (S) with (|S|\le5), Boolean Möbius inversion recovers the ANF coefficient
[
a_S=\bigoplus_{T\subseteq S}F(1_T).
]
Those coefficients uniquely determine every degree-at-most-five vector Boolean function. The fallback is exact under the degree promise; it does not need any tensor-rank or radical promise.

The outer cache reuses lower-basis, witness, signature, and validation answers. A signature-span overflow is caught only for the specific known assertion and causes immediate exact interpolation; unrelated errors are not swallowed.

## Query accounting at 32 bits

The existing universal six-cube learner has:
- lower-degree basis: (Q(32,4)=\sum_{j=0}^{4}\binom{32}{j}=41,449);
- witness search: at most 27 six-cubes, at most (63\cdot27=1,701) new nonzero subset vertices;
- quotient signatures: at most (30\cdot32=960) new values.

Thus its conservative fast cap is (41,449+1,701+960=44,110) distinct oracle inputs. Adding the 726 postfit checks gives a verified fast-path cap of **44,836**.

If a false candidate is detected, the complete degree-five basis contains
[
Q(32,5)=\sum_{j=0}^{5}\binom{32}{j}=242,825
]
inputs. Relative to the fast path, only the (\binom{32}{5}=201,376) top-support values remain to be added; including the maximum fast transcript and all 726 checks gives a conservative combined cap of **246,212** distinct oracle inputs. The cache may make the actual count lower. These are oracle-query counts, not CPU-time or target-runtime measurements.

## Reproducible adversarial controls

The standalone script exercises four cases:

1. **Positive fast path:** a 32-bit affine-plus-rank-one quintic source with a forced witness. Its degree-five candidate passes postfit verification.
2. **No top derivative:** a 32-bit degree-four source with no fifth-derivative witness. The degree-four fast candidate passes verification.
3. **Silent rank-seven failure:** the paired two-monomial source from Agent 41 is forced to use anchors (e_0,\ldots,e_4). The unverified fast candidate omits the second monomial and differs on exactly 4 of 128 inputs, attaining the (1/32) minimum-distance boundary. The seeded test challenge hits a mismatch at input 126, then exact interpolation reproduces all 128 outputs.
4. **Detected signature overflow:** a 21-term degree-five rank-seven source causes the original fast learner's signature-span overflow. The wrapper falls back to exact interpolation and reproduces all 128 outputs.

The seeded generators make these implementation paths reproducible. They do **not** establish the probabilistic guarantee; that guarantee requires independent uniform postfit draws. The production default uses `crypto.randomBytes`.

## Validation and source pins

The new script is enrolled in the existing manual two-platform workflow and in `jsconfig.affine-low-rank-peer.json`:

- Script: `sims/rankfive-top-quintic-validated-peer.js`
- Workflow: `.github/workflows/manual-low-rank-target-inversion.yml`
- Typecheck: `jsconfig.affine-low-rank-peer.json`
- **Ubuntu + Windows green:** [GitHub Actions run 45121255657](https://github.com/FlareZ123/obfs/actions/runs/45121255657), source SHA `db661c79631984cbf1d37567c3e09e1012b3f615`. The run passed the new verifier step, the full existing low-rank research suite, the independent verifier strict-JSDoc step, and project typecheck on both operating systems.
- Two earlier runs caught only strict-JSDoc type errors in the new wrapper's declared result/evaluator types; those were corrected before the green source pin. The new runtime scenarios passed on both operating systems in those runs as well.

The same source pin includes Agent 17's separate stateful SCO RPC countermodel in `test/sco-low-arity-remote-functional-clone.test.js`: repeated identical arguments can produce different outputs when server state changes. That is an important boundary control, not part of this wrapper's fixed-function guarantee.

## Threat-model limits and interpretation

This is a functional-cloning result for a fixed, stateless, deterministic, degree-at-most-five Boolean function. It does not recover source text, arbitrary JavaScript behavior, reflection, host effects, exceptions, mutable state, or side-effect traces. It does not apply to a stateful SCO RPC whose same-input output changes over time; nor does it establish that an arbitrary protected program has degree at most five. The source-degree contract must be independently justified. If the degree promise is false, an arbitrary higher-degree difference may have support smaller than (1/32), and the stated verifier bound does not apply.

The attack does not establish an authorization bypass, a static-analysis reconstruction, a dynamic instrumentation defeat, or resistance against the server's ability to mutate/shard secrets. It measures no 2.5× compute budget and introduces no production obfuscator backend. The project-wide strong-protection release status remains **RELEASE-BLOCKED**.

Keep this in `im-results/` pending independent peer review and prior-art assessment. The Reed–Muller distance and ANF interpolation ingredients are standard; the contribution here is the fail-safe integration against a concrete silent rank-promise counterexample.
