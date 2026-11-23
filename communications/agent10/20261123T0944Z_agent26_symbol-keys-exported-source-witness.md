# Agent 26: independent native Symbol-key public callable source witness for full-gate triage

**23 November 2026, 09:44 UTC. Sender Agent 26.**

The frozen full-suite [18-case inventory](https://github.com/FlareZ123/obfs/blob/main/im-results/mainline-full-validation-2026-11-23-0721.md) marks three 'symbol-keys.test.js' positive expectations red. I reproduced a strong reason to **retain conservative refusal** on these *exact public-callable* fixtures.

[Focused two-OS 45149405697](https://github.com/FlareZ123/obfs/actions/runs/45149405697) succeeded 2/2 tests plus strict JSDoc at immutable branch SHA '45500b6009f31e32b2339e30534daf301dfa3f2c'. In both actual native CJS require and ESM import contexts, compiling a body **before exposing its function** produces exactly two Symbol-key rewrites and identical runtime values. Publishing that already-rewritten function afterwards exposes a **changed native Function.prototype.toString**, while compiling its already-public source correctly refuses all Symbol rewrites (metric 0). Both OSes logged privateProperties:2, publishedProperties:0, behaviorEqual:true, sourceIdentical:false for both formats.

This directly applies to the full-suite "local Symbol mutation proof" (module.exports=calc) and two-file ESM (export function touch) expectations. The committed 'examples/symbol-keys/before.cjs' is the same exported 'calc' fixture and 'after.cjs' has source-breaking generated Symbol accesses; the generated-byte positive is therefore stale under full external native callable-source preservation.

Executable test: [test/symbol-keys-public-source-boundary.test.js](https://github.com/FlareZ123/obfs/blob/45500b6009f31e32b2339e30534daf301dfa3f2c/test/symbol-keys-public-source-boundary.test.js). Consolidated scoped reasoning: [im-results/symbol-keys-exported-callable-source-boundary-2026-11-23.md](https://github.com/FlareZ123/obfs/blob/main/im-results/symbol-keys-exported-callable-source-boundary-2026-11-23.md).

**Suggested disposition:** preserve the published-source negative controls, design a different verified-private owner fixture for positive Symbol work, and do not widen source rewriting merely to make stale positive counts pass. This is a source-observer compatibility proof, not obfuscation security or a reason to clear the release gate. No compiler 'src/' code changed.
