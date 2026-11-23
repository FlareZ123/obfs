# Node 22 / Chromium WebSocket function-source observation: red/green proof

**Agent 41, 23 November 2026. Status: intermediate, bounded compatibility fix, not a new obfuscation-security theorem.**

## Witness and boundary

The actual native `WebSocket.prototype.send` coerces a submitted JavaScript function to its exact source string and sends those bytes on the socket. A COO compiler that changes a literal inside the function, even while preserving returned values, can change observable behavior if its source-observer analysis does not recognize that sink. This test does not mock `WebSocket` or rely solely on `Function.prototype.toString` in user code: it checks actual masked WebSocket text frames at a local HTTP Upgrade server.

Source fixture:

```js
const socket=new WebSocket(globalThis.__url);
function protocolSensitive(){return "value-723";}
socket.addEventListener('open',()=>{
  socket.send(protocolSensitive);
  socket.close();
});
```

With explicitly enabled COO `strings:true` plus identifier mangling, unpatched compiler output sent source containing `_obdb5512f8237[0]` rather than the literal `"value-723"` even though the function's ordinary result is unchanged. This violates 1:1 source-observer semantics. Constructor/receiver aliases, extracted `.send` invoked via `.call`, bound dispatch, `.apply` and `Reflect.apply` need source provenance tracking; a primitive literal `socket.send('safe-literal-893')` should remain transformable.

## Source-pinned results

- **RED direct**, exact branch source `f0f86e2efbdba04f3e4e37b326a8e29bb14fb574`, [Actions 45238797958](https://github.com/FlareZ123/obfs/actions/runs/45238797958): Ubuntu and Windows Node 22 real-WebSocket differential failed, 49-byte native frame vs 55-byte emitted function-source frame.
- **RED detached**, first receiver-only guard plus alias test at `8a6d2f2ebb31888f7ff078ff3d5c3a399ada7eec`, [Actions 45240127672](https://github.com/FlareZ123/obfs/actions/runs/45240127672): both OS still failed `sender.call(socket,protocolSensitive)` even while direct and constructor-alias cases passed. The same run confirmed primitive-string positive yield (`metrics.literals=2`) with exact payload parity.
- **GREEN Node22 extended**, source `6792b2c8014f2973be6979cc17e859753af558e0`, [Actions 45240583336](https://github.com/FlareZ123/obfs/actions/runs/45240583336): both OS pass focused manual source-observer gate, including direct, ctor+instance alias, detached `.call`, bound, `.apply`, `Reflect.apply` and a safe primitive-string positive-yield control. Other existing source-observation regressions and JSDoc pass.
- **GREEN real Chromium follow-up**, source `f987e17d1e5eb102fa1f7266537c98581105a310`, [Actions 45241521192](https://github.com/FlareZ123/obfs/actions/runs/45241521192): Ubuntu actual headless Chromium 49-byte native vs emitted WebSocket text frames match; both OS focused gate green. The browser harness performs actual HTTP navigation and WebSocket handshake, then checks the decoded masked payload; it does not emulate browser WebSocket conversion.

## Proposal and limits

[Draft donor PR #341](https://github.com/FlareZ123/obfs/pull/341) adds a bounded `observesFunctionSource` provenance guard for proven native WebSocket receiver/constructor aliases, detached and bound send methods, and reflected calls. The only production mutation is in `src/ast.js`; harnesses live at `sims/websocket-source-coercion-probe.js` and `test/websocket-source-coercion-browser.js`, wired to the **existing manual-only** focused implicit-source workflow. No new per-commit CI is introduced.

The guard prefers safety, potentially declining function/string transforms if a payload is not proven primitive. It must not be interpreted as increased static reconstruction resistance or complete browser API coverage. No global full-suite current-main acceptance, hostile-runtime integrity guarantee, or universal 2.5× runtime claim follows. Agent 3's source-observer intake is the integration authority; this donor is source-pinned evidence awaiting candidate selection. The overall three-mode release decision is still **RELEASE-BLOCKED**.

### Follow-up: stored socket property and shared reference

A new native source-paired fixture stores the socket in `const owner={socket:new WebSocket(url)}` and later calls `owner.socket.send(fn)`. The first native-receiver/alias patch still changed a 49-byte function source into a 55-byte decoder reference. [Red run 45242030400](https://github.com/FlareZ123/obfs/actions/runs/45242030400), exact source `44fef48f5ff92a24b20246e30a7c3c1cd0d367d5`, reproduced this failure on **both OS**. The fix reuses existing `addWebObjectExpression`/`addWebObjectKey` may-flow inventory to track static properties carrying actual WebSocket instances. It propagates through record aliases, object destructuring, and late assignments; unresolved computed object names are still outside this bounded proof.

[Patched focused run 45242433188](https://github.com/FlareZ123/obfs/actions/runs/45242433188), source `88af1bac2f2cefca68543aaf18fb2872c05ef6b1`: **both Ubuntu and Windows green** for 11 real native Node22 WebSocket framed-data variants (direct, constructor/receiver alias, detached, bound, Reflect.apply, apply, record, record alias, destructured record, late assignment, and the positive primitive string transform) plus the Ubuntu real Chromium WebSocket native/emitted frame parity and strict checks. This supersedes the narrower source pin as the current draft donor PR #341's focused green receipt; still **not** comprehensive current-main integration or a general browser API proof.
