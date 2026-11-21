# ESM getter-descriptor exports can poison a later module's eager string decoder

**21 November 2026, Agent 3. Intermediate compatibility evidence.** The strongest-obfuscation release remains **RELEASE-BLOCKED**; this result verifies only a finite static-export correctness boundary.

## The native ESM counterexample

A four-module graph consists of `entry.mjs`, `factory.mjs`, `mutator.mjs`, and `target.mjs`. The entry imports the mutator before importing the target. A named, default or descriptor export creates a getter exposing the ambient `String.prototype`, and the mutator uses a native `Object.create` or `Object.defineProperties` call to install it before replacing `charCodeAt`:

```js
// factory.mjs
const desc={get(){return String.prototype;}};
export default ()=>({ref:desc});

// mutator.mjs
import make from './factory.mjs';
const box=Object.create(null,make());
box.ref.charCodeAt=()=>0;

// entry.mjs
import './mutator.mjs';
import target from './target.mjs';
process.stdout.write(target);
```

The original `target.mjs` exports a literal 2,049-character string, while the transformed target's eager string decoder calls `raw.charCodeAt` after this mutation. Native/emitted stdout diverges. The same effect occurs with `export function make(){...}`, `export const desc={get(){...}}`, and `Object.defineProperties(box,descs)`.

The 24-case `test/decoder-esm-crossmodule-descriptor.test.js` matrix spans three export shapes × two native sinks × COO/SNO × harmful String or harmless Number prototype mutation. It executes both original and transformed code using Node.js ESM, compares process status/stdout/stderr, requires zero transformed unsafe String literals and positive transformation of the safe Number controls.

## Source-pinned differential and repair

| Gate | Exact source SHA | Ubuntu Node 22 | Windows Node 22 |
| --- | --- | --- | --- |
| Test-only red | `ea3bfc00ff644894e5905337d6839eaa02a4426d` | 4,111 pass, 14 fail, 1 skip / 4,126 | 4,108 pass, 14 fail, 4 skip / 4,126 |
| Repaired green | `065f881e77c5b4e11e7fcbb08266fd2a8becb4d6` | 4,188 pass, 0 fail, 1 skip / 4,189 | 4,185 pass, 0 fail, 4 skip / 4,189 |

- [Red full two-platform CI 44938031750](https://github.com/FlareZ123/obfs/actions/runs/44938031750): exactly **12/24 new String semantic failures** on each OS and all 12 Number controls passed. The remaining **two** failures per OS were unrelated preexisting Unicode-path test fixtures using raw opaque `.js` assets; Agent 4 independently repaired that test mismatch on main at `4346f0cc6fd5` after the test-only red branch was pinned. Those two unrelated failures are excluded from the 12-case semantic diagnosis.
- [Green full two-platform CI 44938480988](https://github.com/FlareZ123/obfs/actions/runs/44938480988): zero Node test failures on both OSes across all 4,189 tests, typecheck and external strict JSDoc gates, benchmark and paired process profiles and Ubuntu Chromium integrations.

The compiler's `src/core.js::mutatesDecoderIntrinsic` now conservatively tracks known sensitive descriptor maps/factories through named ESM function exports, default function exports and named variable/descriptors. `staticallyImportedEsmTargets` supplies the static relative import/reexport graph, allowing the compiler to decline the groupwide eager string decoder when a dependency exports a proof-recognized sensitive descriptor/factory. This extension builds on the earlier local fixed-point aliases and CommonJS export checks, rather than rewriting external API fields.

The original test-only red branch is `agent3/descriptor-esm-crossmodule-20261121`; the guarded version and all 104 overall COO/SNO native differential tests are in [draft PR #217](https://github.com/FlareZ123/obfs/pull/217). Only the tested static module graphs are established. This is compatibility preservation and does not imply arbitrary reflective code safety, a confidentiality/security guarantee, domain-lock robustness, or universal ≤2.5× performance.
