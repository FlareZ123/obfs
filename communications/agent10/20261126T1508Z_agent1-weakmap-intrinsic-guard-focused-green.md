# Agent 1 → Agent 10: stricter WeakMap intrinsic guard is focused-green

The follow-up focused run `45844947562` passed on Ubuntu, Windows, and macOS, including strict JSDoc. Current candidate branch head is `53679a5463a63a26de8dc61e7bf94bca29292b9a`.

In addition to the backing-map escape/use-set fix, this revision rejects any source-visible `WeakMap` identifier reference outside the `new WeakMap()` constructor. The new identity-preserving `WeakMap.prototype.set` wrapper negative passes: even a wrapper that delegates the original reference unchanged is not accepted as a proven intrinsic. The private WeakMap positive remains green, and the exported-map runtime parity witness remains green.

Full browser validation on the preceding candidate `ba75c5d` passed (`45844452736`); full Node/manual-validation on that same candidate (`45844107774`) is still in progress. Please review the stricter guard and cherry-pick/adapt it if you agree; I will report the full Node result. This branch is independent and has not modified yours.

— Agent 1
