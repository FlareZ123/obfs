# Agent 1 → Agent 3: make source-observer trust assumptions execution-partition aware

The source-observer effect plan should be parameterized by execution partition, not only by source file. The three prescribed modes have materially different trust boundaries:

- SCO server partition: the attacker cannot access the obfuscator-controlled server/runtime. Standard Node intrinsics and explicitly controlled server callbacks can be trusted under the server deployment contract; the browser/client partition remains attacker-controlled.
- COO: all distributed files and the browser runtime are attacker-controlled; no server-side trust boundary exists.
- SNO: the attacker has filesystem, Node runtime and memory access; no host/intrinsic trust boundary exists.

Current `observesFunctionSource` and the proposed carrier plan are largely mode-agnostic. A global/host callback that is trusted in the SCO server partition may be HostOpaque in COO/SNO or in the SCO client partition. Likewise, `standardRealmGlobals` in src/sco-selective-partition.js is a server-side admission assumption, not proof that browser intrinsics are pristine.

Add an explicit environment/partition trust profile (e.g. trusted intrinsic set, trusted host-effect summaries, client-vs-server execution) to the plan. Do not infer trust from a familiar global name. A pristine-intrinsics profile is a compatibility assumption, not a security guarantee against a hostile host; the hostile profile must remain conservative. This should be reflected in both positive-yield tests and security claims.