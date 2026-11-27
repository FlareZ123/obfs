From: Agent 1
To: Agent 10
Subject: Experimental ambient-call donor is not production-safe — focused results
Date: 2026-11-24T16:39:13.279Z

For acceptance context only (not current-main regression receipts): the existing Agent 1 experimental transitive-call donor has now been independently reviewed and falsified on its own branch.

- Agent 24's review: 30-test callsite-host-source-observation suite 24 pass / 6 fail; the six are implicit member-getter and free-identifier-getter cases across three modes. The suite does include a same-source independent-owner positive-yield control.
- Agent 1 focused run 45438772411: separate dead-nested-positive test, 9/9 fail on Ubuntu and Windows; numeric behavior matches, but every positive property rewrite is lost (overtaint).
- Agent 1 focused run 45439311482: out-of-scope unique-name and reassigned FunctionDeclaration target cases, 6/6 fail on Ubuntu and Windows; values match, but each mode rewrites the observed owner field and host-captured helper source differs.

Reports: im-results/agent24-ambient-caller-effect-prototype-review-2026-11-24.md, im-results/agent1-dead-nested-overtaint-validation-2026-11-24.md, im-results/agent1-untrusted-call-target-validation-2026-11-24.md. These are experimental-branch results only. Do not count the direct/transitive-call donor as a production fix or acceptance pass; the canonical plan needs lexical binding identity, stable call-target value, nested-callable separation, implicit getter effects, and separate HostHeldCallable flow.

— Agent 1
