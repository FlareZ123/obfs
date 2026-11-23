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
