# Deployment MIME proof obligations for opaque assets

**Agent 32, 22 November 2026. Status: engineering design and unresolved proof contract, not established protection.**

## Concrete counterexample and scope

The compiler's reviewed input inventories and extension-based HTML/XML/SVG scanners do not determine what an independent HTTP host will declare as a resource's `Content-Type`. The executable [PR #251 witness](../im-results/undeclared-xml-mime-extension-witness-2026-11-22.md) serves an opaque `index.blob` document as either `application/xhtml+xml` or `application/xml`, preserving and executing its original HTML-namespace inline source. The revised witness deliberately omits the optional XML declaration. The narrower [PR #255 candidate](https://github.com/FlareZ123/obfs/pull/255) uses a literal XML-declaration signature to audit a common subset of unknown extensions, including local SRI, but no byte prefix can establish future HTTP response metadata.

According to [XML 1.0](https://www.w3.org/TR/xml/), the XML declaration is optional. The [WHATWG HTML XML-syntax standard](https://html.spec.whatwg.org/multipage/xhtml.html) defines browser handling of HTML-namespace scripts in XML documents. Browser behavior must still be validated for specific document/HTTP deployment cases.

## Proposed contract

For each distributed public resource, record reviewed immutable bytes, the canonical published URL or route, the expected media type, and the exact content encoding. A strict mode would reject any public asset whose eventual HTTP representation cannot be assigned a reviewed type. An optional relaxed mode can preserve current compatibility, but must not imply that opaque assets were fully audited.

A proof checker should normalize media type tokens separately from parameters, and classify each typed resource by its **declared delivery semantics**:

- XML-family (`application/xml`, `text/xml`, `application/xhtml+xml`, `image/svg+xml`, and `+xml` subtypes): namespace-aware source, URL, stylesheet and SRI review, including documents without an XML declaration.
- HTML (`text/html`): parse5 HTML semantics, URL/base/template rules, source maps, inline handlers and SRI.
- JavaScript executable types: reject `sourceType:'asset'` unless a deliberate analyzed/transformed JavaScript publication path is selected.
- CSS (`text/css`): audit sourceMappingURL and imported inline/data stylesheets even when filename lacks `.css`.
- Other media types: explicit review policy and exact-byte output control, with no inference that unknown MIME is intrinsically inert.

Do not validate a manifest against only its own untrusted file bytes; the existing reviewed-asset SHA-256 trust model requires independent approval. Snapshot input file data and metadata only once before preflight to avoid getter/Buffer drift. A verified compiler inventory must be bound to the actual deployment representation: a build-time manifest alone does not force a third-party server or proxy to honor its contents.

## Mode-specific expectations

**SCO:** The obfuscator-controlled handler can own its route, bytes and content-type map, allowing direct HTTP checks of the reviewed output. External reverse proxies and alternate mounts are additional proof obligations.

**COO:** The static publisher must supply a deployment mapping and verify live response headers, URLs, redirects and exact bytes from the chosen host. The obfuscator has no channel to enforce that mapping after publication. This is a compatibility and publication admission boundary, not an anti-debugging guarantee.

**SNO:** Node executes the compiled entrypoint on a fully attacker-controlled server. Optional static public assets served by the surrounding application require their own deployment contract. The manifest cannot defend local execution integrity against the stipulated server owner.

## Minimum test matrix

1. Red/green for prolog-less XHTML-namespace inline script in `document.blob` advertised over real HTTP as `application/xml` and `application/xhtml+xml`.
2. Red/green for SRI-pinned neighboring JavaScript, proving byte preservation under the declared route/media mapping; include unrelated SRI positive transformation yield.
3. Source-parity positive controls for ordinary XML data, valid binary, UTF-8 with BOM, and non-HTML namespaces. Assert no accidental broad refusal.
4. Negative controls for unsupported/contradictory MIME declarations, missing resource coverage, mutable metadata getters and generated host route mismatches.
5. Source-pinned real Chromium and Node 22 Linux/Windows checks, with a benchmark clearly separating build-time scanning from emitted JavaScript runtime.

A strict runtime slowdown claim must be based on paired execution workloads, not compile-time preflight overhead. Existing full-control COO/SNO and authorized SCO oracle counterexamples still block the repository's strong-protection release independent of MIME admission.

**Decision:** Keep RELEASE-BLOCKED. Treat the signature guard as a bounded improvement and develop the deployment type contract only with measurable positive yield, end-to-end route checks and finite, independently reproducible evidence.
