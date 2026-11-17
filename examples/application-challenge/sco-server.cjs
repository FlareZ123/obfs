'use strict';

const http=require('node:http');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {randomBytes,timingSafeEqual}=require('node:crypto');
const {createScoHandler,bindScoGraphExports}=require('../../src');
const {build,EXPOSED,ROOT}=require('./sco-build.cjs');

/** @param {number} value @returns {number} */
function externalValue(value){
  let x=(value^0xa5a5a5a5)>>>0;
  x=Math.imul(x^(x>>>16),0x45d9f3b)>>>0;
  return (x^(x>>>16))>>>0;
}

/**
 * Trusted-server deployment with explicit read/RPC/argument authorization.
 * The server loads the five original private ESM modules through its exposed
 * async wrapper. Only the generated facade is published.
 * @param {{host?:string,port?:number,token?:string}} [options]
 * @returns {Promise<{
 *  server:http.Server,origin:string,token:string,
 *  graph:import('../../src/sco-graph').ScoGraphPartition,
 *  native:(seed:number,count:number)=>Promise<unknown>
 * }>}
 */
async function startServer(options={}){
  const host=options.host??'127.0.0.1';
  const port=options.port??0;
  const token=options.token??randomBytes(24).toString('hex');
  if(!Number.isSafeInteger(port)||port<0||port>65535)
    throw new TypeError('Invalid port');
  if(typeof token!=='string'||token.length<12)
    throw new TypeError('Demo bearer token is too short');
  const graph=await build();
  // The trusted Node fixture deliberately supplies a minimal browser-like
  // host capability rather than a complete DOM Window.
  globalThis.window=/** @type {Window & typeof globalThis} */ (
    /** @type {unknown} */ ({externalValue}));
  const source=await import(pathToFileURL(path.join(ROOT,EXPOSED)).href);
  const registry=bindScoGraphExports(graph,{[EXPOSED]:source});
  const expected=Buffer.from(token,'utf8');
  /** @param {http.IncomingMessage} request @returns {boolean} */
  function authorize(request){
    const received=Buffer.from(String(request.headers['x-demo-token']??''),'utf8');
    return received.length===expected.length&&timingSafeEqual(received,expected);
  }
  const allowedMethod=new Set(Object.keys(registry));
  const handler=createScoHandler(graph.clientFiles,{
    publicPaths:[EXPOSED],
    remoteMethods:registry,
    authorizeRead:authorize,
    authorizeRpc:authorize,
    authorizeOperation:(request,method,args)=>authorize(request)&&
      allowedMethod.has(method)&&args.length===2&&
      typeof args[0]==='number'&&typeof args[1]==='number'&&
      Number.isInteger(args[0])&&args[0]>=0&&args[0]<=0xffffffff&&
      Number.isInteger(args[1])&&args[1]>=0&&args[1]<=150000
  });
  const server=http.createServer(handler);
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(port,host,()=>resolve(undefined));
  });
  const address=server.address();
  if(!address||typeof address==='string')throw Error('Missing TCP address');
  return {server,origin:'http://'+host+':'+address.port,token,graph,
    native:source.evaluateRemote};
}
if(require.main===module){
  startServer({port:Number(process.env.PORT??8080)})
    .then(x=>console.log('SCO application test server listening '+x.origin))
    .catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={startServer,externalValue};
