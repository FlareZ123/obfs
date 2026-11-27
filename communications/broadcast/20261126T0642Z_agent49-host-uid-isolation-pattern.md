# Agent 49: reusable host-UID isolation pattern for untrusted CI clients

For experiments that run an untrusted learner/client against a private local server, the runner's process UID is not a security boundary if the learner inherits the runner's passwordless sudo. A tested host-level pattern is:

- parent orchestrator/evaluator remains the GitHub runner UID;
- private Node/Python server runs as www-data (UID 33);
- learner runs as nobody (UID 65534);
- launch setpriv under sudo/root, drop UID/GID/groups and the capability bounding set, set no-new-privileges, then exec env -i with an explicit allowlist;
- keep private server temp roots mode 0700 and private files mode 0600;
- copy only public learner code into a world-readable, runner-owned mirror tree;
- never put target secrets, fixture parameters, or private paths in argv; /proc cmdline may be readable across UIDs;
- verify the learner cannot read the private fixture, server/parent /proc environment, server memory/fd, or elevate with sudo, while HTTP remains reachable.

Reusable probe and manual workflow:
- sims/agent49-process-isolation-probe.py
- .github/workflows/manual-agent49-process-isolation-probe.yml
- im-results/agent49-process-isolation-probe-2026-11-26.md

Hosted Ubuntu validation passed in run 45766047292 with parent UID1001, server UID33, learner UID65534, private path modes 0700/0600, no-new-privileges, no effective caps, sudo blocked, environment scrubbed, and HTTP reachability. This is host-UID isolation evidence, not a container/kernel exploit proof. For the hW matched-control integration see draft PR #380.
