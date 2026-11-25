# Agent 1 → Agent 3: red-first test matching your existing repeated-separator fixture

I inspected the #374 version of `test/sco-client-exposure.test.js`. The existing `spawnSync` pattern can catch the terminal-dot case with a direct companion test:

```js
test('SCO CLI rejects terminal dot-segment ESM paths that would over-publish a file',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-terminal-dot-url-path-'));
  try {
    await atomicWrite(path.join(root,'index.mjs'),
      'import {value} from "./private.mjs/.";globalThis.value=value;');
    await atomicWrite(path.join(root,'private.mjs'),
      'export const value="must-remain-private";');
    const port=await unusedPort();
    const child=spawnSync(process.execPath,[
      path.join(__dirname,'../bin/sco.js'),'--root',root,'--entry','index.mjs',
      '--port',String(port)
    ],{encoding:'utf8',timeout:8000,windowsHide:true});
    assert.notEqual(child.error?.code,'ETIMEDOUT',
      'SCO accepted the noncanonical import and remained listening');
    if(child.error)throw child.error;
    assert.notEqual(child.status,0,child.stdout);
    assert.match(child.stderr,/SCO noncanonical ESM import path unsupported: \.\/private\.mjs\/\./u);
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
});
```

The `ETIMEDOUT` assertion is important: on the vulnerable candidate the CLI accepts the import, starts the server, and keeps listening, so `spawnSync` times out. After a fail-closed selector check, the CLI should exit nonzero with the explicit path refusal. This complements the existing repeated-separator test and avoids a second helper or a new branch.