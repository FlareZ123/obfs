# Contemporary deobfuscation adversaries for the obfs JavaScript project

Compiled by Agent 21 on 2026-11-15. These public references inform
**attacker models and experimental baselines**, not automatic validity
claims about our code.

## Path-sensitive control-flow recovery

- **Deobfuscation of Control Flow Flattening Based on Abstract Interpretation**,
  IEEE *Transactions on Software Engineering*, published 2026-01-30,
  DOI [10.1109/TSE.2026.3659437](https://doi.org/10.1109/TSE.2026.3659437).
  [Abstract](https://ieeexplore.ieee.org/abstract/document/11369430).
  Its k-switch context-sensitive abstract interpreter separates flattened
  execution paths and reassembles original control-flow fragments. This is
  relevant when designing defenses against an attacker who can follow
  dispatcher states symbolically.

- **JSimpo: Structural Deobfuscation of JavaScript Programs**, ACM *TOSEM*
  2025, DOI [10.1145/3714460](https://doi.org/10.1145/3714460).
  [Bibliographic abstract](https://ouci.dntb.gov.ua/en/works/420xdqVB/).
  The paper reports combining slice symbolic execution and dynamic execution
  to recover structure of obfuscated JavaScript, including control flow
  flattening. A correct obfuscator should evaluate against this class of
  tooling, beyond visual inspection or generic JavaScript minification.

## Multi-stage recovery, including V8 compilation

- **Breaking the Seal: Static Deobfuscation of JSCeal's Compiled V8
  Bytecode**, Check Point Research, 2026.
  [Article](https://research.checkpoint.com/2026/breaking-the-seal-static-deobfuscation-of-jsceals-compiled-v8-bytecode/).
  They report a pipeline of literal/string decoding, state-machine
  unflattening, proxy reduction, bytecode analysis and optional
  LLM-assisted naming. An externally provisioned encryption key was more
  meaningful than reversible obfuscation that travels with the payload.
  This is an adversary precedent, not a guarantee that a specific new
  SCO deployment is secure.

- **From Obfuscated to Obvious: A Comprehensive JavaScript Deobfuscation
  Tool for Security Analysis**, NDSS paper page,
  [JSIMPLIFIER](https://www.ndss-symposium.org/ndss-paper/from-obfuscated-to-obvious-a-comprehensive-javascript-deobfuscation-tool-for-security-analysis/).
  The authors describe a multi-stage pipeline, blending AST analysis,
  dynamic traces and LLM-aided naming, and a large evaluation corpus of
  benign and malicious JS. We should avoid treating a single language
  model's inability to read an output as sufficient proof of security.

## Local reproducible negative control

- [Agent 21's native-superblock transform, attacker and benchmarks](../im-results/branch-superblocks-2026-11-15.md):
  a source-only parser independently reconstructs both ordinary and
  operand-dependent masked state forms without any seed. This demonstrates
  why a shuffled switch dispatcher plus lightweight XOR mixing cannot
  justify strong anti-reconstruction claims, even when isolated hot-path
  execution meets the 2.5x budget.

## Suggested adversarial practice

Retain the strongest existing static source-only reconstructor as a
regression baseline. Add path-sensitive symbolic, dynamic logging, and
instrumented-browser adversaries when a new candidate changes state
encodings. Evaluate reconstructed behavior and key retrieval, along with
time-to-analysis, independently of runtime cost. Stronger secrecy claims
need server-private entropy or methods that never become client-readable
under the stated SCO model, and a measured oracle budget.
