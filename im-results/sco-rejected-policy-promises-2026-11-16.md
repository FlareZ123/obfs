# SCO synchronous-policy Promise rejection: process-level negative control

**Status:** bounded server-availability regression, not a deobfuscation-security result.

## Issue

`preflightScoBatchState` correctly refuses Promise-valued initial state, authorization and transitions, but previously discarded the rejected Promise without attaching a rejection handler. A trusted integrator can mistakenly use an `async` callback in this explicitly synchronous API. On Node.js 22's default `throw` unhandled-rejection behavior, a policy Promise that rejects after the helper's synchronous TypeError can terminate the entire trusted server process. A denial response is insufficient if the process then exits.

Node.js documents the `--unhandled-rejections=strict` process-failure behavior and the requirement for rejection handlers: [Node CLI](https://nodejs.org/api/cli.html#--unhandled-rejectionsmode), [Node Process](https://nodejs.org/api/process.html#event-unhandledrejection).

## Reproduction

- Immutable **red** source `8350ed6bc9df92a6a351ad689c21006728af099e`, [Ubuntu and Windows targeted gate 43981582296](https://github.com/FlareZ123/obfs/actions/runs/43981582296): both target jobs failed in the newly added process-level `test/sco-batch-state-async-transition.test.js` regression. Each job reported one failed test. Only the new test changed relative to this branch base.
- Immutable first **green** executable source `1ae5bf3de7e940c84fbe51d1b407b65791955553`, [Ubuntu and Windows targeted gate 43981638381](https://github.com/FlareZ123/obfs/actions/runs/43981638381): both jobs succeeded. Each passed targeted SCO behavior tests, strict JSDoc, external static checking, SCO attack demonstrations, and (Ubuntu) Chromium.
- The test runs child Node with `--unhandled-rejections=strict`, feeds all three Promise rejection sites (also from a foreign VM realm and with masked `then` fields) into the synchronous helper and asserts that synchronous denial is followed by a normally surviving process.
- The final native and cross-VM Promise controls passed an additional [Linux/Windows targeted gate 43982688408](https://github.com/FlareZ123/obfs/actions/runs/43982688408) at immutable `4da6626b7e8c125eaadd0cb82049e164a916ceee`. It included strict JSDoc, representative SCO suites, Ubuntu real Chromium, and malformed-policy child-process cases. A native Promise whose `then` property is replaced with a non-function is still rejected; the prior thenable-only guard could miss this case.
- A separate newly added real-HTTP child test sends two invalid authenticated batches whose transition policy returns a rejecting Promise, checks generic HTTP 500, zero private `read` effects and continued Node process survival. The native HTTP extension passed a separate [Ubuntu/Windows targeted gate 43982059187](https://github.com/FlareZ123/obfs/actions/runs/43982059187) at exact `336bf1d2d828159cd5c7f8aa72d22ad070c13d32`.

## Repair

`src/rpc-batch-policy.js` observes rejections on **native Promise values, including cross-realm VM Promises** when it refuses them. The native Promise classifier also refuses objects whose own `then` member masks the inherited method. For genuinely synchronous policy values the path is unchanged. A rejected async policy still produces a synchronous TypeError and the SCO HTTP adapter still reports its generic failure, with protected operations skipped. The observed Promise's rejection is consumed to avoid a later process-level crash.

## Limits

- This is integration-misconfiguration availability hygiene. Arbitrary non-Promise thenables remain rejected without invoking their `then` method; proxy-wrapped Promises and custom thenables are not promised the same rejection-consumption behavior.
- The helper cannot cancel side effects already started by an erroneous async authorization or transition. Correct policy callbacks remain pure and synchronous, with application isolation across preflight and execution.
- No source reconstruction, dynamic attacker-extraction, anti-cloning or 2.5× runtime improvement has been demonstrated by this patch. The successful test covers refusal cases; the cost of policy Promise handling on success paths remains a separate performance question.
