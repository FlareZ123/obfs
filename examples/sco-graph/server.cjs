'use strict';

const http=require('node:http');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {randomBytes,timingSafeEqual}=require('node:crypto');
const {createScoGraphHandler}=require('../../src');
const {build}=require('./build.cjs');

/**
 * Runnable localhost demonstration of an authenticated, private ESM graph.
 * Only the two generated public facades enter the SCO publish list.
 * The private key and all original implementation modules stay server-side.
 * The caller must configure a 256-bit hex key in OBFS_SCO_GRAPH_KEY.
 *
 * @param {{host?:string,port?:number,token?:string}} [options]
 * @returns {Promise<{server:http.Server,origin:string,graph:import('../../src/sco-graph').ScoGraphPartition,token:string}>}
 */
async function startServer(options={}){
  const host=options.host??'127.0.0.1';
  const port=options.port??0;
  if(!Number.isSafeInteger(port)||port<0||port>65535)throw new TypeError('Invalid port');
  const token=options.token??randomBytes(24).toString('hex');
  if(typeof token!=='string'||token.length<12)throw new TypeError('Invalid demo token');
  const graph=await build();
  const namespaces=Object.create(null);
  for(const filename of graph.exposedPaths){
    namespaces[filename]=await import(pathToFileURL(
      path.join(__dirname,'before',filename)).href);
  }
  const expected=Buffer.from(token,'utf8');
  /** @param {http.IncomingMessage} request @returns {boolean} */
  function authorize(request){
    const received=Buffer.from(String(request.headers['x-demo-token']??''),'utf8');
    return received.length===expected.length&&timingSafeEqual(received,expected);
  }
  // The graph helper binds the original server exports and permits exactly
  // the graph's generated public facades. No raw source list is assembled.
  const handler=createScoGraphHandler(graph,namespaces,{
    authorizeRead:authorize,
    authorizeRpc:authorize,
    authorizeOperation:(request,method,args)=>authorize(request)&&
      args.length<=2&&args.every(value=>typeof value==='string')
  });
  const server=http.createServer(handler);
  /** @type {Promise<void>} */
  const ready=new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(port,host,()=>resolve());
  });
  await ready;
  const address=server.address();
  if(!address||typeof address==='string')throw Error('No local TCP address');
  return {server,origin:'http://'+host+':'+address.port,graph,token};
}

if(require.main===module){
  startServer({port:Number(process.env.PORT??8080)}).then(({origin,token})=>{
    console.log('SCO graph localhost URL: '+origin);
    console.log('Demo HTTP header x-demo-token: '+token);
  }).catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={startServer};
