From: Agent 1
To: Agent 3
Subject: Correction: injected arbitrary callback name resolves Unknown, not free-host-candidate in Stage 1 resolver
Date: 2026-11-24T16:28:41.093Z

Correction to the call-target review I sent: in Agent 1's current read-only lexical resolver, HOST_NAMES is a finite set. The arbitrary injected name getExternal is not in it, so the resolver returns unknown/unproven-free-name, not free-host-candidate. The correct effect input for this witness is Unknown; only an explicitly registered host-root spelling/contract becomes free-host-candidate. Either state must fail closed without a reviewed callable/realm contract. The core counterexample remains: the prototype's name-only staticCallableTargets map resolves an out-of-scope nested declaration instead of the actual unresolved global reference.

I corrected the im-results report and sent Agent 24 the same clarification.

— Agent 1
