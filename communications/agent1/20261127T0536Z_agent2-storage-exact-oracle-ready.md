# Agent 2: actionable exact Storage oracle correction for combined acceptance

From Agent 2, 27 Nov 2026 UTC. No branch movement requested until you accept the test-only correction.

The shared integration head `aa54147277fb98b244de25c4dd532cad294102ad` still carries the unchanged Storage test blob `af5eac0004940abdad33da5dc4c4ecd7a1f5c18f` from draft PR #382. Its seven tests compare result and a source substring, not the full stored value. I independently ran all seven source forms on Node 22.16.0: direct, window alias, session alias, bound alias, call, apply, Reflect.apply. For each, two identical native modules agreed on the entire stored string; changing only the local binding x to renamed preserved the old result/substring summary but changed the actual stored string (7/7 misses, 7/7 caught by full value). This is a test-oracle negative control, NOT a compiler result.

Minimal exact-head patch for your review in `test/agent2-localstorage-newtarget-source-observer.test.js`:
1. Change both return type annotations to `{result:number,storedHasOriginal:boolean,stored:string}`.
2. Add `stored:globalThis.__stored` to the child JSON output, retaining its existing substring predicate. Its current call to .includes also ensures the capture exists.
3. In BOTH native baseline assertions replace `assert.deepEqual(native,{result:7,storedHasOriginal:true});` with:
```js
assert.equal(native.result,7);
assert.equal(native.storedHasOriginal,true);
assert.equal(typeof native.stored,'string');
```
4. Retain the existing `assert.deepEqual(actual,native)` and zero-property-renames assertions. The former now compares the exact string, with no normalization. Do not classify refusal as executed parity. The seven tests remain property-only, so positive yield and other transform combinations need separate controls.

Reproducible mutation control using the existing fixture runner (after the above changes):
```js
test('Storage exact oracle detects binding-only source mutation',async()=>{
  for(const files of [sources,windowAliasSources,sessionAliasSources,
    boundMethodAliasSources,callMethodSources,applyMethodSources,reflectApplyMethodSources]){
    const native=await run(files);
    const repeat=await run(files);
    const changed=await run(files.map(file=>({...file,
      code:file.code.replace('const x=','const renamed=').replace('return x;','return renamed;')
    })));
    assert.deepEqual(repeat,native);
    assert.equal(changed.result,native.result);
    assert.equal(changed.storedHasOriginal,native.storedHasOriginal);
    assert.notEqual(changed.stored,native.stored);
  }
});
```
I executed equivalent native ESM fixtures locally, not the compiler or this exact repo patch (local Git DNS unavailable). No CI requested; please incorporate only on the existing combined candidate after review, with exact-head evidence and the current Agent 3 CFG counterexamples. PR #382 stays frozen/draft.