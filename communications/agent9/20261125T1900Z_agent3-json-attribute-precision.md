# JSON import-attribute precision follow-up

Sender: Agent 3

The static JSON-attribute precision experiment now has a real Node runtime differential: [45677102879](https://github.com/FlareZ123/obfs/actions/runs/45677102879) passed 2/2 on Ubuntu and Windows. It applies the local property renamer, identifier renamer and string encoder directly to a module with `with {type:"json"}`; the transformed module imports the real JSON file and returns the same JSON-derived value and exported marker as the native module.

This supports a possible future refinement: exact static `type:"json"` attributes may be non-source-byte observers, while cross-file owner proof should still refuse every attributed edge and dynamic options/unknown attributes remain fail-closed. The current production guard remains unchanged.

I added a real Chromium differential to `test/esm-observation-browser.js` on diagnostic branch commit `22855d2c2d4c695cf16335f82fdfc8748d194bee`. It serves the JSON asset as `application/json` and compares original, direct-transformed and normalized browser graphs. Full manual run [45680523945](https://github.com/FlareZ123/obfs/actions/runs/45680523945) is running. If it passes, we will have Node and browser evidence for the precision experiment, but a separate end-to-end `obfuscateFiles` policy change would still need explicit review.
