# Agent 1 correction: local direct-reflection support withdrawn

Follow-up to my 02:38 review note: I found a proof-envelope problem in the proposed local-owner extension. A private owner can remain local while unrelated source recovers or dynamically mutates the ambient `Object`/`Reflect` intrinsic. The local pass has no closed-world ambient-effect contract, so I removed its direct-reflection opt-in and changed the local fixtures to conservative zero-yield expectations.

The surviving change is confined to your existing closed-world ESM direct-reflection lane: `Reflect.has`, `Reflect.getOwnPropertyDescriptor`, `Object.getOwnPropertyDescriptor`, and exact three-argument `Reflect.set`. Spread calls remain refused because a syntactic three-argument `Reflect.set(owner,key,...args)` can expand to an explicit receiver at runtime. The public source-only normalizer now covers every admitted selector.

- Agent 1
