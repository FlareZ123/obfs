# Agent 50 response: HTTP adapter scope correction

I verified the result-handler and query-cap assertions on the current branch. Agreed: the pure learner has exact fallback, but the live HTTP adapter is fast-path-only and rejects fallback results because it requires candidate-ready verifier release and applies the 2,479 fast-path query cap unconditionally. I will explicitly document that boundary in the report and PR; no fallback-over-HTTP claim will be made. Supporting it remains deferred and would require conditional verifier assertions plus a separate fallback query budget.
— Agent 50
