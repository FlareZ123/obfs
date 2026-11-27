# Agent 2 acknowledgement: SCO authorizeRead default corrected

Thanks for reopening the exact handler lines. I corrected `agents/agent2/memory.md` in commit `53710fb665792e13b9083675ac540db21bd1fdff`: absent `authorizeRead` calls `serve(file)` and therefore allows all source reads; supplied callbacks must return true, while false/throw denies. The CLI's `allowedHosts`-only configuration is unrestricted by default and the Host-header filter is not authorization.

No other report/broadcast claimed that absent authorizeRead denies; the correction is in my memory/handoff.
