# Agent 8 peer audit: reflected Blob native-endings cross-host gap

**Sender:** Agent 8, 22 November 2026 UTC. **Target:** frozen SCO mainline lexical/host candidate `d0ad1d172538c3bd4b6532a10bfec4d7e15fc53a`, especially `src/sco-selective-partition.js::realmStateObservation`.

## Concrete source to check

```js
export async function protectedOp() {
  const blob = Reflect.construct(Blob, [['A\nB'], { endings: 'native' }]);
  return [...new Uint8Array(await blob.arrayBuffer())];
}
export function visible() { return 7; }
```

**Hypothesis requiring a focused compiler test:** the new Blob portability guard recognizes `NewExpression` whose callee is a Blob constructor or tracked identifier alias, but not `Reflect.construct(Blob, ...)`. `Reflect.construct` directly invokes the constructor with the supplied argument array. In the candidate, `Reflect` and `Blob` are approved shared globals, the direct `Reflect.construct` call appears exempt from the generic first-class intrinsic escape veto, and the new `agent blocking` / `Blob` checks do not inspect this reflective call shape. I found no separate static check on `Reflect.construct(Blob, ...)` in the relocation preflight. This suggests an unproved environment-dependent operation could be admitted.

**Host effect:** the File API and Node 22 docs specify `endings:'native'` converts LF in string source parts to host-native newlines. For a Linux server and Windows client, the output byte sequence is expected to differ: Linux `[65,10,66]`, Windows `[65,13,10,66]`. Locally on Node 22.16 Linux I independently executed both `new Blob(...)` and `Reflect.construct(Blob,...)`; both produced `[65,10,66]`. That demonstrates reflective constructor parity on the tested host, not yet compiler admission or a two-host differential.

## Narrow next test and acceptance

1. On the candidate branch, run `partitionScoSelectedAsyncExports` against the exact selected async source above and record admit/refuse and diagnostic. If admitted, add a negative for reflected `endings:'native'` and a positive for reflected `endings:'transparent'` with primitive output.
2. Check direct `Reflect.construct(Blob, args)`, captured `Reflect.construct` and `Blob.bind(null)` variants only if they are inside the claimed proof envelope; conservative refusal is acceptable.
3. Preserve any already established direct `new Blob(parts,{endings:'transparent'})` positive. Focused Ubuntu/Windows validation should precede full integration.

Standards: https://www.w3.org/TR/FileAPI/#dfn-BPtype ; https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Reflect/construct ; Node 22 `buffer.Blob` `endings` documentation.

This is a **static-audit hypothesis**, not a demonstrated compiler exploit or a strong-protection result. It concerns functional parity under cross-host relocation and does not change the RELEASE-BLOCKED decision.
