# Selected SCO `Response.redirect` cross-realm admission witness

**Agent 18, 23 November 2026. Status: research-branch red/green; unmerged.**

## Behavior divergence

Selected SCO private functions originate in a browser ESM realm and execute on a trusted Node.js 22 server after partition. Browser `Response.redirect` parses its `url` against the current environment settings object's API base URL (WHATWG Fetch, https://fetch.spec.whatwg.org/). Node.js 22 does not supply a browser document base for relative redirect inputs.

Frozen selected source:

```js
export async function protectedOp() {
  return Response.redirect('/next', 302).headers.get('location');
}
export function visible() { return 7; }
```

On local Chromium **144.0.7559.96**, a document containing `<base href="https://example.test/app/">` and evaluating the same expression returned `https://example.test/next`. On local Node **v22.16.0**, it threw `TypeError: Failed to parse URL from /next`. The browser observation used a Playwright-driven headless Chromium page with `page.set_content` and `page.evaluate`; it did not use an authenticated SCO HTTP facade. The absolute returned URL and Node exception establish observable divergence for this environment pair.

## Compiler red, patch, and green

A test-only branch based on `main` at `03f827c66658bd8f8d30ec2a5b477b7b70bedfdc` added a regression to `test/sco-private-host-effect-closure.test.js`, checking selected-private direct functions, immediate and transitive private static ESM dependencies, plus an accepted inert own-property `Response` label.

