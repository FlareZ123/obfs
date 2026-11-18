# Real-browser iframe text readers invalidate source-observer property rewriting

**Date:** 2026-11-18. **Agent:** 39. **Status:** two independent Chromium native/emitted red controls, compiler-only source-reader veto, provisional compatibility evidence.

## Threat and capability

A same-origin browser can load a JavaScript file with `text/plain` MIME in an iframe and expose its body text through the DOM. The [`Window.frames` property](https://developer.mozilla.org/en-US/docs/Web/API/Window/frames) yields direct child window objects; [same-origin documents are readable](https://developer.mozilla.org/en-US/docs/Web/API/HTMLIFrameElement/contentDocument). HTMLIFrameElement can also be created in the declared JavaScript itself, then accessed through `contentDocument` or `contentWindow`. These source-byte readers do **not** require `fetch`, `XMLHttpRequest` or CacheStorage calls inside the compiled ESM graph.

This matters for exact behavior: a module may compare an own private key's *spelling* in a publicly served source file without accessing the actual object. The base property renamer can safely rename that own key only if such observations have been ruled out under the program's deployment assumptions. The scanner covered several source fetch APIs but previously omitted the specific frame roots and frame member methods demonstrated below.

## Reproducible native/emitted real browser controls

Both cases use a real Node HTTP host, fresh native/emitted ES module paths, Chrome 157.0.8103.50, a pure `independent.mjs` leaf with `privateB:23`, and `entry.mjs` importing the leaf's primitive getter. The companion `index.html` is deliberately **outside** the declared `obfuscateFiles` input. A same-origin request with `?plain=1` returns the leaf's code with `Content-Type: text/plain`, so an iframe renders its text rather than executing the module.

Test code: [`sims/default-browser-frame-source-observer.js`](../sims/default-browser-frame-source-observer.js) and [`manual-source-island-indirect-loader.yml`](../.github/workflows/manual-source-island-indirect-loader.yml).

| Test | Native `privateB` visible | Emitted `privateB` visible | Returned primitive | Genuinely renamed own fields |
| --- | ---: | ---: | --- | ---: |
| Host-provided named iframe, unguarded | true | **false** | 23 in both | **1** |
| Module creates its own iframe, unguarded | true | **false** | 23 in both | **1** |

The host-provided test lets HTML create a named iframe and load `./independent.mjs?plain=1` before importing the ESM entry. The declared entry reads `frames["sourceView"]["doc"+"ument"].body.textContent`. The [pinned red Chromium Ubuntu/Windows test 44207957475](https://github.com/FlareZ123/obfs/actions/runs/44207957475) at **`eccdf0742e0600015317d098471e281ce8f81c26`** intentionally passed by confirming the native/emitted difference.

The second test removes the pre-created frame from HTML. Its **declared** ESM entry creates an iframe with `document.createElement("iframe")`, requests the sibling source as plain text, waits for the load event, and reads `frame.contentDocument.body.textContent`. An independent exact [Chromium red control at workflow 44208789099, attempt 2](https://github.com/FlareZ123/obfs/actions/runs/44208789099) at **`a7057778ccbeaa5bcd28b72f9973cb4e380f1898`** recorded `sourceView:"module-dom"`, `status:"source-observation-changed"`, native true, emitted false, value 23 in both, and one compiler-counted property rewrite. This is a stronger example because the actual frame creation and source observation are present inside the declared JavaScript input; it needs only the deployment's plain-text response mapping for the source URL.

The first attempt of that workflow failed due a harness-local loop variable temporal dead zone, fixed before the above green *adversarial* run. A later browser startup timeout affected an unrelated CacheStorage control in another workflow run and disappeared on retry; neither is evidence of a compiler guard failure.

## Conservative build-time correction and scope

The default `observesDistributedSource` scanner in [`src/ast.js`](../src/ast.js) now vetoes the named `frames`, `contentDocument` and `contentWindow` capabilities. The opt-in `proveSourceObserverIslands` graph proof in [`src/source-observer-islands.js`](../src/source-observer-islands.js) additionally refuses `frames` and the two frame member methods. These are **known source-reader capability checks**, implemented only during compilation; accepted emitted programs get no new runtime helper or verification cost.

The Node regression matrix checks the known direct, computed-literal and global object alias forms across **COO, SCO, and SNO**, plus opted-in island rejection of ambient frames and externally supplied DOM iframe handles. A pre-existing positive cross-file property-renaming test and an explicit selected ESM own-field rewrite positive prevent declaring success through globally disabling the useful pass.

The [focused Linux/Windows + real Chromium guarded run 44209213566](https://github.com/FlareZ123/obfs/actions/runs/44209213566) at exact **`60622c9cd8994f6c8d629a1934b46abf9c6a65b6`** passed and logged two separately guarded browser variants: `sourceView:"host-frame"` and `sourceView:"module-dom"`, both `status:"source-preserved"`, native/emitted `visible:true, value:23` and zero renamed source-visible fields. This run predated an additional narrow island member veto test, which must be independently validated before final integration.

## Limits

These checks improve semantic compatibility under the demonstrated browser source-reader syntax. They intentionally reduce property-transformation coverage for programs using named frame capabilities even if the host never reads source. They do not block arbitrary host-supplied aliases, same-origin HTML whose contents the compiler cannot see, other transports or debugger-inspected source. The [prior source-island host iframe counterexample](source-observer-island-host-iframe-boundary-2026-11-17.md) made the open-world boundary explicit. No finite ambient blacklist can supply a full guarantee for an adversary who controls the browser and distribution host.

This result is **not** a confidentiality, tamper-protection, domain-locking, anti-LLM, attacker-cost or general 2.5× win. The two browser applications now receive an intentional *zero* property transformation, because their source bytes are observably part of native behavior. Keep genuinely transformed positive controls alongside these negative examples and seek a deployment-level source-observation capability contract before expanding selected-property exemptions.
