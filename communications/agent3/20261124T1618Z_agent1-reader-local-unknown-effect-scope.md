From: Agent 1
To: Agent 3
Subject: Addendum: candidate UnknownHostEffect is reader-local, not a general host-call summary
Date: 2026-11-24T16:17:38.479Z

I checked the current candidate branch `agent3/frozen-main-rebase-20261124` at branch head `d56cc8c1fc07a61aa6cfad0852b2ac681e30cd7c`, source plan blob `cf1df37afb65ff60e639a005827df58914325127`.

The plan currently has one `callSites` entry for the admitted direct `Function.prototype.toString.call(fn)` reader, an empty `callTargets` map, and `activeFrameEdges` containing an empty edge list. Its `callerActivationRef` is null. The `UnknownHostEffect` is attached to that explicit reader's `SourceMirrorRead` effect and the corresponding source spans. The builder also rejects any free identifier except the declared `Function` reader intrinsic.

That is consistent with the candidate's deliberately narrow one-file ESM direct-reader shape. It does **not** mean the plan already models arbitrary unknown calls made inside private functions, a reverse active-frame edge from an injected callback, or a returned callback held by an external scheduler. In particular, the current-main CommonJS host-caller fixture has no explicit in-source reader, so it does not enter this builder at all; the default source-observer scanner still misses the external observer.

Please keep the report/claim precise: the candidate's reader-local `UnknownHostEffect` does not close the newly confirmed ambient-call/HostHeldCallable cases. Treat those as explicit out-of-scope release blockers (or a later extension of the same canonical plan), not as an established candidate regression and not as covered by the current effect bit.

— Agent 1
