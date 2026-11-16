# Computed global destructuring mutates ambient Reflect: exact ESM red/green witness

**Agent 6, 2026-11-16. Status:** intermediate compiler-safety finding; scoped to a syntactic proof guard. This does not establish general JavaScript equivalence or anti-tamper security.

## Reproducible semantic counterexample

A declared three-module closed-world ESM graph has an exported owner, state={secretField:41}, and an unrelated local record with a dynamic own-value read. The record reader also calls Reflect.ownKeys(schema). Its entry module executes this **source-visible** mutation before calling the reader:

    const {['Ref'+'lect']:capability}=globalThis;
    capability.ownKeys=globalThis.HOST_REFLECT;

The fixed host preloader supplies HOST_REFLECT, which invokes a dynamic ESM import of state.mjs and takes Object.keys of the exported owner when the unrelated schema is inspected. The preloader is unchanged across native and generated runs. In the original graph, the observed key is secretField. The compiler before the repair assumed that the record's own-key inspection was the native method and renamed the unrelated exported owner's field. The host observed a generated _p... field instead, violating native/generated behavioral parity.

The bounded proof already tracks destructured values of a global root as hostCallAliases, including through ordinary identifier assignments. It recognized **calls** of such values but not direct assignment/update/delete through their member expressions. The generalizable repair reuses that alias provenance: a source-visible member write through an extracted host capability invalidates the optimistic native-record proof. It is a conservative refusal in the exceptional cross-file proof path, not a new runtime decoder or an assertion about arbitrary Proxy/loader effects.

## Executable evidence

- [Five native/generated real Node ESM cases](../test/closed-record-destructured-global-capability.test.js) include computed direct destructuring, dynamically built selector, forwarded alias, Object.assign of the extracted ambient value, and a separate harmless unrelated-field positive.
- [Exact pre-fix Ubuntu/Windows red run 43872277758](https://github.com/FlareZ123/obfs/actions/runs/43872277758), source 08cb5ee0ff41c317ba445638e29cf5d71ec71cb6: **73 passed / 2 failed** among 75 focused Node tests on both operating systems. The two new failures were direct computed destructuring and its forwarded alias. The observed result diverged as ["_p43d0dc7d8fb4"] versus ["secretField"] in the first case. Other checks and two of the new negative transports already declined safely.
- [Narrow compiler repair](../src/cross-properties.js) commit e51fe92ff7c47774ed288aa14831ac7027f15a97: adds an extracted-host-alias member-write exclusion. The same [manual application challenge workflow](../.github/workflows/manual-application-challenge.yml) tests this regression together with a native positive with exactly one eligible key rewrite.
- **Post-fix integration run:** pending validation at the time of the initial report; do not infer a pass from the code patch alone.

## Interpretation and next decision

The true contract is a source-visible, externally callback-capable JavaScript realm. A declared ESM file list is narrower than what that realm can execute. The direct and forwarded alias failures show another case where a finite syntax recognizer silently assumed native capability identity after a real source mutation. Even if this repair passes, arbitrary host effects, computed alias transport and full-runtime adversarial instrumentation remain outside any proven general model.

One positive owner-field rewrite in the unrelated-selector fixture is an **anti-vacuity measure**: the proof should retain some actual transformation when a global read provably does not mutate a native method. A passing refusal alone does not advance reverse-engineering resistance. There is no new claim of general 2.5× compute overhead or secrecy from this guard.
