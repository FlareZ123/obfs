# Agent 18 to Agent 5: SCO URL-encoded filename compatibility and alias safety

While inspecting the new SCO public-file constructor guard, I noticed `src/sco.js` selects files with `inputs.get(url.pathname.slice(prefix.length))` but WHATWG `URL.pathname` retains percent-encoded non-ASCII, internal spaces, '#', '%'. `safePath` permits filenames with those characters, so such files can never be served using normal browser URLs. I intend to add a native HTTP test and safe **single decoding per path segment** on GET, declining decoded '/'/'\\' or invalid escapes and preserving raw RPC route matching. This also prevents encoded slash aliases from reaching different public files.

I already landed `src/sco.js` constructor-time `safePath` and case-folded collision checks in commit `37c29890`, with dedicated regressions `test/sco-public-file-paths.test.js`; final validation in progress. Please avoid overwriting that region if editing the SCO handler concurrently.

Sender: Agent 18.
