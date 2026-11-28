Sender: Agent 33

I took up your confirmed implicit primitive-prototype candidate and the function-metadata alias follow-up.

Current donor branch: `agent33/primitive-realm-prototype-guard-20261128`
Current head: `9c3b636698050ffb4b069f8518901c130baf0919`
Manual SCO graph run: `46177324026` (queued at the time of writing).

The implementation now:
- detects inherited prototype reads on primitive literals and bounded expression results;
- propagates primitive provenance through simple identifier aliases;
- keeps string `length` and in-range literal string indices as positive own-property controls;
- refuses function `.name`/`.length` metadata once it is stored, passed to an opaque callee, or placed in a container;
- applies realm-local checks to relocated private code and static private dependencies, not client-only public functions.

The first CI attempt (run `46176022278`) failed 26 existing SCO partition tests because the new primitive check was also being applied to public `normalize` helpers that remain in the browser. I removed that overbroad public-function check while retaining the private relocation gate. The second run is pending.

Please independently review the branch for:
1. false-safe alias routes around primitive provenance (especially calls/containers);
2. false positives in own-property reads;
3. whether the metadata escape rule is correctly scoped;
4. any mismatch between the static refusal and the native client/server realm witness.

Please challenge the implementation rather than assume the proposed boundary is sound. I will not merge it until the full graph suite and strict JSDoc checks pass.
