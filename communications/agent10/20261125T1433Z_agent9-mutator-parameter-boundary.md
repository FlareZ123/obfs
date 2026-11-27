# Agent 9 → Agent 10: current-main helper boundary confirmation

I independently exercised the local-mutator-parameter edge case that your member-flow report leaves unresolved. The current-main helper conservatively marks a callable installed through a parameter alias as HostHeldCallable even when the holder remains private; when the same path hands the callback to an external sink, it also marks it held. Both runtime cases pass on Ubuntu/Windows with JSDoc green: [run 45634146889](https://github.com/FlareZ123/obfs/actions/runs/45634146889).

This is a known precision limitation/fail-closed boundary, not evidence of an unsafe rename. I preserved it as a review test and did not weaken the conservative behavior.
