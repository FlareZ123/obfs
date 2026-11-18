# Preregistered candidate: native encoded-domain arithmetic

**Date:** 18 November 2026. **Author:** Agent 8. **Status:** workplace proposal only. No security, correctness, compatibility, or performance result is claimed.

## Motivation

The current repository has repeatedly falsified fixed VM, dispatcher, public-XOR-string, affine/polyvariant, and public-Wasm formats with source-only or dynamic reconstruction. Several of those candidates also pay large hot-path costs. A useful next candidate should avoid an interpreter and keep the JavaScript engine executing ordinary numeric operators.

This proposal asks a narrower question: can a compiler keep selected pure Int32 arithmetic in a changing encoded value domain, with a steady-state operation count near the native program, while forcing a public-only reconstructor to solve a larger symbolic data-flow problem than ordinary minification?

The experiment targets **static reconstruction resistance only**. It does not provide authorization, confidentiality against runtime extraction, tamper resistance, or a hostile-host integrity boundary.

## Candidate transform

For a proved-pure Int32 SSA value `x`, choose a per-value additive mask `m_x` and represent:

```text
E_m(x) = (x + m) mod 2^32
```

Masks are independently derived per SSA edge from the build seed and are emitted only through the transformed equations. The original unmasked intermediate is never stored by the candidate.

Useful native identities include:

```text
z = x + c
E_mz(z) = E_mx(x) + (c + m_z - m_x)

z = x - c
E_mz(z) = E_mx(x) + (-c + m_z - m_x)

z = x + y
E_mz(z) = E_mx(x) + E_my(y) + (m_z - m_x - m_y)

z = x - y
E_mz(z) = E_mx(x) - E_my(y) + (m_z - m_x + m_y)

z = imul(x, c)
E_mz(z) = imul(E_mx(x), c) + (m_z - imul(m_x, c))
```

All operations are interpreted with the same Int32 truncation points as the admitted native grammar. Constant-add/sub chains can retain one arithmetic operation per original operation after entry masking. Binary add/sub and constant multiplication normally add one constant-adjustment operation. Entry and return require one encode/decode adjustment each.

A second XOR-mask domain may later be evaluated for XOR-heavy segments:

```text
X_k(x) = x XOR k
X_kz(x XOR y) = X_kx(x) XOR X_ky(y) XOR (k_x XOR k_y XOR k_z)
```

The first pilot must **not** mix domains until the additive-only baseline is measured. Domain conversion is a separate cost and attack surface.

## Eligibility envelope

The first implementation, if pursued, should admit only source shapes for which exact JS coercion and overflow semantics are mechanically preserved:

- proved primitive Int32 inputs or explicit `|0` boundaries;
- straight-line local arithmetic with `+`, `-`, and `Math.imul(value, constant)`;
- no getters, property reads, calls other than the admitted `Math.imul`, source observers, exceptions whose messages contain rewritten operands, BigInt, Symbol, Proxy, dynamic scope, or host callbacks inside the protected region;
- explicit decode only at an exported/observable boundary.

This narrow grammar is intentional. Unsupported code remains on the ordinary compiler path.

## Why this might meet the 2.5x runtime cap

The candidate contains no bytecode loop, switch dispatcher, virtual stack, dynamic evaluation, or per-operation function call. Constant add/sub chains have essentially native operator count once encoded. Binary arithmetic adds bounded primitive operations that V8 can JIT directly. Initialization work consists only of ordinary module parsing and constants.

This is only a plausibility argument. Any strict measured pair above 2.5x for an admitted workload remains a veto. Short and sustained hot loops, fresh-process whole-graph CPU, and Chromium must be measured separately.

## Expected attacks

The public masks are not secrets. A source-only attacker can model each emitted expression over the ring `Z/(2^32)`, introduce a symbolic variable per input, and algebraically cancel masks. For the additive-only grammar this is likely straightforward. A dynamic attacker can additionally query the public function and fit simple affine families.

Therefore the first security experiment is deliberately adversarial: build an independent normalizer that receives only emitted source and reconstructs an equivalent unmasked SSA expression without the compiler seed or original source. If it recovers the admitted corpus with small implementation effort, the candidate is another diversification layer and should be killed or substantially changed.

The candidate is worth testing only because a randomized per-edge representation may make the emitted grammar less locally recognizable than the fixed dispatcher/Wasm pilots while keeping runtime low. That possibility must be measured rather than assumed.

## Decisive paired experiment

Freeze one multi-file application containing at least three eligible numeric leaves plus ordinary state, Unicode data, reflection on unrelated public keys, and external callbacks. Produce:

1. native source;
2. ordinary esbuild/minified control under the same trust boundary;
3. encoded-domain candidate with a published exact-byte artifact.

Before attacker execution, freeze two independent attacker programs:

- a generic source-only symbolic normalizer for the encoded arithmetic;
- a public black-box functional-cloning attacker allowed the deployment mode's normal execution access.

Give both candidate and minified control identical source/runtime access. Score separately:

- exact held-out functional equivalence;
- recovered arithmetic/data-flow graph, ignoring original identifier spelling;
- implementation size and wall/CPU time of the frozen attacker;
- number of target-specific grammar rules required.

A candidate survives the static lane only if the attacker that reconstructs the ordinary minified control fails or requires materially greater precommitted work on the candidate. Merely making the emitted file larger or visually stranger is insufficient.

## Runtime gate

On the same source pin, measure:

- long warmed selected-leaf loops on Ubuntu and Windows;
- fresh-process whole-application user+system CPU;
- real Chromium execution for COO;
- source size and parse/evaluation overhead.

Every observed strict candidate/native compute ratio above **2.5x** vetoes that supported workload. The comparison with ordinary minification remains separate from the absolute native budget.

## Immediate kill conditions

Do not invest further if any of these occurs in the first pilot:

- the independent symbolic normalizer automatically reconstructs the full admitted corpus with a compact fixed grammar;
- a few black-box queries recover all selected functions because the admitted corpus is merely affine;
- the steady-state selected leaf exceeds 2.5x in any retained strict pair;
- preserving JS coercion/error/source-observer semantics forces decoding at most intermediate boundaries, erasing the encoded-domain property;
- all observed attacker-cost difference is explained by output byte size or an unequal tool/trust boundary.

A successful pilot would still be only one independent resistance dimension. Full COO/SNO attackers retain dynamic instrumentation, and SCO needs an equal-trust ordinary server control.
