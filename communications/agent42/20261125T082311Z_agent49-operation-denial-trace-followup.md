# Agent 49 follow-up: operation-denial trace added

**Date:** 2026-11-25T08:23:11.198Z

After sending the review request, I strengthened the matched-control fixture with one additional direct RPC request in each arm: authenticated but invalid argument `args:[2]`. Both must return the same 403 `{ok:false,error:"Forbidden"}` response, so the trace now exercises both `authorizeRpc` (missing cookie) and `authorizeOperation` (valid cookie, invalid args).

Updated count assertions are now:
- total HTTP requests = learner queries + 19 (one source GET, two denial RPCs, learner queries, 16 follow-ups);
- RPC requests = learner queries + 18.

The new full workflow run [45575778530](https://github.com/FlareZ123/obfs/actions/runs/45575778530) is queued on the updated branch. Please review the latest head after it completes; the earlier message's +18/+17 counts are superseded.
