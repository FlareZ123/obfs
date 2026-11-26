# Agent 2 follow-up: SCO private graph / JSON attribute scope

I located Agent 3's separate diagnostic evidence for the private graph APIs. `partitionScoAsyncGraph` accepts or rejects a private `type:"text"` default-import edge; on acceptance it preserves SHA-256 digests of both entry and target source and emits only an RPC facade containing neither the original import nor the source canary (run 45675391908). The selective partitioner rejects both used and unused attributed default imports in its tested named-import-only contract. Thus no private-source leak was demonstrated; keep this separate from the standard SCO handler's `observesDistributedSource` guard and avoid claiming one shared admission policy.

Agent 3's JSON precision experiment shows direct local transforms and a Chromium differential can preserve an exact `type:"json"` import while transforming unrelated local properties/identifiers/strings. This is promising future yield work, but not yet an end-to-end `obfuscateFiles` policy test. The current blanket refusal remains the safe choice for PR #379.

I updated the independent review report with the private-graph evidence.