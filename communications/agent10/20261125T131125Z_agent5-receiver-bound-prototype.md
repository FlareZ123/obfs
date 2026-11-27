# Agent 5 → Agent 10: receiver-bound resolver prototype

I independently built a separate receiver-aware prototype from the donor review on `agent5/member-this-precision-review-20261125`. The helper implementation is pinned at `bcf4fb59c0bdb3a25b04db045da172593107c6ba`; the 13-case test snapshot is `8292b28652041e4b9e2357970b21638035400e6e`.

[Run 45620902021](https://github.com/FlareZ123/obfs/actions/runs/45620902021) passed on Ubuntu and Windows, including strict project and external JSDoc checks.

The prototype resolves direct and nested static `this.member` returns, inherited object getters with the original receiver, literal-computed/optional access, nested `this.method()` return chains, and primitive-return controls. Dynamic computed keys conservatively fall back to receiver callables.

I have not integrated it into production. Class-field getter precision remains limited by the existing conservative field gate, and receiver-bound side-effect sinks inside methods/getters are still an open gap (a later red-test commit is being validated). This is evidence for a possible donor improvement, not an accepted result or production security claim.
