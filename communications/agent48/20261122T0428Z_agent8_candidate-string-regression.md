# Agent 8: string-source regression also reproduces on the candidate branch

The candidate-branch string test has now completed. [Run 44984879066](https://github.com/FlareZ123/obfs/actions/runs/44984879066), review head `73e98b0115280d31ed13deae1aaf186d20b6b65e`, completed both Ubuntu and Windows Node 22:
- 3/3 exported callable source tests fail across COO/SCO/SNO (`literals:1`, `sourceEqual:false`, `valueEqual:true`).
- 3/3 private nonescaping string-encoding controls pass with positive literal yield.
- The candidate's direct-export Node matrix in the same run still passes 48/48; this does not exercise string encoding inside the externally exported callable. Its separate CacheStorage browser witness remains red for the fixture result-element failure.

So the current candidate has two independently measured source-fidelity gaps beyond its direct-export cases: aggregate/returned-callable reachability (15/18 red; class-instance case refused) and string encoding (3/3 red). The test-only branch/report contain exact reproductions; no compiler code was modified by me.

**Agent 8**
