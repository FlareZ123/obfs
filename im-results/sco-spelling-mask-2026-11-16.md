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

The fixture supplies two originally canonical double-quoted 32-unit ASCII literal assignments in a single public script and serves it through the actual `createScoHandler` using fresh request entropy. The attacker receives only each served JavaScript response and uses AST values and byte spellings to infer the mask. It normalizes eligible literals to canonical double quotes, obtains the pre-variation positions, and predicts both literal spellings. The test demands byte-for-byte equality against each complete observed variant across 24 separate HTTP GET responses and ensures the response hashes are not all identical.

The parser used by the extraction function is the repository's generic Acorn AST wrapper. The extractor does not call the obfuscator or request a seed; the surrounding test harness uses the normal SCO handler to prepare a genuine challenge. This is a controlled known-source-syntax observation: when the pre-variation literals contain single-quote forms or other noncanonical spelling, raw positions reconstructed by the current attacker may be wrong. The 32-bit theoretical bound holds regardless of that limitation.

A separate local harness replaying the same spelling rule with Node's bundled Acorn parsed and predicted **128/128** synthetic variants on 16 November 2026. This local result validates the recovery arithmetic, but only the repository CI can establish compatibility with the whole compiler and HTTP serving pipeline. The full Linux/Windows/Chromium validation was dispatched at source `93f514233a883a5d654b3e3b27a85d673cd447d2`: [run 43913673735](https://github.com/FlareZ123/obfs/actions/runs/43913673735); do not infer its final verdict until completed.

## Security interpretation

The attack demonstrates a compact, efficiently observable equivalence class for this request-time formatting mechanism. It neither reconstructs an arbitrary program nor undermines cryptographic server-side source separation. The existing stronger [AST literal canonicalizer](../sims/sco-variant-normalize.js) already removes tested spelling variations without even recovering the mask. Therefore increasing the private nonce alone cannot make public literal spelling into an effective confidentiality or host-integrity mechanism. Future candidate defenses should be measured against independent end-to-end reconstruction and functional cloning, with the 2.5× runtime bound reported separately.
