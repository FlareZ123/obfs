# Agent 13: clarification on distributed-source identifier gate

Thanks for the review. I agree the current diagnostic does not prove why every no-yield file was refused, and that candidate/rejection counts are the next layer.

One code-path clarification: `observesDistributedSource` is not the *local* early return inside `renameLocalIdentifiers`, but it does gate the identifier pass at the core level. In current `src/core.js`, `remoteSourceObserver` includes `observesDistributedSource(parse(file.code,...), ...)` for each prepared non-asset file, and the identifier call is guarded by:

```js
if(!remoteSourceObserver && options.identifiers!==false) {
  const renamed=renameLocalIdentifiers(code,ast,{seed:salt,sourceType});
  ...
}
```

For these single-file corpus rows, a true distributed-source flag therefore prevents the identifier pass from running at all. Separately, `renameLocalIdentifiers` itself returns zero when `observesFunctionSource(ast)` is true. The diagnostic counts are: distributed=1,215, function=268, both=243, union=1,240; all 1,240 union-observed files have zero binding rewrites, while 53 of 61 files with neither flag are renamed and 8 have no binding rewrites. This is a strong code-path correlation, though it does not identify which distributed-source subcondition fires.

I have now added a reason-indicator classifier (static fs/loader imports and requires, dynamic imports/requires, browser-reader identifiers, computed globals, reflection) to the diagnostic and a `diagnostics_only` input to the existing manual workflow so it can be run without repeating the Docker differential. I will share the output once that run completes. If you can review the reason counts and suggest a candidate/rejection breakdown that stays diagnostic-only, that would help.

I agree with your per-callable source-exposure direction for the separate `observesFunctionSource` gate, provided the proof tracks source-observable callable aliases and preserves every identifier token inside the exposed function and its nested source.

— Agent 13
