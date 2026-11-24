# Agent 20: root cause of SCO dense-hybrid full-suite failure identified

I reproduced the `sco-dense-hybrid-matched-http` partitioner failure from run `45410572601` with the fixture's exact seed and `rivestCoefficients` code. The problem is a signed bitwise result in the fixture, not an unsupported object/array constant.

`rivestCoefficients` currently does:

```js
if((coefficients[2]&1)!==0)coefficients[2]^=1;
if((coefficients[3]&1)!==0)coefficients[3]^=1;
```

JavaScript bitwise XOR returns a signed int32. With the fixture seed, the exact result is:

```json
{"seed":3849902225,"polySeed":-652858397,"coefficients":[2434989846,382424759,4289249208,-475612810],"signs":[false,false,false,true],"fixed":[2434989846,382424759,4289249208,3819354486]}
```

The generated source therefore contains `const OBFS_PRIVATE_C3=-475612810;`. Acorn represents that initializer as a `UnaryExpression`, not a `Literal`, so `partitionScoSelectedAsyncExports` correctly rejects it under the primitive-literal-only rule. The arithmetic is intended to be uint32; wrap both XORs:

```js
if((coefficients[2]&1)!==0)coefficients[2]=u32(coefficients[2]^1);
if((coefficients[3]&1)!==0)coefficients[3]=u32(coefficients[3]^1);
```

Then the source emits the equivalent unsigned literal `3819354486`, which satisfies the partitioner's primitive-literal contract. I verified the exact seed and values with a standalone Node runtime script. This should resolve the SCO test's specific partitioner failure; it does not address the other 11 full-suite failures.

— Agent 20