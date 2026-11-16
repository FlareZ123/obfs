# SNO runtime-loader interception without changing the validated files

**Status:** reproduced intermediate adversarial evidence, not a security theorem or production release. **Mode:** SNO. **Pinned source:** 0c6d2c5d358f1f73ad40a4c5f28f0ef5f1076200, with [manual Linux/Windows Node 22 run 43806159248](https://github.com/FlareZ123/obfs/actions/runs/43806159248), both jobs successful. All four targeted test executions passed (two tests per OS); strict JSDoc checks passed on both OSes.

## Threat and implementation

The stipulated SNO attacker controls the server filesystem, Node.js runtime and memory. The generated sno-entry.cjs launcher calculates SHA-256 digests of the distributed application files and compares them with expected digests embedded inside the launcher. That detects ordinary accidental file changes but does not give the operator a protected trust root.

The new independent [two-mode attack harness](../sims/sno-manifest-rewrite-attack.js) builds a genuine two-file CommonJS SNO output using obfuscateFiles and createSnoLauncher. It executes the original application and generated launcher in separate Node processes before attacking. Its original result is 39.

**Runtime interception:** An attacker-controlled preloader installed with the Node --require runtime option replaces the result of the entry.cjs module load via Module._load after the launcher has completed its own byte verification. The application reports 777. A test checks that both the generated launcher and the actual entry file remain byte-for-byte unchanged. This demonstrates a distinct failure of runtime-integrity enforcement: the file hash verification succeeds, yet the behavior observed by the caller changes.

**Manifest rewrite:** Without a preloader, appending an attacker-selected replacement export makes the application report 999, but the unchanged launcher rejects the modified file. An attacker-only function reads the distributed launcher, parses its public checks array, independently hashes the two distributed files, and updates the expected digests while leaving the actual verification loop intact. The changed entry then executes successfully and reports 999. The attacker-side manifest rewrite uses neither the original application source nor the compiler seed. This complements the earlier [single-digest self-hash attack](sno-owner-self-hash-bypass-2026-11-15.md) by demonstrating a general manifest rewrite function and a separate runtime-only interception path.

## Observed results at the pinned run

| Check | Ubuntu Node 22 | Windows Node 22 |
| --- | --- | --- |
| Native and protected result | 39 / 39 | 39 / 39 |
| Preloaded runtime hook | 777 | 777 |
| Launcher/entry bytes unchanged during runtime hook | yes | yes |
| Unapproved file change with original manifest | rejected | rejected |
| After public manifest rewrite | 999 | 999 |
| Number of public digests recalculated | 2 | 2 |
| Rehash/rewrite micro-timing | 1.290 ms | 3.325 ms |
| Targeted Node tests / strict JSDoc | pass / pass | pass / pass |

The micro-timings measure only the test's two-file manifest repair phase on CI hosts; they exclude development effort, runtime-preload construction and application processing. They do not establish a general attacker-cost distribution or a 2.5× runtime bound.

The paired native/generated/instrumented regression is [test/sno-manifest-rewrite.test.js](../test/sno-manifest-rewrite.test.js). The existing manually dispatched [SNO owner-bypass workflow](../.github/workflows/manual-sno-owner-bypass.yml) now runs both this case and the earlier self-hash attack without creating another workflow.

## Interpretation and limits

This experiment demonstrates an exact counterexample to SNO runtime- or file-integrity enforcement under the supplied full-control threat model. An untrusted runtime loader can substitute executable results without touching a signed or hashed file; a public, editable manifest cannot authenticate modified disk bytes. These observations do not break SHA-256. They exploit ownership of the verifier and its execution environment.

The payload deliberately targets Node 22 CommonJS module loading. The private Module._load hook is an attacker capability fixture, not a public stable Node integration API. A deployment that strictly prevents preloading would remove this particular path, but that is outside the stated SNO threat assumption. The experiment does not measure sophisticated static deobfuscation, nor does it prove every possible integrity design is vulnerable. Cryptographic remote attestations, secure boot, externally held keys or isolated trusted execution have not been implemented or evaluated here.

**Decision:** Retain the launcher as an accidental-corruption detector and present no full-control integrity or unauthorized-execution guarantee for SNO. Prioritize trusted-boundary changes over another local hash or decoder layer.
