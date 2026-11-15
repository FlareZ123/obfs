# Indirect HTML/SVG asset disclosure checks (Agent 30, 2026-11-15)

## Scope and motivation

The supplied static-asset guard initially scanned literal HTML `script` elements, event handlers, `iframe srcdoc`, recognized URL-bearing attributes, and SVG `script`, events, URLs and animations. Two further declarative HTML mechanisms fell outside that scan:

1. HTML `<meta http-equiv="refresh" content="0; URL=data:text/html,...">` stores the browser navigation target in `content`, a property missing from the URL attribute list.
2. SVG `<foreignObject>` can embed XHTML elements. An XHTML `iframe` can carry inline markup in `srcdoc`, and an XHTML `meta` can carry a refresh URL in `content`. The SVG scanner previously checked neither property.

These are source-publishing vulnerabilities when executable source is embedded in otherwise opaque copied assets. The evaluated attacker simply reads the distributed asset. Execution of a particular redirect or iframe in a live browser was **not** part of this experiment. The HTML Standard defines a meta refresh navigation and XHTML `srcdoc` is defined as inline frame markup. See [WHATWG HTML metadata](https://html.spec.whatwg.org/multipage/semantics.html#attr-meta-http-equiv-refresh), [MDN srcdoc](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe#srcdoc), and [MDN SVG foreignObject](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/foreignObject).

## Reproduced paired attack

Source revision: **`b4fdf5c414fd728e1203f993891799633c0e9f60`**, on branch `agent30-embedded-asset-audit` when validated.

The manually dispatched [Linux and Windows paired asset attack, run 43717357748](https://github.com/FlareZ123/obfs/actions/runs/43717357748), checks out the unchanged historical baseline **`5c24cc02066fc27d29fc95d80ea89b005ca9071e`** and the protected candidate separately. The executable simulator is [`sims/asset-disclosure-attack.js`](../sims/asset-disclosure-attack.js). Eight sampled assets contain a known source canary: ordinary source-map sidecar, inline HTML, opaque JSX copy, inline SVG, disguised source-map JSON, HTML meta-refresh URL, SVG XHTML iframe srcdoc, and SVG XHTML meta-refresh URL.

| Mode | Historical baseline disclosed / 8 | Protected build rejected / 8 | Safe HTML byte-identical | Executable output unchanged by safe HTML |
|---|---:|---:|---|---|
| COO | 8 | 8 | Yes | Yes |
| SCO | 8 | 8 | Yes | Yes |
| SNO | 8 | 8 | Yes | Yes |

In a separate actual HTTP GET to the programmatic SCO handler, all seven tested copied assets yielded HTTP 200 and the canary from the historical baseline. The protected handler refused publication. The eighth opaque JSX case was tested through output generation, not SCO HTTP.

The [Linux/Windows focused transformation suite, run 43717243798](https://github.com/FlareZ123/obfs/actions/runs/43717243798), passed on the earlier implementation-and-tests commit **`0c558dbe69d9c47d2e6898eec7209e42cd6adfc6`**. It exercises both rejection paths and compatibility of safe external navigation, benign SVG geometry and ordinary external script references. It also includes strict JSDoc checking.

## Change

- `src/html-assets.js`: identifies refresh directives only when their `http-equiv` value is `refresh` and the parsed URL starts with a recognized executable scheme or executable `data:` media type. The helper is shared with the SVG scanner.
- `src/svg-assets.js`: refuses `srcdoc` attributes and executable XHTML meta refresh URLs, including in `foreignObject` content.
- `test/html-asset-disclosure.test.js` and `test/svg-asset-disclosure.test.js`: add positive refusal controls and benign URL-preservation controls for all modes and the SCO handler.
- `docs/SECURITY.md`: documents the new bounded preflight.

## Inference limits and performance

The historical baseline is intentionally much older than the immediate pre-patch parent: the paired CI proves full baseline-to-protected refusal, while inspection of the intervening pre-patch scanners identifies the omitted attributes. It does **not** measure a browser script actually executing after a meta redirect or through SVG foreign content. It also does not establish general source secrecy: arbitrary CSS, JSON, HTML text, and other embedded data could still disclose original source bytes.

These are construction-time asset checks, not runtime hot-path transforms. The tiny cold-build durations printed by the simulator are diagnostic only and were not used to infer the project's 2.5× runtime bound. No security improvement is claimed for already-distributed JavaScript or attacker-controlled Node runtimes.
