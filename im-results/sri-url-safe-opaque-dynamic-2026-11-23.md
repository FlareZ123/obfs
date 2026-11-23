# Opaque imported-factory SRI Base64URL source-byte mismatch: red-first Chrome evidence

**Agent 7, 23 November 2026.** Classification: intermediate, independently reproducible **compiler correctness** counterexample with a bounded, source-pinned candidate. Dynamic DOM source observers are owned by Agent 30; this branch remains independent evidence until coordinated integration. No confidentiality or universal 2.5x improvement is claimed.

## Reproducer

A four-file COO browser graph contains:
- `client.js` writing a visible `data-dynamic-url-sri="loaded"` marker and a long string literal for nonzero obfuscation yield;
- `factory.mjs` exporting `build(){ return document.createElement("script") }`;
- `bootstrap.mjs` importing `build`, setting `script.src='./client.js'`, then assigning `script[globalThis.opaqueIntegrityName||'integrity'] = 'sha512-<digest>'`, and appending it;
- an ordinary HTML `index.html` importing the module bootstrap.

The digest is **real SHA-512** of the exact `client.js` bytes, encoded as **Base64URL**. Deterministic nonce 1 yields digest prefix `dyKSW-LP...`, with the URL-safe dash before eight standard Base64 characters. The current `src/ast.js` opaque computed setter fallback `looksLikeSriHash` uses `[A-Za-z0-9+/]{8,}`; it fails to recognize this valid Chrome-enforced digest. The local script-element root set cannot propagate the imported factory's return through `build()` in a different ESM module.

The compiler emits a nontrivial string-XOR decoder in `client.js`, preserving JavaScript return values but changing the source **response bytes** and therefore breaking browser SRI. This is a real closed-world group mismatch. The no-integrity ESM control continues to transform.

## Evidence

- [Ubuntu+Windows red 45090623323](https://github.com/FlareZ123/obfs/actions/runs/45090623323), pre-fix source `ef27202761a59e439f4f3a3ac64225354c0edea0`, `test/sri-url-safe-opaque-dynamic-red.test.js`: **1 fail / 1 pass per OS**. The source-pinned case failed exact byte equality in COO; the independent no-SRI positive transformed. The hidden input is an original 137-byte `client.js`, while emitted code contains an XOR decoder and obfuscated string array.
- [Native Chromium red 45090708902](https://github.com/FlareZ123/obfs/actions/runs/45090708902), source `efa4595de636b73e9651dc6cf8d75e75d316d7a4`: real local HTTP browser logs `DYNAMIC_URLSAFE_SRI_OBSERVED {"native":true,"protected":false,"unsafe":false}`. The compiled **protected** app fails, the native script runs, and the intentionally byte-mutated control fails. This proves the browser consequence independently of the compiler's internal admission flag.
- A second exact test added later requires SHA-384 Base64URL with an **underscore** inside the first eight characters as well as a dash, to distinguish slash/dash spelling variants. Red branch `agent7/dynamic-sri-urlsafe-opaque-red-20261123` commit `e2ae0cde08538a064c1a8955e235befbe24a8016`.
- **Candidate minimal fix:** change `looksLikeSriHash` to `/(?:^|\\s)sha(?:256|384|512)-[A-Za-z0-9+/_-]{8,}/iu`. This is a monotonic may-source conservative observer, keeps existing delimiter and eight-character heuristic, covers both URL-safe substitutions and W3C's case-insensitive algorithm token grammar, and does **not** claim to track dynamically assembled hashes or imported DOM factory returns. Candidate commit `7338fff32b79907577d7f7421cc2e9aab47029a7`, plus added underscore control at `44343622e2a6f4cf66f8f886df91b339881b325b`.
- [Focused green 45090775198](https://github.com/FlareZ123/obfs/actions/runs/45090775198) at first candidate exact SHA `7338fff...`, Ubuntu/Windows and strict JSDoc. A new focused run on the additional underscore fixture and candidate full Chromium are in progress; pin their outcomes before calling the combined source green.

## Limits and coordination

The hash-grammar fallback cannot detect a digest synthesized from runtime inputs when no source-visible literal hash appears. Interprocedural possible-DOM-script factory returns are a distinct unresolved may-flow problem. See communications to Agent 30 `20261123T0038Z_agent7_sri-base64url-token-review.md` and `20261123T0042Z_agent7_esm-dom-script-factory-mayflow.md`. The extra supported spelling may conservatively refuse some unrelated string literals that look like SRI hashes, though unpinned/ordinary string positive rewrite controls remain required.

The source-only compiler and browser runs do not establish any anti-deobfuscation, hostile-runtime protection, authorization boundary, or 2.5x performance guarantee. **RELEASE-BLOCKED** remains unchanged.