- **Red at `57915881aed7c316cf6dacf3a0654e5b4b1769d7`:** [run 45277277533](https://github.com/FlareZ123/obfs/actions/runs/45277277533), Ubuntu and Windows Node22 graph job each **88 pass / 1 fail**, with `Missing expected exception` at the new direct selected-private refusal. Existing controls passed. This is an admission test; original/facade parity was shown separately with the local browser/Node probe, not with a generated HTTP session.
- **Patch at `4a839905b7889cdfde1b6973de26b354c26e154f`:** add `Response` to the source-only `usesUnprovedCrossRealmHostApi` set in `src/sco-selective-partition.js`. The guard applies to selected bodies and audited static dependencies, leaving an inert object key `Response` accepted.
- **Green at the exact patch SHA:** [run 45277509492](https://github.com/FlareZ123/obfs/actions/runs/45277509492), Ubuntu/Windows graph tests, generated private graph example and strict SCO graph JSDoc all passed.

Research branch: [`agent18/response-cross-realm-20261123`](https://github.com/FlareZ123/obfs/tree/agent18/response-cross-realm-20261123).

## Limits and integration disposition

This is a bounded source-admission safeguard, not a new obfuscation primitive. The patch changes emitted-code eligibility and adds **zero protected-runtime instructions**. It intentionally rejects some potentially safe first-class `Response` uses. It does not prove full browser/Node Web API equivalence, arbitrary host API provenance, a universal 2.5× ceiling, or confidentiality against controlled clients. A real authenticated Chromium/native/facade/source-coincident comparison and mainline integration tests remain separate acceptance obligations.

Do not merge competing compiler lineages. Agent 35 and SCO admission owners should review/adapt this isolated source change; keep the overall strong-security decision **RELEASE-BLOCKED**.


## Source-coincident live Chromium + authenticated SCO HTTP red/green

An independent browser path closed the missing end-to-end witness. The focused research test extends the established \`test/sco-webidl-errors-browser.test.js\` helper: create a localhost Node HTTP server, require an authorized cookie on read/RPC/operation, verify unauthenticated RPC gets HTTP 403, load the original module in real Chromium, load the generated SCO ESM facade in the same browser, and compare each selected function with its trusted Node implementation. The browser and server were **Chrome 157.0.8103.78** and **Node.js v22.23.4** on Ubuntu GitHub Actions.

- **Red**, exact source commit [\`4fbd320ba81951d3d5fd2977a8159a06e4925348\`](https://github.com/FlareZ123/obfs/commit/4fbd320ba81951d3d5fd2977a8159a06e4925348), [run 45278723892](https://github.com/FlareZ123/obfs/actions/runs/45278723892): \`try{return Response.redirect('/next',302).headers.get('location')}catch(e){return e.name+':'+e.message}\` was accepted. Original browser returned \`http://127.0.0.1:36921/next\`; generated authorized facade and private Node returned \`TypeError:Failed to parse URL from /next\`. The single new parity test failed as intended; existing valid \`Headers\`, \`URLSearchParams\` and native \`Math.imul\` controls passed in the **same browser job**. Windows focused job skipped browser-specific cases.
- **Green**, same code/test plus only the one-line \`Response\` host-name guard, exact source [\`6230ffe03e34ec74b5f36f60c9a45b28ef7809e1\`](https://github.com/FlareZ123/obfs/commit/6230ffe03e34ec74b5f36f60c9a45b28ef7809e1), [run 45278917817](https://github.com/FlareZ123/obfs/actions/runs/45278917817): emitted source now refuses the cross-realm \`Response\` use with \`Private SCO export or helper contains unproved cross-realm host API\`. All **eight Ubuntu focused tests passed**, including genuine nonzero protected work from valid \`URLSearchParams\`, \`Headers\`, and \`Math.imul\` authenticated RPCs; Windows focused job and both project/external strict JSDoc gates also passed. The full broad Node/browser test suite was skipped by this **focused** run, so comprehensive acceptance is still open.

The separate source-only/static graph red/green remains independently reproduced at \`57915881\` -> \`4a839905\`. This new live-browser branch is \`agent18/response-real-browser-20261123\` and demonstrates both the end-to-end divergence and the conservative admission repair. It provides no incremental confidentiality, environment-locking, or anti-tamper claim.

## Generalized lexical guard counterexample

Agent 35's generalized free-name guard donor at exact source \`6de66674807c2a06aabbd2c38e80d0677f7d808f\` recognizes \`Response\` as a valid ambient name but still accepts this migration. The test-only [two-OS run 45278153484](https://github.com/FlareZ123/obfs/actions/runs/45278153484) at \`cbc5c43a0bc7babfb65e4aacea3c9fb28279552f\` failed the same expected refusal on both platforms. Three separate existing graph cases also failed under the generalized candidate and remain independently unresolved. Adding the one-line host guard atop that donor in \`agent18/response-general-hostgate-peer-20261123\` at \`1bd2a7f711a2700595acfef6beef095d65b126bb\` passed the single focused host-effects test with strict project/external JSDoc on both platforms in [run 45278428700](https://github.com/FlareZ123/obfs/actions/runs/45278428700). This focused result does not clear the separate three broad graph failures.

The compiler must distinguish **a name proven to exist** from **an API proven semantically equivalent across host realms**. Agent 35 has been asked to incorporate the new counterexample into the single SCO admission candidate. Research branches remain unmerged.


## Generalized free-name candidate: exact graph acceptance repair on research branch

The independently identified **three unrelated graph failures** in Agent 35's unmerged generalized free-name donor \`6de66674807c2a06aabbd2c38e80d0677f7d808f\` had two separable causes:

1. \`firstUnprovedUnqualifiedReference\` treated \`ExportSpecifier.local\` in an \`export {name} from './module.mjs'\` clause as an unqualified lexical reference in the *current* module. In this syntax it names a binding in the **source** module, so the candidate erroneously refused a valid re-export. This affected transitive static graph and literal-owned browser-spelled re-export positive controls. The research patch excludes only \`ExportSpecifier.local\` directly enclosed by a sourced \`ExportNamedDeclaration\`. Bare \`export {name}\` without a source stays under the ordinary local binding proof.
2. The generic unqualified-free-reference diagnostic ran before the existing explicit runtime loader refusal. \`require('./deep/secret.mjs')\` was still rejected, but with a new generic message instead of the specific loader error demanded by the existing negative regression. The patch moves that generic scan **after the explicit unproved loader checks**, retaining both refusals and precise error precedence. It does not whitelist \`require\` or relax the loader policy.

Added these two changes atop the existing \`Response\` host-name patch and regression on branch \`agent18/response-general-hostgate-peer-20261123\`. Exact candidate [\`983dcc220c673e6e54f1505c47843d1abdbb1463\`](https://github.com/FlareZ123/obfs/commit/983dcc220c673e6e54f1505c47843d1abdbb1463) passed [two-platform SCO graph workflow 45279604632](https://github.com/FlareZ123/obfs/actions/runs/45279604632): **89/89 graph tests per OS**, generated graph example check, and strict SCO graph JSDoc. Baseline donor + Response test at \`cbc5c43\` had **85/89** passes and four failures on both OS in [45278153484](https://github.com/FlareZ123/obfs/actions/runs/45278153484). These outcomes describe the tested branch only and do not establish a current-main comprehensive gate, runtime cost bound, or resistance gain.

This is a candidate-integration **donor** for Agent 35, not a competing merged compiler lineage. The production change spans local semantic admission (compile time) only.
