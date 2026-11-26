# WeakMap subclass parent-prototype source-observer false-safe

**Status:** Confirmed compatibility counterexample on Agent 10 donor snapshots 0652969bf06640bc1ff6e48b575fdc2083ed5738 and 0b119c540a903cc786be74f29c2d63e6b6c2e903. The exact later-head replay and a five-form parent-prototype matrix completed red on Ubuntu, Windows and macOS. This is an intermediate result, not production acceptance or a security-hardness claim.

## Relationship to PR #382

PR #382 itself is Agent 2's narrower Web Storage DOMString source-observer patch. The Agent 10 donor branch tested here is stacked above that PR head: GitHub's compare API reports a merge base equal to PR #382 head 1bab0360e356c6174339111919ce07c124aa0491 and 57 commits ahead. This report therefore challenges the downstream Agent 10 WeakMap group-guard / reference-only Storage optimization, not PR #382's standalone head. Do not infer that PR #382 alone contains this optimization or fails this witness. Assess that narrower PR on its own exact source and tests.

## Counterexample

A module declares a local subclass:

    class WeakMap extends globalThis.WeakMap {}
    const nativeWeakMapPrototype = Object.getPrototypeOf(WeakMap.prototype);
    const nativeWeakMapSet = nativeWeakMapPrototype.set;
    nativeWeakMapPrototype.set = function (key, value) {
      document.title = value;
      return Reflect.apply(nativeWeakMapSet, this, [key, value]);
    };

The subclass's own WeakMap.prototype is not the native prototype. Its parent prototype is the shared native WeakMap.prototype. The assignment therefore mutates the intrinsic used by ordinary native WeakMap instances.

A sibling module uses the narrow reference-only Storage override:
- const captured = new WeakMap();
- a Storage.prototype.setItem replacement calls only captured.set(this, value);
- localStorage.setItem(..., inspect) causes the patched WeakMap set to coerce the function to source through the host's DOMString-compatible document.title setter.

The source observer is cross-file: the mutation module and Storage module are both supplied to obfuscateFiles. The group guard nevertheless misses the mutation, treats the sibling WeakMap as stable, and permits identifier renaming inside inspect.

## Exact evidence

- Test: test/agent6-weakmap-subclass-base-prototype.test.js
- Red-first branch: agent6/weakmap-shadowed-subclass-base-prototype-redfirst-20261126
- Test commit: a5e08f3d5215e01bd3bbfc86f7948f49fd4acaf2
- Tested donor base: 0652969bf06640bc1ff6e48b575fdc2083ed5738
- Focused workflow: https://github.com/FlareZ123/obfs/actions/runs/45866476106, exact test commit above, Node 22.23.4, Ubuntu / Windows / macOS.

All three platform jobs reached the test and reproduced the same values:
- observesFunctionSource(mutationAst) === false
- hasWeakMapPrototypeExposure(mutationAst) === false
- Storage module metrics.bindings === 4
- Native result: {value:29, independent:7}; captured source contains privateLocal.
- Emitted result: the same {value:29, independent:7}; captured source instead contains _v60c10c60634a.

The test asserts that the group guard must refuse this transform, so the three focused jobs correctly report a failing regression. The diagnostic proves runtime-value parity is insufficient: the host-observed function source changes.

The first attempt, run 45866301581, was invalid because the test fixture joined source lines using a literal backslash-n. That harness defect was corrected before run 45866476106; do not cite the first attempt as evidence.

## Why the detector misses it

The bounded scanner distinguishes a shadowing top-level class WeakMap from the ambient constructor, which is correct for the already-tested case where Object.getPrototypeOf(new WeakMap()) returns only the subclass's own prototype. But the scanner does not model the prototype parent of that subclass:
- WeakMap.prototype is not treated as the native constructor's prototype because the bare name is shadowed.
- Object.getPrototypeOf(WeakMap.prototype) is not recognized as a native WeakMap prototype expression.
- Consequently the shared group exposure flag remains false, and the sibling Storage proof does not inherit the mutation.

This is distinct from Agent 10's existing shadowed-subclass yield control, which mutates only the subclass's own prototype and should remain a non-exposure case.

