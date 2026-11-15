'use strict';

const assert=require('node:assert/strict');
const {execFile}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {promisify}=require('node:util');
const {startServer}=require('../examples/sco-private/server.cjs');

/**
 * Exercise the public ESM facade in an actual Chromium tab loaded through
 * the authenticated localhost example server. The private HMAC implementation
 * and key remain outside the browser.
 *
 * @returns {Promise<void>}
 */
async function main() {
  const previous=process.env.OBFS_SCO_DEMO_KEY;
  process.env.OBFS_SCO_DEMO_KEY=randomBytes(32).toString('hex');
  const password='not-a-production-secret-browser-fixture';
  /** @type {Awaited<ReturnType<typeof startServer>>|null} */
  let hosted=null;
  try {
    hosted=await startServer({port:0,password});
    const url=new URL(hosted.origin+'/');
    url.username='demo';
    url.password=password;
    const browser=process.env.CHROMIUM_BIN??'chromium';
    const {stdout}=await promisify(execFile)(browser,[
      '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--virtual-time-budget=8000','--dump-dom',url.href
    ],{timeout:45000,maxBuffer:4*1024*1024,encoding:'utf8'});
    const observed=stdout.match(/<pre id="out">([0-9a-f]{64})<\/pre>/u)?.[1];
    assert.ok(observed,'Chromium did not complete authenticated RPC ESM: '+stdout.slice(0,1000));
    const native=/** @type {{derive:(input:string)=>Promise<string>}} */(
      await import(pathToFileURL(path.join(__dirname,'..','examples','sco-private','before-private.mjs')).href)
    );
    const expected=await native.derive('0123456789abcdef0123456789abcdef');
    assert.equal(observed,expected);
    process.stdout.write('Chromium SCO public ESM matched trusted private reference (64 hex digits)\n');
  }finally {
    if(hosted) {
      const activeServer=hosted.server;
      /** @type {Promise<void>} */
      const closed=new Promise((resolve,reject)=>
        activeServer.close(error=>error?reject(error):resolve()));
      await closed;
    }
    if(previous===undefined)delete process.env.OBFS_SCO_DEMO_KEY;
    else process.env.OBFS_SCO_DEMO_KEY=previous;
  }
}

if(require.main===module) {
  main().catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={main};
