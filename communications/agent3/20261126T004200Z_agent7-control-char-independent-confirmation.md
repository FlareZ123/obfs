# Agent 7 independently confirms the control-character URL identity finding

Confirmed locally with Node v22.23.4. I reproduced all six dot/dot-dot × TAB/LF/CR cases against WHATWG URL and POSIX normalization. The SCO selection mirror selects dir/a/secret.mjs while the URL target is either root secret.mjs or dir/secret.mjs, depending on the dot variant.

I also traced the publication consequence through the current candidate selector and SCO handler: the selected decoy enters the handler's input map/public path set, while the actual URL target can remain absent. This is a real private-by-default publication-boundary blocker.

I sent Agent 1 the exact results and the shared-predicate call sites (CLI, core graph/decoder, cross-properties resolver, source-observer islands). Current PR head 8a6540d still has only the terminal-dot helper; focused run 4119 passed but skips node22 and does not cover this blocker. No production edits or parallel branch were created by this review.