## Recommended correction and validation

Track class heritage that resolves to the native WeakMap constructor (including statically proven aliases), separately from native constructor bindings. When a known derived class's .prototype is used as the input to Object.getPrototypeOf / Reflect.getPrototypeOf, or its __proto__ is read, conservatively mark the native prototype chain as exposed. Preserve the distinction between:

1. Object.getPrototypeOf(new DerivedWeakMap()): the derived class's own prototype; and
2. Object.getPrototypeOf(DerivedWeakMap.prototype): its parent prototype, which is native for a direct subclass.

Add direct, aliased-getter, and multi-level subclass controls. Keep the existing benign subclass-own-prototype mutation test green. Unknown heritage, computed keys, reassignment, and opaque calls should remain fail-closed.

The later Agent 10 donor head was 0b119c540a903cc786be74f29c2d63e6b6c2e903 (eight commits beyond the first tested donor snapshot). Replay branch agent6/weakmap-subclass-parent-prototype-current-20261126 was created directly from that exact donor head and added only the regression test at commit a81ee9ce3c9f5ab5844cf49a123081dc139985fe. Focused run https://github.com/FlareZ123/obfs/actions/runs/45866696379 completed red on Ubuntu, Windows and macOS with the same false-negative group exposure, four permitted bindings, and native/emitted Function#toString mismatch. The later eight commits therefore did not close this counterexample.


## Five-form parent-prototype matrix on the later donor head

The expanded test at commit 57a3f26cc872e9dec0200cb7d46b488eb9213707 was run against the same exact donor source head 0b119c540a903cc786be74f29c2d63e6b6c2e903. Focused run https://github.com/FlareZ123/obfs/actions/runs/45867880661 completed red on Ubuntu, Windows and macOS. All five mutation forms reproduced the same mismatch:

1. A non-shadowing class LocalMap extending globalThis.WeakMap, then Object.getPrototypeOf(LocalMap.prototype).
2. A shadowed class WeakMap extending globalThis.WeakMap, then WeakMap.prototype.__proto__.
3. A shadowed class using an aliased Reflect.getPrototypeOf.
4. A shadowed class using an aliased Object.getPrototypeOf.
5. A two-level subclass chain using two Object.getPrototypeOf operations to reach the native prototype.

For every form, both local and group observer checks were false, Storage metrics.bindings was 4, the native host-captured function source contained privateLocal, and the emitted source contained a renamed identifier. Application return values stayed equal. The diagnostic matrix is emitted under WEAKMAP_PARENT_PROTOTYPE_VARIANTS in the failed focused job logs. This is five source-shape variants of one shared semantic boundary, not five unrelated runtime mechanisms.


## Independent reproduction on Agent 1's candidate

Agent 4 independently reused the single-case red-first test against Agent 1 candidate snapshot dd9f5783abb3df607c615dd08fe6646ce4264006. The run was 45867411716 on branch agent4/weakmap-agent1-latest-container-challenge at test-bearing head ce0a6520caec2da9dcec904b50acc5826cc6a109. All three focused platform jobs (Ubuntu, Windows and macOS) reproduced the same false-safe: local observer false, group exposure false, four Storage bindings permitted, native captured source contains privateLocal, emitted captured source contains _v60c10c60634a, and application values remain equal. This independently confirms that the semantic gap is present in a second downstream candidate line, not only Agent 10's donor.

The Agent 4 run replays the original direct parent-prototype witness; it does not run the five-form variant matrix. The five-form matrix remains pinned to Agent 10 donor head 0b119c540a903cc786be74f29c2d63e6b6c2e903 in run 45867880661.

## Scope limits

This is one COO cross-file source-observation compatibility counterexample against a research donor. It does not establish behavior in SCO/SNO, full compiler correctness, anti-LLM performance, static reconstruction cost, tamper-resistance, domain-locking, or the 2.5× runtime budget. No production source was changed and no PR was opened. Keep the downstream Agent 10 group-guard / reference-only Storage candidate unpromoted until this regression is addressed and the shared exact-head validation funnel is green. Assess PR #382's narrower Web Storage patch separately.
