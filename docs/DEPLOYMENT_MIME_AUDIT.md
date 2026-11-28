# Optional reviewed HTTP publication audit

The Node API `verifyPublishedDeployment(origin, files, approvedResponses)`
checks a specific, already deployed public distribution against a separately
reviewed byte/MIME manifest. It is intended for staging verification before
activating or advertising the distribution. The publisher retains responsibility
for configuring the actual server and preventing subsequent unreviewed changes.
The staging origin must use HTTPS, except for loopback-only HTTP development
on localhost, 127.0.0.1 or [::1].

## Example

```js
const {obfuscateFiles,verifyPublishedDeployment}=require('./src');

const published=obfuscateFiles(inputs,{mode:'coo',seed:'reviewed-release'});
const approvedResponses=[
  {
    path:'client.js',
    sha256:'<64 lowercase hexadecimal SHA-256 digits approved separately>',
    contentType:'text/javascript; charset=utf-8'
  },
  {
    path:'data.bin',
    sha256:'<independently reviewed 64-digit SHA-256>',
    contentType:'application/octet-stream'
  }
];
await verifyPublishedDeployment(
  'https://static.example.com/',
  published.files,
  approvedResponses
);
```

The sample manifest values are placeholders. The release authority must
independently review exact paths, bytes, MIME and any potential embedded
source. Generating the approval array from the untrusted candidate inside
the same release step would defeat that independent trust boundary.

## Checks and strict refusals

- Every published file has an exact manifest record, SHA-256, MIME type and
  portable path. Case/Unicode/cross-platform aliases, duplicates, unused
  approvals and mismatched local bytes cause rejection before HTTP requests.
- The checker requests the percent-encoded path segments from the given
  HTTP(S) root, refuses redirects and non-200 responses, checks the normalized
  full `Content-Type` including parameters and requires the response
  `X-Content-Type-Options: nosniff` value. It refuses declared
  request-dependent representations through the `Vary` response header,
  except `Vary: Accept-Encoding` because decoded bytes are compared. It
  hashes the response after content decoding against the approved digest.
- Executable JavaScript, HTML, XML, SVG and CSS response bytes must be valid UTF-8; malformed input is refused instead of being decoded with replacement characters. Raw unpaired UTF-16 surrogates in supplied source strings are refused before lossy Buffer conversion. These are staging input-identity checks, not proof of full browser/server representation agreement.
- JavaScript MIME on an opaque `sourceType:'asset'` is refused. Published
  `script`, `module` and `commonjs` resources must have recognized
  JavaScript MIME. HTML, CSS and JavaScript sources must declare an explicit
  `charset=utf-8` header; an explicit non-UTF-8 charset on an executable
  XML/SVG response is refused. These restrictions bind the browser's
  interpretation to the UTF-8 source scanner's assumptions. They remain
  delivery-type admission rules, not a guarantee of browser compatibility.
- Executable HTML, XML, XHTML, SVG and CSS media types invoke the existing
  corresponding source-admission and source-map preflights, irrespective of
  their actual published file extension. XML types with unsupported
  special-purpose dialects and PDF are refused conservatively.
- A short allowlist of other media types is admissible with nosniff and
  matching reviewed bytes. Reviewers must still inspect inertly labeled
  bytes for unintended source disclosure, because opacity and MIME alone
  cannot establish confidentiality.

## Boundaries

This verifier is an opt-in Node staging tool. It does not change emitted
JavaScript runtime behavior and consequently adds no protected-program
runtime slowdown. Its HTTP requests and parsing are build/deployment
verification costs.

An HTTPS publisher, CDN, proxy, service worker or local attacker may change
content later; a completed verification cannot bind those future responses.
A host that varies output by script/document fetch headers, cookies,
User-Agent or source IP without advertising `Vary` can still defeat the
single staging request. The checker cannot prove browser and Node Fetch
request equivalence under arbitrary request-dependent server logic.
The checker does not establish the full browser dependency graph, future
redirect chains, any `eval` consumers, CSP, cross-origin CORS permissions,
Subresource Integrity correctness, or application-level authorization.
Transport-level security and independent manifest provenance are separate
requirements.

For SCO, the obfuscator-controlled server can own the HTTP MIME contract.
COO publishers must coordinate a stable external host. In the SNO threat
model, an attacker controlling the entire Node process/filesystem can alter
the running program despite any completed publication check.

The [WHATWG MIME Sniffing Standard](https://mimesniff.spec.whatwg.org/)
provides the JavaScript MIME essence list and XML/HTML classification.
The [Fetch Standard](https://fetch.spec.whatwg.org/) defines the nosniff
restriction for script/style requests. The
[W3C SRI specification](https://www.w3.org/TR/SRI/) covers the independent
resource integrity mechanism.

Reproduce the finite positive and negative controls in
`test/deployment-mime-audit.test.js`. See
`im-results/opaque-javascript-mime-source-witness-2026-11-22.md`
for the prior executable-MIME counterexample that motivated the admission
check. The primary release decision remains **RELEASE-BLOCKED**.
