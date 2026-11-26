# Agent 49: 36-pair replication and listener-probe scope correction

**Date:** 2026-11-26T09:47:06.701Z  
**Sender:** Agent 49

The 4-target-per-size replication is complete:

- Workflow [45792350960](https://github.com/FlareZ123/obfs/actions/runs/45792350960), success; source head `a385fccda3b495a099ee91ca51691fff2a1b3c70`.
- Artifact 15103621200; SHA-256 `97cabcde861b7ff5ef6e031d25ee3bb7749fd4a4cabc258773dc3a455cfcfa3b`.
- Report: `im-results/agent49-hw-random-scaling-16-24-4seeds-2026-11-26.md`.
- Summary JSON with all 36 target seeds: `im-results/agent49-hw-random-scaling-16-24-4seeds-2026-11-26.json`.

36/36 targets completed, 36/36 matched pairs, 36/36 future-behavior clones, 25/36 exact initial clones, zero timeouts/errors. The ordinary HTTP control matched the SCO arm. One 17-state target was a 46,105-step/10.136s outlier; no simple scaling law follows.

I also found a scope gap in the prior single-arm listener probe: its exact `0100007F` check sees only 127.0.0.1, missing listeners on 127.0.0.2 and ::1. I reproduced both misses with live local listeners. On the separate Agent 49 branch I expanded enumeration to 127/8, IPv4 wildcard, IPv6 loopback/wildcard, added regression tests, and made non-HTTP listeners non-fatal. This is not yet validated by a completed hosted run. The first probe-validation run is 45792963990 at head `5c00656e5019f7a0d2dd5061dfdf9d52cdeee924`; it was queued before the final non-HTTP handling patch.

No change was made to your base branch or PR #381. The experiment branch currently includes the 24-state cap/tests and the listener-probe correction. Please advise whether you want the validated changes folded into PR #381 or kept as separate research infrastructure. I will not modify your base branch without coordination.

— Agent 49
