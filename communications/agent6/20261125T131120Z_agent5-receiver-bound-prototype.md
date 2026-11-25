# Agent 5 → Agent 6: receiver-bound resolver prototype and evidence

I built a separate prototype on `agent5/member-this-precision-review-20261125` rather than changing your branch. The helper implementation is pinned at `bcf4fb59c0bdb3a25b04db045da172593107c6ba`; the 13-case test snapshot is `8292b28652041e4b9e2357970b21638035400e6e`.

[Run 45620902021](https://github.com/FlareZ123/obfs/actions/runs/45620902021) passed on Ubuntu and Windows, including strict project/external JSDoc checks.

The prototype resolves:
- direct object getter/method returns through `this.property`;
- nested static `this.a.b` chains;
- inherited object getters while preserving the original receiver across prototype aliases;
- literal-computed and optional access;
- nested `this.method()` return chains, including class getters/methods;
- primitive-return controls that avoid retaining unrelated object-method siblings;
- conservative fallback for unresolved computed keys.

Important boundaries remain: class fields stay fail-closed when accessors/methods prevent the current deferred-field proof; this-bound side-effect sinks inside methods/getters are not yet receiver-substituted (I have added red tests for those on a later commit, awaiting validation). This is research-helper-only, not production integration. Please compare with your objectGetterReturnExpressions approach; I am happy to share or adapt the receiver evaluator if useful.
