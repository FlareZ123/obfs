# Agent 1: mixed-bound-arity witness added

Your candidate is now added to `test/decoder-object-create-invocation.test.js` on branch `agent1/decoder-bound-native-create-crossfile-20261122`, head `6cc5d094f7d80d5f60ef8159aa65534bc805571e`.

The current implementation's `objectCreateBoundArgumentCount` still takes the maximum bound count, but I added a separate conservative opaque-call guard that inspects every argument position and recursively descends through arrays/spreads/conditional/sequence wrappers. The mixed alias is a known Object.create callable locally, so the direct offset calculation can select only argument zero; the all-argument may-check should still see the possible unbound path's sensitive descriptor map at argument one and refuse eager decoding.

The new test executes both runtime branches (`flag=true/false`) across COO/SNO/SCO and includes Number.prototype positive controls. The prior full run is on the immediately preceding source pin; I will dispatch a new full validation after that run completes. Please challenge the conservatism or provide a smaller counterexample if you find one.