# Decoder yield loss from read-only Node builtin access: bounded negative precision experiment

**Agent 27, 22 November 2026. Classification: intermediate empirical test and decision to retain the existing safety refusal.**

## Question and source

After the three imported-side-effect fixes in [merged PR #277](https://github.com/FlareZ123/obfs/pull/277), does the decoder-intrinsic admission unnecessarily suppress literal encoding for read-only imports of Node builtins? This matters to the 2.5×/protection-yield tradeoff only if source-observation semantics can also be proved inert.

The exact source-pinned matrix is [`test/decoder-native-vm-readonly-yield.test.js` at `ee86c78c4ffd42b155e8263cb842a27a8d5e446e`](https://github.com/FlareZ123/obfs/commit/ee86c78c4ffd42b155e8263cb842a27a8d5e446e), on branch `agent27/vm-readonly-decoder-yield-20261122`, independent of merged main. [Focused Ubuntu and Windows run 45015823360](https://github.com/FlareZ123/obfs/actions/runs/45015823360) passed both OS jobs, strict project and external JSDoc. The run printed a machine-readable `VM_READONLY_YIELD` array with 16 parity/yield records.

Each graph has `entry.cjs` requiring `side.cjs` before `target.cjs`; target source is precisely `module.exports='protected-literal-value';`. Execute native and transformed groups in independent Node 22.23.4 child processes, `strings:true`, `properties:false`, `identifiers:false`, with COO and SNO modes separately. `literals` is the actual target compiler metric.

| Earlier side-module operation | COO literal rewrites | SNO literal rewrites | Runtime native/emitted parity |
|---|---:|---:|---|
| Plain inert `module.exports=17` | 1 | 1 | both pass |
| `const vm=require('node:vm');void vm` | 0 | 0 | both pass |
| `vm.isContext({})` direct | 0 | 0 | both pass |
| Detached `const {isContext}=require('node:vm');isContext({})` | 0 | 0 | both pass |
| Read-only `void vm.Script` | 0 | 0 | both pass |
| `vm.createContext({})` isolated-context creation | 0 | 0 | both pass |
| `const fs=require('node:fs');void fs.constants` | 0 | 0 | both pass |
| `vm.runInThisContext(...)` changing `String.fromCharCode` | 0 | 0 | both pass |

The last fixture mutates the same-realm `String` intrinsic and thus **must** refuse generated ambient decoding. The innocuous cases are observed false refusals relative to their stated local execution, yet are **not proven safe for a hostile surrounding host**.

## Why a simple whitelist would be unsound

The compiler's `src/ast.js` `observesDistributedSource` scanner recognizes direct `require('node:vm')`, `require('node:fs')`, `require('node:module')` and loader API aliases as potential native access to distributed source bytes. That source-byte observation can differ whenever a string decoder inserts code, even if no intrinsic is mutated. A source-level identifier scan is deliberately conservative about aliases, imported functions, and external callers.

Therefore adding `node:vm` or `node:fs` to a trusted mutable-intrinsic allowlist would not suffice for 1:1 semantics: a separate **source-byte observation proof** would also be required. The known graph must establish relevant source readers, aliases, module exports and host operations; the nominal side file in this experiment does not establish the absence of unlisted host instrumentation. This is the same fundamental closed-world-contract limitation discussed in [PR #277](https://github.com/FlareZ123/obfs/pull/277).

## Decision

**Retain the conservative source observer veto in the default implementation.** The matrix quantifies a legitimate yield cost but supplies no adversarially adequate proof for selectively relaxing it. If a later compiler adds opt-in audited-host semantics, reuse this exact matrix as a positive-yield target while independently retaining the VM mutation and external-source-reader negatives.

The strong obfuscation release remains **BLOCKED** on independently measured reconstruction/tamper resistance and universal runtime compliance. Neither this test nor the successful PR #277 changes that decision.
