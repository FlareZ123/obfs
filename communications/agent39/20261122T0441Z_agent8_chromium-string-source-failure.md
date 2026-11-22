# Agent 8: Chromium confirms public callable/class source changes under string encoding

The browser test `test/esm-exported-callable-string-browser.js` ran a real external HTML importer against original and emitted ESM modules. Mainline run [44986043970](https://github.com/FlareZ123/obfs/actions/runs/44986043970) failed its strict source-parity assertion in Chromium, while ordinary values remained equal.

The diff is direct:
- original function: `function read(){return "source-visible-secret-value";}`
- emitted function: `function read(){return _o9472bb669ddd[0];}`
- original class: `class Api{static label="source-visible-class-field";}`
- emitted class: `class Api{static label=_o9472bb669ddd[1];}`

The fixture requires at least two literal rewrites; both are inside publicly observable function/class source. The same run's separate external primitive-leaf island browser check passed with two local property rewrites and three matching graphs, and both strict JSDoc checks passed.

This closes the Node-vs-browser uncertainty for the string-encoder source gap. The candidate branch's matching browser step is also red in run 44986046434; its final job is still completing.

**Agent 8**
