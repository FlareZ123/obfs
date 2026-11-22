# Cross-file DOM script creation and opaque SRI setter keys

**Status:** Merged cross-file SRI regression repair; source-pinned full Ubuntu/Windows and Chromium validation green.
**Modes:** COO/SCO/SNO closed-world script+ESM graph.
**Scope:** Unknown-key SRI source-byte preservation, with explicit proof limits.

## Interprocedural gap

A module may export a factory that creates an `HTMLScriptElement` and returns it. A separate module imports the factory, calls it, then assigns a hash to a computed property on the returned script element:

```js
// factory.mjs
export function build() { return document.createElement('script'); }

// bootstrap.mjs
import {build} from './factory.mjs';
const script=build();
script.src='./client.js';
const key=globalThis.optionalAttr||'integrity';
script[key]='sha256-<hash-of-original-client.js>';
document.head.append(script);
```

A static HTML asset only loads `bootstrap.mjs` as a module and contains no direct integrity tag. Within `observesDistributedSource`, the direct DOM-script creation is in `factory.mjs`, while the opaque property write is in `bootstrap.mjs`. The local owner analysis cannot relate the imported factory's return value to the second module's receiver. Thus neither individual source file triggers a source-byte observer; the compiler rewrites `client.js` despite the runtime browser SRI commitment.

## Falsification and candidate

**Source-pinned red:** [manual browser workflow 44979643395](https://github.com/FlareZ123/obfs/actions/runs/44979643395) at `fab1c78f55e5d793bf56487e320f834201e5f733`. The new test in `test/html-asset-disclosure.test.js` failed for COO because it rewrote the original sibling JavaScript into an XOR-decoded string array. Its no-SRI positive control in the same closed-world module graph verified the chosen transformation actually occurs.

The candidate recognizes a literal valid-looking `sha256-`, `sha384-`, or `sha512-` hash token passed to an otherwise opaque computed property write, `setAttribute`, `Reflect.set`, or `Object.assign` in any published JavaScript source. A hash-like value with unknown property binding is treated as a possible SRI observation of a sibling script even when DOM ownership cannot be established. The whole graph is conserved in original bytes. The test is intentionally cross-file and includes an imported factory function call and return.

- **Candidate code:** `src/ast.js` helper `looksLikeSriHash` and its four conservative fallback sites.
- **Node test:** `test/html-asset-disclosure.test.js` cross-file factory/opaque key case across COO, SCO, SNO, with no-SRI positive controls.
- **Native browser proof:** `test/dynamic-interfile-sri-browser.js` publishes native, observer-protected and intentionally mutated variants over HTTP and runs real Chromium, requiring native+protected execution and rejection of modified SRI bytes.
- **Green Chromium:** [workflow 44979798985](https://github.com/FlareZ123/obfs/actions/runs/44979798985) **passed** with real native/protected/unsafe imported-factory browser parity at source SHA `93741427f7217e0bdaa77bb3303d2546b252f094` and strict external JSDoc. Expanded [workflow 44979941946](https://github.com/FlareZ123/obfs/actions/runs/44979941946) **passed** at source SHA `52bcedf2f091d6a5093d27fe2deb93db685aec25`, with additional SHA-384 and SHA-512 imported-factory `Reflect.set` cases, all modes, and existing Chrome suites.
- **Historical full validation:** Ubuntu/Windows workflow dispatched at SHA `52bcedf2f091d6a5093d27fe2deb93db685aec25`; subsequent exact current-main candidate checks are documented below.

## Security and precision limits

The fallback operates on syntactically recognizable hash tokens. If a digest is composed at runtime from opaque values without a recognizable literal, source-byte integrity may still be missed. This candidate does **not** provide interprocedural object-return provenance or alias-level graph proof; it limits one concrete failure pattern by conservatively refusing transformation. It can also overrefuse legitimate non-SRI computed writes containing hash tokens. Hash-pinned original JavaScript is intentionally made available to clients; there is no confidentiality gain, no hostile runtime admission proof, and no 2.5× budget assertion.

An exact graph-level solution should propagate source-specific DOM script factory return facts through imports and calls while preserving transformation yield for unrelated property writes. This is an unresolved research direction and was communicated to Agent 7 for independent review.

## Current-main integration (22 November 2026, 21:18 UTC)

The [first SRI repair](https://github.com/FlareZ123/obfs/pull/259) merged at `98d6d920eb97e798de5530dcaf22549c0bb3f71f`. The standalone inter-file [PR #263](https://github.com/FlareZ123/obfs/pull/263) was rebased on that exact branch, then retargeted to `main`. Its full [Ubuntu/Windows run 45070580791](https://github.com/FlareZ123/obfs/actions/runs/45070580791) and [real-Chromium run 45070576515](https://github.com/FlareZ123/obfs/actions/runs/45070576515) both **passed** at exactly `0b64991524178b030502f3338b6ac83ff4c68e44`. [PR #263](https://github.com/FlareZ123/obfs/pull/263) merged at `b045fbc96e0edabf76ba8013fab87a228592e59c`; the merged main tree SHA `feb4838bdec9063cf3e063656d21bf93f9b9e17f` is **identical** to the green PR #263 head's tree. Thus these are pinned tests for the exact merged source before the present report-only commit. Remaining unsolved cases include runtime-built opaque digests and unproven interprocedural DOM receiver aliasing; none of this demonstrates hostile-environment secrecy or strict universal CPU compliance.
