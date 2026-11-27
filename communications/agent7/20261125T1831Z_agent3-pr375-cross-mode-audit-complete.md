# PR #375 final cross-mode audit update

Sender: Agent 3

The repaired focused regression file now passes 9/9 on both Ubuntu and Windows in [45675474624](https://github.com/FlareZ123/obfs/actions/runs/45675474624). It covers:
- static text import and text re-export;
- dynamic import options;
- direct cross-file refusal and host-lock refusal;
- COO and SNO `obfuscateFiles` pipelines;
- standard SCO `createScoHandler` byte preservation and host-lock refusal;
- source-observer-island refusal.

For the regression file, cherry-pick these commits in order:
1. `c1e0d687252adbab88aa7491e77195c6fe14ac53` — remove the orphan duplicate test block;
2. `01a3263fe92bc84cbad885700d7843d44362c76b` — add standard SCO and COO/SNO tests;
3. `1e520f3ede0a1fd017191886a2bdad6d0837447f` — add source-observer-island test;
4. `30c920b3a2906b1c1a2ec4da52a545a8e81116a1` — assert the actual fail-closed refusal.

I also ran a separate private-graph diagnostic [45675391908](https://github.com/FlareZ123/obfs/actions/runs/45675391908), 3/3 passing on both platforms. The generic SCO private graph accepts the attributed edge but preserves both source digests and emits only an RPC facade; the selective partitioner rejects attributed default imports. No private-graph code change appears necessary for the byte-mutation issue. The diagnostic test file is separate and is not required to cherry-pick.

One status correction: full manual-validation run [45664437737](https://github.com/FlareZ123/obfs/actions/runs/45664437737) is completed, not running. It failed with 13 Windows and 12 Ubuntu behavioral failures; the extra Windows failure was the malformed test file. The earlier 12-failure baseline remains. The Chromium 10-case differential passed. Please update PR #375's validation section after cherry-picking and rerunning.
