# Theoretical obfuscation boundary and practical iO relevance

**Prepared:** 18 November 2026. **Classification:** external-resource synthesis. This file sets terminology and research stoplines; it does not establish a new obfuscation theorem for this repository.

## Virtual black-box security is not a general-program target

Boaz Barak, Oded Goldreich, Russell Impagliazzo, Steven Rudich, Amit Sahai,
Salil Vadhan, and Ke Yang, **On the (Im)possibility of Obfuscating Programs**,
CRYPTO 2001 / JACM 2012.

Primary sources:
- https://web.cs.ucla.edu/~sahai/work/2001%20Publications/Crypto_Barak2001.pdf
- https://www.boazbarak.org/Papers/obfuscate.pdf

The paper formalizes the intuitive virtual-black-box (VBB) goal: anything an
efficient adversary can compute from an obfuscated program should also be
computable with only oracle access to the original functionality. It then
constructs inherently unobfuscatable function families and proves that this
general VBB goal is impossible even under substantially weakened variants.

Repository consequence: do not define the success criterion as universal VBB
security for arbitrary JavaScript. The project's empirical dimensions
(static reconstruction, dynamic extraction, tamper resistance, environment
admission, compatibility, and performance) should remain separate and should
be attached to explicit admitted program families.

This does not say that every program family is unobfuscatable and does not
invalidate narrower computational protections.

## Indistinguishability obfuscation is a different, weaker cryptographic goal

A February 2026 result, **Indistinguishability Obfuscation from Well-Founded
Assumptions**, DOI 10.1145/3785007, constructs iO for all polynomial-size
circuits from subexponential hardness of four stated assumptions: LWE, LPN over
general prime fields, an NC0 PRG with stretch, and DLIN on symmetric bilinear
groups.

Primary source:
- https://doi.org/10.1145/3785007

Indistinguishability obfuscation says that same-size equivalent circuits have
computationally indistinguishable obfuscations. It is not the VBB definition
ruled out by the 2001 impossibility result.

Repository consequence: theoretical cryptographic obfuscation remains a real
research direction. A claim that hostile local execution makes all forms of
computational obfuscation mathematically impossible would be too strong.

## Current concrete iO remains far outside this project's engineering scale

Diamond iO is a lattice-based effort toward concrete iO:

- Sora Suegami, Enrico Bottazzi, and Gayeong Park, **Diamond iO: A
  Straightforward Construction of Indistinguishability Obfuscation from
  Lattices**, IACR ePrint 2025/236.
- implementation: https://github.com/MachinaIO/diamond-io
- benchmark report:
  https://pse.dev/blog/hello-world-the-first-signs-of-practical-io
- 2026 project roadmap: https://pse.dev/projects/machina-io

The 2025 benchmark used an AWS i4i.8xlarge with 32 vCPUs and 256 GB RAM and
parameters targeting at least 80-bit security. For a one-bit evaluator input,
the published depth-0 public-circuit setting reported approximately:

- 15.80 minutes to obfuscate;
- 4.575 minutes to load;
- 2.542 minutes to evaluate;
- 34.30 GB peak memory;
- 6.303 GB obfuscated-circuit size.

Increasing public multiplicative depth to 10 raised the reported evaluation
time to 29.94 minutes and the circuit size to 19.77 GB. The authors explicitly
describe the implementation as still far from practical circuit sizes. The
current 2026 roadmap is continuing toward larger nontrivial input sizes and
new key-homomorphic-encoding machinery.

These numbers are not a matched native/candidate benchmark for this repository,
so they must not be converted into a formal 2.5x ratio. They are sufficient as
a research triage signal: importing current general-purpose iO into a
JavaScript obfuscator with a strict repeated-work 2.5x ceiling is not a
near-term implementation path.

## Current iO overhead lower bound

A 2026 work titled **Lower Bounds on the Overhead of Indistinguishability
Obfuscation** proves, under NP not contained in BPP, that an efficient iO for
multi-output circuits of size s cannot output circuits of size
s + o(s / log s).

Source:
- https://cris.iucc.ac.il/en/publications/lower-bounds-on-the-overhead-of-indistinguishability-obfuscation/

This is a circuit-size lower bound. It is not a JavaScript runtime lower bound
and does not by itself imply violation of the project's 2.5x compute rule.

## White-box / MATE engineering interpretation

ETSI TR 103 642 and the software-obfuscation literature use a white-box or
man-at-the-end threat model in which the attacker can inspect and tamper with
code and runtime state. These sources treat software obfuscation as increasing
attack cost and distinguish software-only protection from server-side
execution and trusted-hardware approaches.

Source:
- ETSI TR 103 642 V1.1.1, *Security techniques for protecting software in a
  white box*.

Repository consequence: COO and SNO should continue to measure attacker effort
rather than advertise perfect local secrecy or tamper-proof execution. SCO is
architecturally different because the obfuscator-controlled server can retain
state and code outside the hostile client. Trusted hardware, authenticators,
or remote attestation would create additional trust assumptions and should be
declared explicitly rather than silently treated as software obfuscation.

## Research stoplines

1. Do not use universal VBB security as the release target for arbitrary
   JavaScript.
2. Do not infer that all computational obfuscation is impossible from hostile
   local runtime access; iO is a distinct theoretical counterpoint.
3. Do not spend near-term implementation budget on current general-purpose iO
   without a new concrete efficiency breakthrough that can plausibly approach
   the repository's repeated-work ceiling.
4. For software-only COO/SNO, grade relative attacker cost on frozen admitted
   program families and preserve explicit dynamic-extraction/tamper findings.
5. For SCO, distinguish gains caused by a private server trust boundary from
   gains caused by obfuscation transformations.
