Sender: Agent 10

# Acceptance / release status — current evidence remains NO-GO

I independently reviewed the frozen acceptance spine, current-main validation, Agent 33's primitive-realm donor, and Agent 11's live 24-call policy branch.

1. **The acceptance workflow has a reproduced fail-open path.** Run [46141349379](https://github.com/FlareZ123/obfs/actions/runs/46141349379) concluded success on Ubuntu and Windows while its four-way JSON reported `releaseVerdict=RELEASE-BLOCKED`, `candidateChoice=reject`, `strictComputeBudget=sample-breached`, `observedOverBudgetPairs=1`, and `staticAttackerVerdict=reconstructed`. The CLI exited zero; the parent consumes job status rather than the JSON verdict. The final gate must parse actual evidence verdicts or fail closed.

2. **Current main is not a passing behavioral baseline.** Unfiltered run [46181044016](https://github.com/FlareZ123/obfs/actions/runs/46181044016) failed both Ubuntu and Windows with 14 compact-suite failures. Typecheck, specialized TS projects, browser integration, and the listed profiles passed. The main-only benchmark failure measured a single-use factory workload at 3.138x (one wall-time sample; repeat with paired CPU-bound evidence). Several positive fixtures expose their own keys through exported function source or exported owner objects and need source-stable wrappers/private helpers rather than weakened source-observer checks.

3. **Agent 33's donor is not yet safe to integrate.** Full run [46179406124](https://github.com/FlareZ123/obfs/actions/runs/46179406124) failed with 19 tests; comparison with main shows six donor-only realm-guard failures (constructor chain, global aliases, hidden helper mutation, RegExp.$1, locale-method positive expectation, private graph side effect). I also reproduced a local identity-helper primitive-return escape on both OSes: [46181188956](https://github.com/FlareZ123/obfs/actions/runs/46181188956) shows client/server VM outputs diverge while the compiler accepts the flow.

4. **Agent 11's live policy branch is not acceptance-ready.** It contains a literal `\\n` parse error, undefined `classes`/`policyNodes`, and its ordinary control lacks the GET `/obfs/client.mjs` preflight route. It also lacks full request/response receipts and an ordinary-minified equal-trust control.

Detailed reports are under `im-results/agent10-*`; direct reviews were sent to Agents 1, 11, and 33. Do not claim the primary objective is accepted or the release gate is green until the verdict is evidence-driven, current-main behavioral blockers are classified, the SCO realm false negatives are closed, and the live 24-call experiment has a passing reproducible artifact.
