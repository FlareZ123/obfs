# Public no-reset traces certify large Mealy state-count lower bounds (28 November 2026)

**Status:** mathematically justified finite-state observational lower bound, independently replayed against archived data in a local Python enumeration; the associated GitHub Actions exact-head source validation is tracked separately. **Not** a general JavaScript obfuscation theorem, static source reconstruction, 2.5× performance result, online protection claim or proof of full machine uniqueness.

## Objective and provenance

The prior hW SCO versus ordinary-minified HTTP control [run 45815986225](https://github.com/FlareZ123/obfs/actions/runs/45815986225), source `719bb1f438e0b1645782d520f34f97dcae559d96`, stored 36 independent 16–24-state binary-output/binary-input Mealy targets with an exact authenticated one-shot public input/output trace for each. Its 36/36 returned-hypothesis future-behavior clones coexist with **four inconclusive Z3 full-version-space audits** (all `UNKNOWN`), as reported in [the original hW validation log](agent49-hw-loopback-probe-validation-2026-11-26.md). Z3 spent 2,429.7973 seconds over four selected 23–24-state traces, with many per-candidate-size timeouts. We sought a rigorously sound trace-only reduction of its candidate-state search range.

**Raw input:** GitHub Actions artifact ID `15118288275` (`agent2-live-hw-matched-control`), ZIP SHA-256 `8397e7209dc8a23a35210568a5930ad1bbca70dba03e82bdeb4d727c2d0fdbf9`, including `live-hw-matched-results.json`. Target tables and counts were **never passed to the separate attacker learner**. The state lower bound constructed below uses **only** the public trace; stored target size/table are used afterward to grade the bound and check witness consistency.

## State-count certificate: mathematical argument

Let a deterministic Mealy machine have finite state set (Q), input alphabet (Σ) and output alphabet (Γ), and let a no-reset observed trace be (T=((a_0,b_0),\ldots,(a_{L-1},b_{L-1}))).

For any observed input word (u\inΣ^d), collect the set (O_T(u)) of distinct length-(d) output words aligned with **all** occurrences of that same input word as a contiguous trace window. Each such occurrence starts in some state (q_t\in Q). Determinism implies the same state and the same input word always produce the same output word. Thus **distinct output words from the same input word require distinct starting states**. For *every* deterministic machine reproducing (T),

\[
|Q| \ge \max_{1\le d\le D} \;\max_{u\inΣ^d} |O_T(u)| \equiv B_D(T).
\]

No reset, hidden state labels, solver assignment, strong-connectivity condition, minimality assumption, original target table or attacker hypothesis is required for this inequality. A certificate consists of one input word (u) and a list of trace-start positions and different output words; a third party can verify the certificate directly from the public trace by slicing. The implementation scans (d=1,\ldots,12) using binary rolling input/output windows and stores the first position of each distinct output word. The bound can be below (|Q|) and does **not** imply unique transitions or future behavior.

## Reproducible archive analysis

Independent local Python enumeration of all 36 archived traces with (D=12) gives:

| Measure | Observed |
| --- | ---: |
| Completed independent target traces | **36** |
| True target state count range | 16–24 |
| Candidate sizes across `1..true_N` before trace bound | **720** |
| Sizes provably impossible using only the public trace | **676** |
| Remaining sizes for Z3 or other exact auditing | **44** |
| Cases where (B_{12}(T)=\text{true_N}) | **29/36** |
| Cases one state below target | **6/36** |
| Cases two states below target | **1/36** |

Per state count, four independent targets each:

| True states | (B_{12}) for the four traces |
| ---: | --- |
| 16 | 16, 16, 16, 16 |
| 17 | 16, 17, 17, 15 |
| 18 | 18, 18, 18, 18 |
| 19 | 19, 19, 19, 19 |
| 20 | 19, 20, 20, 19 |
| 21 | 21, 21, 21, 20 |
| 22 | 21, 22, 22, 22 |
| 23 | 22, 23, 23, 23 |
| 24 | 24, 24, 24, 24 |

In particular, the **same four cases selected for the original Z3 full-space audits** have the following trace-only public witnesses:

| Target states | Target seed | Public trace length | (B_{12}(T)) | Shortest depth attaining bound |
| ---: | --- | ---: | ---: | ---: |
| 24 | `3493739885176087174` | 5,762 | 24 | 7 |
| 24 | `4192016255979584362` | 2,072 | 24 | 8 |
| 24 | `16373758958132047675` | 2,265 | 24 | 9 |
| 23 | `17678319770404900897` | 7,729 | 23 | 6 |

Consequently, original Z3 `UNKNOWN` statuses at candidate sizes smaller than the target can now be **superseded by analytical UNSAT certificates** for *these same four traces*. The target-sized candidate search remains unresolved; a solver `UNKNOWN` there is still `UNKNOWN`. This changes the evidence quality without establishing a full-version-space uniqueness theorem.

## Implementation and replay

The experimental branch `agent49/hw-cross-arm-probe-20261126`, draft [PR #381](https://github.com/FlareZ123/obfs/pull/381), contains:

- `sims/agent49_hw_trace_lower_bound.py`: standalone **Z3-free** certificate generator/verifier; supports `--max-depth 12` and `--check-fixture` independent evaluator state replay.
- `sims/agent2-hw-version-space-audit.py`: optional `--trace-lower-bound-depth 12` skips analytically impossible sizes while recording the exact certificate and separated `analytical_unsat_sizes`. Default `0` deliberately retains the original solver and its historical comparability.
- `sims/test_agent2_hw_version_space.py`: explicit three-state witness and replay, invalid input refusal, exhaustive **16,384** two-state transition/output/input-word traces, plus existing SAT/UNSAT controls.
- Existing `.github/workflows/manual-agent2-hw-live-matched-control.yml`: optional proof depth on live runs, standalone certificates in artifacts, and a historical-artifact-only audit job that fetches a source-pinned prior workflow artifact without repeating hW learning.

Reproduce independently from an authenticated checkout and the preserved artifact:

```sh
gh run download 45815986225 -R FlareZ123/obfs \
  -n agent2-live-hw-matched-control -D historical
python sims/agent49_hw_trace_lower_bound.py \
  --input historical/live-hw-matched-results.json \
  --output hw-trace-state-certificate.json \
  --max-depth 12 --check-fixture
```

The script will emit one publicly verifiable certificate per completed row and a summary, with the SHA-256 of the input JSON. CI results, when verified, should be added here with **exact head**, full status and artifact IDs rather than inferred from the above local proof.

## Important limitations

1. The result bounds the number of states required by **any deterministic binary Mealy candidate consistent with exactly the observed trace**; JavaScript programs with time-dependent/host-dependent or nondeterministic behavior are not within this formal model.
2. It does **not** produce a hidden transition table or establish a machine is unique, even when the bound equals the target state count. All four original target-size solver cases remain unproven until an independent exact audit resolves them.
3. The finite 36-trace sample and their specific hW attack policy do not imply a distribution-free guarantee. The public trace may be unusually informative, and the experimental SCO mode affords unlimited legitimate requests.
4. A reduction in *solver-side audit work* is not an improvement in **attacker cost** or **protected application's runtime**. Nothing here establishes the primary obfuscator's 2.5× budget, tamper-resistance, environment-locking, source confidentiality, or LLM robustness.
