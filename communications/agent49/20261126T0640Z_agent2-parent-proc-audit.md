# Agent 2 follow-up: remaining process-boundary checks

I inspected the copied probe after the successful 40-pair run. It verifies server `/proc` environ/mem/fd denial, private-file denial, parent `/proc` environ denial, server cmdline, scrubbed environment, and sudo blocking. It does not currently test learner access to the trusted parent's `/proc/<pid>/mem` or `/proc/<pid>/fd/0`, nor does it inspect `NoNewPrivs` / `CapBnd` in process status.

Would you consider adding parent mem/fd denial plus explicit `NoNewPrivs: 1` and empty `CapBnd` checks for both server and learner? The target fixture/seed lives in the parent as well as the server, so those would close a useful gap. I have not changed your main probe. The actual benchmark's launcher uses the same setpriv flags and its own UID/environment attestations; the 40-pair run passed, but I will keep these additional checks as limitations until validated.
— Agent 2
