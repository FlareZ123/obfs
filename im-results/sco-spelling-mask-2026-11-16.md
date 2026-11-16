# SCO literal spelling: a 32-bit effective per-response selector

**Status:** intermediate result, 16 November 2026. Reproducer: [source-only mask extractor and 24-request HTTP challenge](../sims/sco-spelling-mask-attack.js), [automatic regression](../test/sco-spelling-mask-attack.test.js). This concerns SCO's *literal-spelling pass alone*, independently of the earlier hashed-identifier attack and of server-private RPC methods.

## Exact scoped claim

In [src/sco.js](../src/sco.js), `varyLiteralSpellings` computes `entropy = SHA256(nonce)` from a random 24-byte request seed. Every candidate printable ASCII code unit chooses between a literal character and a `\\uXXXX` escape solely according to:

```js
entropy[(characterIndex + originalLiteralStart) % 32] & 1
```

Therefore **at most 32 independent bits** of the nominal 192-bit nonce can affect this spelling pass for a fixed pre-variation source. The rest of the nonce may still influence other, separately executed obfuscator transformations (including hashed names). The 32-bit bound makes no claim about the entropy of the **entire HTTP response**, seed recovery, or server-side secrets. It also does not imply 2^32 equally probable spellings.

For any eligible unescaped 32-code-unit printable ASCII literal, the byte spelling reveals one occurrence of each index of this rotating 32-bit selector. Each direct ASCII character supplies a 1 and each `\\uXXXX` supplies a 0. After recovering the selector and reconstructing pre-variation literal start offsets, the attacker can reproduce spelling choices for every other eligible literal in the same response without knowing the nonce.

## Reproduction and isolation

The extended fixture supplies two originally canonical double-quoted 32-unit ASCII literal assignments and a third mixed UTF-16 literal (quotes, backslash, NUL, a non-BMP character, and an unpaired surrogate) in a single public script and serves it through the actual `createScoHandler` using fresh request entropy. The attacker receives only each served JavaScript response and uses AST values and byte spellings to infer the mask. It normalizes eligible literals to canonical double quotes, obtains the pre-variation positions, and predicts all three literal spellings. The test demands byte-for-byte equality against each complete observed variant across 24 separate HTTP GET responses, verifies native-versus-emitted string equality including every UTF-16 unit, and ensures the response hashes are not all identical.

Only the served bytes are passed to a separate source-only attacker subprocess. That process uses its own Acorn parser and has no dependency on the obfuscator package. It neither calls the compiler nor requests its seed; the surrounding test harness uses the ordinary SCO handler to prepare a genuine challenge. This is a controlled known-source-syntax observation: when the pre-variation literals contain single-quote forms or other noncanonical spelling, raw positions reconstructed by the current attacker may be wrong. The 32-bit theoretical bound holds regardless of that limitation.

A separate local harness replaying the same spelling rule with Node's bundled Acorn parsed and predicted **128/128** synthetic variants on 16 November 2026. The first real Node 22 Linux/Windows gate [43913673735](https://github.com/FlareZ123/obfs/actions/runs/43913673735) failed the attack's distinct-response assertion: the initially offered fixture concatenated two immutable `const` strings, which the existing source-observation guard refused. That refusal exposed a precision limit in the compiler, rather than a protected response. The new [positive/negative source-observer tests](../test/primitive-addition-source-observer.test.js) support a narrow repair in `src/ast.js`: prove the concatenation of immutable primitives cannot coerce a function, while preserving refusal for opaque or mutable operands.

**The original two-literal variant passed full validation** at immutable commit `5c70af17697ba77c6f7ce33b77bdaae430a865b7`: [run 43916154523](https://github.com/FlareZ123/obfs/actions/runs/43916154523) on Node 22 Ubuntu (**1,756 passed, one skipped, zero failures**) and Windows, including the 24-request HTTP mask-extractor regression and paired primitive-coercion regressions, both strict JSDoc suites, sampled benchmark, and Ubuntu Chromium integrations. The exact run also contains an independently contributed Node inspector source-observation safeguard. The subsequent three-literal mixed-UTF-16 and native/emitted VM-parity extension also **passed** the full Node 22 Linux/Windows, strict JSDoc, benchmark and Chromium gate at exact source `ec6b6c9e49777327c8e7367ea9aedaf630a79e44`, [CI 43917568528](https://github.com/FlareZ123/obfs/actions/runs/43917568528). These are bounded fixture and integration results, not a general proof of JavaScript behavior or whole-application attacker cost.

## Security interpretation

The attack demonstrates a compact, efficiently observable equivalence class for this request-time formatting mechanism. It neither reconstructs an arbitrary program nor undermines cryptographic server-side source separation. The existing stronger [AST literal canonicalizer](../sims/sco-variant-normalize.js) already removes tested spelling variations without even recovering the mask. Therefore increasing the private nonce alone cannot make public literal spelling into an effective confidentiality or host-integrity mechanism. Future candidate defenses should be measured against independent end-to-end reconstruction and functional cloning, with the 2.5× runtime bound reported separately.
