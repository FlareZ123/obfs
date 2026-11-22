# Request-context-dependent MIME defeats a one-shot staging audit

**Agent 32, 22 November 2026. Classification: independently browser-observed negative evidence, not a compiler authorization improvement.**

## Hypothesis and precise threat boundary

A static publisher has reviewed two local responses: `index.html` with a
non-executing external script reference and `payload.blob` with a byte-exact
inert `application/octet-stream` body. A Node staging verifier, operating
on independently approved local bytes and a normalized MIME/URL manifest,
requests both URLs. If an adversarial server varies the **same path** by
`Sec-Fetch-Dest`, it can return the inert audited body to the generic
Node request while serving `text/javascript` and different executable
bytes to a browser script request. The server may omit `Vary`.

Under the COO threat model, an independently hosted publisher is a separate
trust boundary. A one-time observation of one HTTP request context cannot
establish what a potentially hostile or later-compromised host supplies
to every browser context or at later times. The staging audit explicitly
limits its claims to trusted, stable publishing; this witness tests why
the limitation matters.

## Source-pinned local HTTP experiment

The self-contained script
`sims/deployment-request-context-mime-witness.js` publishes two approved
assets through a real local HTTP server. It calls
`verifyPublishedDeployment(origin, files, approvedResponses)` against
the immutable reviewed bytes, SHA-256 and HTTP MIME records, including
`nosniff`. The controlled server intentionally omits `Vary` and selects
its `payload.blob` representation as follows:

| Request context | Response MIME | Response content |
| --- | --- | --- |
| Generic Node Fetch | `application/octet-stream` | Approved inert bytes |
| Chromium `<script src="./payload.blob">` | `text/javascript; charset=utf-8` | Unapproved executable JavaScript |

Both responses have `X-Content-Type-Options: nosniff`. The generic Node
staging verifier returns `{verified:2,sourceFiles:0,assets:2}`, while
Chromium receives a **different** MIME and source at the same pathname,
executes it, and sets the page DOM marker.

With an honest `Vary: Sec-Fetch-Dest` header added to the same server
response, the current audit rejects the route before treating a single
representation as a stable public resource.

The targeted real-Chromium test in
[workflow 44979803215](https://github.com/FlareZ123/obfs/actions/runs/44979803215)
passed at exact source `2e4f99d5a1946fad26e2e3b0d4006c48c5406348`.
The machine-readable observation was:

```json
{"nodeStagingAccepted":true,"unreviewedBrowserScriptExecuted":true,"browserDestinationObserved":true,"genericFetchDestinationObserved":true,"varyHeaderCorrectlyRefused":true,"scope":"dishonest context-varying HTTP server"}
```

The entire manual browser workflow was still executing other checks when
this note was first recorded; verify its final conclusion before
promotion or merge.

## Normative basis and limitations

[RFC 9110 §12.5.5](https://www.rfc-editor.org/rfc/rfc9110.html#name-vary)
describes `Vary` and explicitly permits some origin servers to elide it
when cache reuse constraints make the variance less relevant. The
[W3C Fetch Metadata specification](https://www.w3.org/TR/fetch-metadata/)
defines `Sec-Fetch-Dest`, and the local Chromium trace confirms that
script destinations advertise `script` here. HTTP headers provide
useful deployment metadata but are not independently authenticated
proofs of universal response immutability.

This does **not** show an exploit against a trusted immutable static host.
It is a counterexample to extending a generic Node staging response
check into a guarantee about all browser-initiated contexts on an
untrusted or dishonest host. The current explicit `Vary` refusal
addresses only advertised variants, and even compression-only
`Vary: Accept-Encoding` remains an assumption about equivalent decoded
resources across codings. Future conditional responses are outside the
scope of a single preflight.

The matching bounded interface and threat-limit documentation are in
`docs/DEPLOYMENT_MIME_AUDIT.md` and
`workplace/deployment-mime-proof-obligations-2026-11-22.md`.
The global strong-protection objective remains **RELEASE-BLOCKED**.
