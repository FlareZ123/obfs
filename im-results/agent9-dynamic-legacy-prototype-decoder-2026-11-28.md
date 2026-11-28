# Dynamic legacy prototype alias corrupts cross-file eager string decoding

**Status:** intermediate compiler correctness / fail-closed provenance finding. **Confirmed source-paired red on both Ubuntu and Windows; compiler patch validation pending.**  
**Date:** 2026-11-28. Researcher: Agent 9.  
**Unhinted red source:** `492952ac8d1739c940991258d2fb3a265a44bc17`  
**Red CI:** [46129477145](https://github.com/FlareZ123/obfs/actions/runs/46129477145)  
**Correction branch:** [`agent9/string-producer-prototype-20261128`](https://github.com/FlareZ123/obfs/tree/agent9/string-producer-prototype-20261128)  
**Candidate patch source:** `ca54186ba36e192a2df7bf0fd388762b7b1d0745`  
**Patch with positive-yield controls:** `42cb3eeed6c5b19dbd1ff1960a7f1e0489ad438e`

## Threat and minimum witness

The COO/SNO long-literal XOR decoder emitted by `src/strings.js` reads the encoded string through the **ambient** `raw.charCodeAt(i)`, and uses `String.fromCharCode(...units)`. A supplied module can modify native `String.prototype.charCodeAt` before another supplied module's decoded long literal initializes. Since the original target string literal does not call this method, the emitted program can silently produce different bytes than native. The compiler's cross-file decoder mutation gate must decline emission where this alias is unproved.

```js
// mutator.cjs
const p=(JSON.stringify(0)).__proto__;
p.charCodeAt=()=>0;

// target.cjs
module.exports='R'.repeat(2048)+'D';

// entry.cjs
require('./mutator.cjs');
process.stdout.write(require('./target.cjs'));
```

The `mutator.cjs` example does **not** contain any explicit `String.prototype` identity hint. The native program prints exactly 2049 expected characters with status 0. On the red source, `obfuscateFiles([...],{mode:'sno'|'coo',strings:true,properties:false,identifiers:false})` returns `target.metrics.literals=1` and emits a source decoder that produces wrong Unicode string content, still with status 0. Both process execution and stdout parity are checked in separate Node 22 processes; the test intentionally tests what was **actually emitted**, not just a syntactic heuristic.

The initial exploratory fixture contained `if(p!==String.prototype)throw Error(...)` and yielded false reassurance because that explicit spelling caused the scanner to decline; the real red pin removes it. The paired native/generated witness is not vacuous: the unmutated standalone target is proved eligible for chunked encoding.

## Matrix and exact red evidence

`test/agent9-dynamic-string-prototype-decoder.test.js` tests 10 distinct producers × two modes. [CI 46129477145](https://github.com/FlareZ123/obfs/actions/runs/46129477145) independently reproduced **10 output mismatches, all matching across Ubuntu and Windows**, for these five producers:

| String-producing source | SNO | COO |
| --- | --- | --- |
| `JSON.stringify(0)` | mismatch | mismatch |
| `String.fromCharCode(88)` | mismatch | mismatch |
| `'x'.repeat(2)` | mismatch | mismatch |
| `String.raw\`x\`` tagged template | mismatch | mismatch |
| `\`x\${1}\`` interpolated template | mismatch | mismatch |

Five other tested producers (`String('x')`, `Object('x')`, string concatenation, `URLSearchParams.toString()`, `Buffer.toString()`) were already conservative in this matrix. **Do not describe those as general method-proven alias safety.**

## Root cause and proposed correction

At `src/core.js::mutatesDecoderIntrinsic`, the existing `isPossiblePrototype(node)` accepted `foo.__proto__` only if `foo` was *already* `isPossiblePrototype`. It therefore missed legacy `Object.prototype.__proto__` access on a runtime-created primitive string from a function, expression, or tagged template; a later `p.charCodeAt=()=>0` was incorrectly classified as unrelated to `String.prototype`.

Patch `ca54186...` makes an unresolved `.__proto__` receiver a **possible prototype** at the source scanner, except a directly proven non-string primitive literal. Existing key-specific writer logic continues to veto only methods/indices important for the decoder (e.g. `charCodeAt`, `constructor`, own numeric indices/iterators); a write of `unrelatedAppField` retains the transformation. The follow-up source `42cb3eee...` adds explicit `(7).__proto__.charCodeAt` and unknown-prototype `unrelatedAppField` **positive-yield** cases; native/generated stdout is also hashed for compact failure logs.

Potential limitation: the new rule is intentionally conservative on some unknown `.__proto__` cases. It does not prove static type identity. A known Number-returning call might be over-refused when it writes a sensitive-looking but actually unrelated name; evaluate precision and wider tests separately.

## Reproduction

```bash
npm ci --ignore-scripts --no-audit --no-fund
node --test test/agent9-dynamic-string-prototype-decoder.test.js
npm run typecheck
```

Pinned source controls, host: Node.js 22.23.4, workflow `.github/workflows/manual-validation.yml` with focused input. Follow-up focused run: [46129870424](https://github.com/FlareZ123/obfs/actions/runs/46129870424), dispatched, final outcome pending as of this report version.

Parallel exploration: `agent9/array-producer-prototype-20261128` [46129552149](https://github.com/FlareZ123/obfs/actions/runs/46129552149) tests analogous `Array.prototype[Symbol.iterator]` mutation; `agent9/string-descriptor-prototype-20261128` [46129480535](https://github.com/FlareZ123/obfs/actions/runs/46129480535) tests non-inline descriptor aliases. Never promote a hypothesis from a queued run to an established failure.

## Security implications and limits

This is a semantic correctness bug in a defensive compiler's fail-closed intrinsic analysis. Fixing it does not hide emitted string contents from static attack: the embedded XOR table and key remain recoverable. It does not provide browser tamper resistance against a fully instrumented COO attacker, or prevent SNO memory/filesystem extraction. It does not satisfy any universal 2.5× runtime budget. The repository's strong-obfuscation release remains **BLOCKED**.
