'use strict';

const assert=require('node:assert/strict');
const {timingSafeEqual}=require('node:crypto');
const fs=require('node:fs/promises');
const http=require('node:http');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {createScoHandler,partitionScoAsyncModule,bindScoModuleExports}=require('../../src');
const {SEED}=require('./build-sample.cjs');

const ROOT=__dirname;

/**
 * The browser receives only a generated 2-function-looking facade. This
 * educational server uses HTTP Basic credentials, which must be protected by
 * TLS outside loopback; deploy real sessions and per-operation policy instead.
 *
 * @param {{host?:string,port?:number,user?:string,password?:string}} [options]
 * @returns {Promise<{server:http.Server,origin:string,partition:import('../../src/sco-partition').ScoModulePartition}>}
 */
async function startServer(options={}) {
  const host=options.host??'127.0.0.1';
  const port=options.port??0;
  const user=options.user??process.env.OBFS_SCO_DEMO_USER??'demo';
  const password=options.password??process.env.OBFS_SCO_DEMO_PASSWORD;
  if(typeof password!=='string'||password.length<12) {
    throw new TypeError('Set a demo password with at least 12 characters');
  }
  if(typeof user!=='string'||!user||user.includes(':')){
    throw new TypeError('Expected a simple HTTP Basic username');
  }
  if(!Number.isSafeInteger(port)||port<0||port>65535)throw new TypeError('Invalid port');
  const originalSource=await fs.readFile(path.join(ROOT,'before-private.mjs'),'utf8');
  const partition=partitionScoAsyncModule({
    path:'public.mjs',sourceType:'module',code:originalSource
  },{seed:SEED,serverOnlyInitialization:true});
  const committedProxy=await fs.readFile(path.join(ROOT,'after-public.mjs'),'utf8');
  assert.equal(partition.clientFile.code,committedProxy,
    'The committed after-public.mjs must match the real compiler output');
  const serverModule=await import(pathToFileURL(path.join(ROOT,'before-private.mjs')).href);
  const methods=bindScoModuleExports(partition,serverModule);
  const expected=Buffer.from('Basic '+Buffer.from(user+':'+password).toString('base64'));

  /** @param {http.IncomingMessage} request @returns {boolean} */
  function authorized(request) {
    const candidate=Buffer.from(request.headers.authorization??'','utf8');
    return candidate.length===expected.length && timingSafeEqual(candidate,expected);
  }

  const sco=createScoHandler([partition.clientFile],{
    remoteMethods:methods,
    authorizeRead:authorized,
    authorizeRpc:authorized,
    authorizeOperation:(request,method,args)=>authorized(request) &&
      method===partition.methodNames.derive && args.length===1 &&
      typeof args[0]==='string' && /^[0-9a-f]{32}$/.test(args[0])
  });
  const page=`<!doctype html>
<html lang="en"><meta charset="utf-8"><title>Server-private SCO sample</title>
<h1>Server-private SCO example</h1>
<p>The browser receives a generated RPC facade. The keyed implementation stays on this Node server.</p>
<pre id="out">Computing...</pre>
<script type="module">
import {derive} from '/obfs/public.mjs';
const output=document.getElementById('out');
try {output.textContent=await derive('0123456789abcdef0123456789abcdef');}
catch(error) {output.textContent='Authorized request failed: '+String(error);}
</script></html>`;

  /** @type {http.RequestListener} */
  const listener=(request,response)=>{
    if(request.method==='GET' && request.url==='/') {
      if(!authorized(request)) {
        response.writeHead(401,{
          'www-authenticate':'Basic realm="SCO demonstration"',
          'cache-control':'no-store'
        }).end();
        return;
      }
      response.writeHead(200,{
        'content-type':'text/html; charset=utf-8',
        'cache-control':'no-store'
      }).end(page);
      return;
    }
    sco(request,response);
  };
  const server=http.createServer(listener);
  /** @type {Promise<void>} */
  const ready=new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(port,host,()=>resolve());
  });
  await ready;
  const address=server.address();
  assert.ok(address && typeof address==='object');
  return {server,origin:'http://'+host+':'+address.port,partition};
}

if(require.main===module) {
  const rawPort=process.env.PORT;
  const port=rawPort===undefined?8080:Number(rawPort);
  startServer({port}).then(({origin})=>{
    console.log('SCO demo listening at '+origin+'/ (HTTP Basic credentials required)');
  }).catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={startServer};
