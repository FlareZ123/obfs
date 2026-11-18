# SCO ratchet versus equal-trust minified RPC: precommitted release-decision experiment

**Agent 41, 2026-11-17. Security-candidate decision lane.** The candidate is the exact generated `createScoRpcClientSource(['batch'])` facade atop a trusted server-held HMAC ratchet. The control is a human-readable RPC adapter minified with the repository's pinned esbuild, atop **the same trusted server operation, authentication, ratchet algorithm, secret, private 8 MiB work and account name**. This avoids confounding code-obfuscation superiority with trusted-server residency.

## Exact matched model and falsifiable question

Create two independent SCO server instances with exactly equal secret root and authenticated Account A principal, distinct fresh private state instances, same method `batch` and same sequence/argument validation. On one server, distribute the generated SCO ESM facade; on the other distribute a conventional small minified ESM facade that calls the **same RPC endpoint and method**. Both are allowed identical capabilities: an attacker knows the full public source, can instrument it, has one legitimate A bearer with unlimited calls, cannot access B's bearer or either server's key/memory, and can intercept all responses.

The independent attacker receives only each public URL and A credential and runs the actual retrieved code in a separate Node process with a fully controlled `fetch`. Execute the same 32 held-out event inputs as a single sequential batch on both isolated A copies. Check exact equality of all outputs and against an independent original private machine. Try unauthenticated direct requests and B impersonation, preserving 403. A proxy can offer online A functionality in both environments.

## Decision rule

Claim added obfuscation security only if the generated candidate raises measured attacker cost over the **same-trust minified control** on static source reconstruction, dynamic instrumentation, offline B extrapolation and online A functional cloning, with no strict 2.5× over-budget pair. Minified control and generated candidate may have different bytes and syntax but must provide identical external contracts. If the A-only attacker can clone online with equal effort and both emit no HMAC secret source, **reject any added security superiority claim for the generated SCO facade**; retain only the independently verified server-residency/authentication result. This is an expected negative result. Do not compare to minifying a whole client-resident private algorithm since that changes the trust model.

Measure at least seven full 16-event native/candidate/control timings on each Node OS and report each strict >2.5× pair, not just medians. Server setup is an SCO-server initialization cost, while public ESM source acquisition/import is a client setup cost and must be included in at least one separate cold-start observation. Do not claim a global workload bound from this HMAC-heavy sample. If static reconstruction of private server behavior is claimed impossible, explain its external trust assumption and the limit of online A access.

## Reproduction

Use Node 22, the repository's declared esbuild version, strict JSDoc, source SHA256s of both emitted ESMs, separate native reference with same protected key and `privateWorkBytes=8,388,608`. Save the exact executable tree SHA, raw paired timing ratios and exact online-clone success. Do not promote a security-positive result without an independently executable adversary, and report the equal-trust control faithfully.
