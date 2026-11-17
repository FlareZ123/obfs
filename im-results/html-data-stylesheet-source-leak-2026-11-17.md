# HTML data-stylesheet source-map disclosure and narrow publication refusal

**Agent 20, 17 November 2026. Intermediate security-engineering result.**
Not an established strong-obfuscation result.

## Threat and independent extraction

A protected HTML asset can contain a `<link rel="stylesheet">` whose
`href` is a `data:text/css;base64,...` URL. The CSS payload can itself
contain a source-map comment with another `data:application/json;base64,...`
URL, whose `sourcesContent` contains the unmodified original JavaScript.
These original bytes are part of the delivered HTML even if the linked style
is not used at runtime. A source-only attacker needs no runtime access,
compiler seed, or unauthorized server read to extract them.

The prior `src/html-assets.js` inspected inline `<style>` blocks and
immediately executable HTML URL schemes, while ordinary `.css` files used
`hasCssSourceMapDirective`. It did not recursively validate the bytes
inside `data:text/css` stylesheet links. This is a preflight publication
contract gap, separate from ordinary deobfuscation strength.

The independent attacker is
[`sims/html-data-stylesheet-attack.js`](../sims/html-data-stylesheet-attack.js).
It decodes *delivered HTML* through the CSS and source-map layers and asserts
that `sourcesContent[0]` exactly matches the original module. It compares
the frozen immediately prior mainline
[`2f980e8103d4b69181e89924d9c4c790f75699ff`](https://github.com/FlareZ123/obfs/commit/2f980e8103d4b69181e89924d9c4c790f75699ff)
against the patched compiler, for each COO/SCO/SNO compiler output and a
real local HTTP GET against the previous SCO publication handler.

## Implemented, intentionally narrow refusal

[`src/html-assets.js`](../src/html-assets.js) now refuses any
`data:` URL used by an HTML `link` element whose `rel` token list
contains `stylesheet`. This deliberate fail-closed choice avoids
pretending to verify arbitrarily encoded nested CSS and associated source
maps. The HTML parser has already normalized attribute names and character
references, including `&#x64;ata:`.

[`test/html-data-stylesheet-disclosure.test.js`](../test/html-data-stylesheet-disclosure.test.js)
covers canonical, alternate and template-nested stylesheet links,
character-reference normalization, three obfuscation modes, direct SCO
publication refusal, ordinary linked external CSS and byte-preserved raster
image data URLs. The existing
[`manual-asset-attack.yml`](../.github/workflows/manual-asset-attack.yml)
runs the paired extraction and focused tests with strict JSDoc on Linux and
Windows.

## Validation and performance status

- Initial implementation commit:
  [`4d4a95cbd8fc3b24337fc1e16869afc22c82f515`](https://github.com/FlareZ123/obfs/commit/4d4a95cbd8fc3b24337fc1e16869afc22c82f515).
- Exact targeted cross-platform run:
  [GitHub Actions 44049862335](https://github.com/FlareZ123/obfs/actions/runs/44049862335)
  at `bf1835783c29b3def9162a1bc4abab73749a69fc`.
  **At report creation the run was queued.** Treat paired red/green and
  JSDoc results as unverified until both jobs complete successfully.
- The new check runs during build or SCO handler creation and does not add
  code to successfully published JavaScript. Its overhead cannot change the
  hot runtime of an unchanged accepted application. No new complete-session
  2.5× measurement is claimed. Build-time rejection is a compatibility
  change for formerly accepted inline-data stylesheets.

## Residual attack surface

This refuses one recognized nested stylesheet route. It does not inspect
all possible source-text encodings or recursively follow CSS `@import`,
XML stylesheet processing instructions, arbitrary opaque asset blobs, remote
stylesheet URLs, or runtime-generated data URLs. Arbitrary client-visible
source bytes and source maps remain readable by a full-control adversary.
SNO integrity checks remain owner-bypassable, and authenticated SCO online
relaying remains possible. Preserve the independent extraction witness as
a narrowly falsifiable preflight case; do not promote this document to
`results/` or count it as improved hostile-runtime secrecy.
