'use strict';

const assert=require('node:assert/strict');
const {execFile}=require('node:child_process');
const fs=require('node:fs/promises');
const http=require('node:http');
const path=require('node:path');
const {promisify}=require('node:util');
const {Encoder}=require('cbor-x');
const {proveRootIdentityEligibility}=require('./sco-root-identity-static-proof');

const runFile=promisify(execFile);
const nodeEncoder=new Encoder({
  structuredClone:true,
  useRecords:false,
  alwaysUseFloat:true
});
const TOKEN='local-root-identity-browser-v1';

const APPLICATION_SOURCE=String.raw`
export async function echo(payload){
  const count=payload.records.length|0;
  if(count<0)return null;
  return payload;
}
export async function score(payload){
  let total=0;
  for(const record of payload.records){
    total=(total+(record.quantity|0)+(record.index|0))|0;
  }
  return total|0;
}
export async function nested(payload){
  return payload.records[0];
}
`;

/** @returns {string} */
function pageSource(){
  return '<!doctype html><html><head><meta charset="utf-8">'+
    '<script src="/vendor/cbor-x.js"></script></head><body>'+
    '<pre id="out">pending</pre><script>'+String.raw`
(async()=>{
  const encoder=new CBOR.Encoder({structuredClone:true,useRecords:false,alwaysUseFloat:true});
  function payload(){
    const shared={marker:"shared"};
    const root={
      category:"root-identity-browser",
      records:Array.from({length:32},(_,index)=>({
        index,
        label:"event-"+index,
        quantity:Math.imul(index+1,2654435761)|0
      })),
      left:shared,
      right:shared,
      missing:undefined,
      nan:NaN,
      negativeZero:-0,
      bigint:12345678901234567890n,
      date:new Date("2026-11-19T00:00:00.000Z"),
      regexp:/obfs/gi,
      set:new Set([1,2,3]),
      map:new Map([["x",7]])
    };
    root.self=root;
    return root;
  }
  function localScore(data){
    let total=0;
    for(const record of data.records){
      total=(total+(record.quantity|0)+(record.index|0))|0;
    }
    return total|0;
  }
  async function invoke(name,args){
    const response=await fetch("/invoke/"+name,{
      method:"POST",
      headers:{
        "content-type":"application/cbor",
        "x-obfs-token":"local-root-identity-browser-v1"
      },
      body:encoder.encode(args)
    });
    if(!response.ok)throw Error(name+" HTTP "+response.status);
    const envelope=encoder.decode(new Uint8Array(await response.arrayBuffer()));
    if(envelope.kind==="arg"){
      if(!Number.isInteger(envelope.index)||envelope.index<0||envelope.index>=args.length)
        throw Error("invalid argument token");
      return args[envelope.index];
    }
    if(envelope.kind==="value")return envelope.value;
    throw Error("unknown response envelope");
  }

  const root=payload();
  const echoResult=await invoke("echo",[root]);
  const scoreResult=await invoke("score",[root]);
  const nestedResponse=await fetch("/invoke/nested",{
    method:"POST",
    headers:{
      "content-type":"application/cbor",
      "x-obfs-token":"local-root-identity-browser-v1"
    },
    body:encoder.encode([root])
  });
  const result={
    echoIdentity:echoResult===root,
    scoreResult,
    localScore:localScore(root),
    scoreMatches:scoreResult===localScore(root),
    nestedStatus:nestedResponse.status
  };
  document.getElementById("out").textContent="pass:"+JSON.stringify(result);
})().catch(error=>{
  document.getElementById("out").textContent="fail:"+String(error&&error.stack||error);
});
`+'</script></body></html>';
}

/**
 * @param {string} root
 * @returns {Promise<{echoIdentity:boolean,scoreResult:number,localScore:number,scoreMatches:boolean,nestedStatus:number}>}
 */
async function browserSample(root){
  const args=[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=7000','--dump-dom',
    root+'/root-identity.html'
  ];
  const {stdout}=await runFile(process.env.CHROMIUM_BIN??'google-chrome',args,{
    encoding:'utf8',
    timeout:60000,
    maxBuffer:8*1024*1024
  });
  const match=stdout.match(/<pre id="out">pass:(\{[^<]*\})<\/pre>/u);
  assert.ok(match,'Browser did not complete root-identity probe: '+stdout.slice(-1200));
  return JSON.parse(match[1]);
}

/**
 * @param {http.IncomingMessage} request
 * @param {number} limit
 * @returns {Promise<Buffer>}
 */
function readBody(request,limit){
  return new Promise((resolve,reject)=>{
    /** @type {Buffer[]} */
    const chunks=[];
    let bytes=0;
    request.on('data',chunk=>{
      const part=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
      bytes+=part.length;
      if(bytes>limit){
        reject(new RangeError('request body too large'));
        request.destroy();
        return;
      }
      chunks.push(part);
    });
    request.on('end',()=>resolve(Buffer.concat(chunks)));
    request.on('error',reject);
  });
}

/** @param {any} value @returns {Record<string,boolean>} */
function semanticObservations(value){
  return {
    cycle:value.self===value,
    sharedReference:value.left===value.right,
    ownUndefined:Object.hasOwn(value,'missing')&&value.missing===undefined,
    nan:Number.isNaN(value.nan),
    negativeZero:Object.is(value.negativeZero,-0),
    bigint:value.bigint===12345678901234567890n,
    date:value.date instanceof Date&&value.date.toISOString()==='2026-11-19T00:00:00.000Z',
    regexp:value.regexp instanceof RegExp&&value.regexp.source==='obfs'&&value.regexp.flags==='gi',
    set:value.set instanceof Set&&[...value.set].join(',')==='1,2,3',
    map:value.map instanceof Map&&value.map.get('x')===7
  };
}

/** @returns {Promise<object>} */
async function run(){
  const names=['echo','score','nested'];
  const proofs=Object.fromEntries(names.map(name=>[
    name,proveRootIdentityEligibility(APPLICATION_SOURCE,name)
  ]));
  assert.equal(proofs.echo.eligible,true);
  assert.equal(proofs.score.eligible,true);
  assert.equal(proofs.nested.eligible,false);

  const moduleUrl='data:text/javascript;base64,'+
    Buffer.from(APPLICATION_SOURCE,'utf8').toString('base64');
  const application=/** @type {Record<string,(...args:any[])=>Promise<any>>} */ (
    await import(moduleUrl)
  );

  const bundlePath=path.join(process.cwd(),'node_modules','cbor-x','dist','index.js');
  const bundle=await fs.readFile(bundlePath,'utf8');
  assert.match(bundle,/Encoder/u);

  /** @type {Record<string,number>} */
  const executions={echo:0,score:0,nested:0};
  /** @type {Record<string,boolean>|null} */
  let echoObservations=null;
  let requestBytes=0;
  let rootTokenBytes=0;
  let fullValueBytes=0;

  const assets=new Map([
    ['/vendor/cbor-x.js',bundle],
    ['/root-identity.html',pageSource()]
  ]);

  const server=http.createServer((request,response)=>{
    void (async()=>{
      const target=request.url??'';
      if(request.method==='GET'&&assets.has(target)){
        response.writeHead(200,{
          'content-type':target.endsWith('.html')?
            'text/html; charset=utf-8':'text/javascript; charset=utf-8',
          'cache-control':'no-store'
        });
        response.end(assets.get(target));
        return;
      }
      const match=target.match(/^\/invoke\/(echo|score|nested)$/u);
      if(request.method!=='POST'||!match){
        response.writeHead(404).end();
        return;
      }
      if(request.headers['x-obfs-token']!==TOKEN){
        response.writeHead(403).end();
        return;
      }
      const name=match[1];
      const proof=proofs[name];
      if(!proof?.eligible){
        response.writeHead(409,{'content-type':'text/plain; charset=utf-8'});
        response.end('static proof refused operation');
        return;
      }
      const body=await readBody(request,1024*1024);
      requestBytes+=body.length;
      const decoded=nodeEncoder.decode(body);
      if(!Array.isArray(decoded))throw new TypeError('request must decode to argument array');
      if(name==='echo'){
        echoObservations=semanticObservations(decoded[0]);
      }
      executions[name]++;
      const result=await application[name](...decoded);
      let index=-1;
      if(typeof result==='object'&&result!==null){
        index=decoded.findIndex(value=>value===result);
      }
      const envelope=index>=0?
        {kind:'arg',index}:{kind:'value',value:result};
      const encoded=nodeEncoder.encode(envelope);
      if(name==='echo'){
        rootTokenBytes=encoded.byteLength;
        fullValueBytes=nodeEncoder.encode({kind:'value',value:result}).byteLength;
      }
      response.writeHead(200,{
        'content-type':'application/cbor',
        'content-length':encoded.byteLength,
        'cache-control':'no-store'
      });
      response.end(encoded);
    })().catch(error=>{
      if(!response.headersSent)response.writeHead(500);
      response.end(String(error&&error.stack||error));
    });
  });

  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try{
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const root='http://127.0.0.1:'+address.port;
    const browser=await browserSample(root);
    assert.equal(browser.echoIdentity,true);
    assert.equal(browser.scoreMatches,true);
    assert.equal(browser.nestedStatus,409);
    assert.equal(executions.echo,1);
    assert.equal(executions.score,1);
    assert.equal(executions.nested,0);
    assert.ok(echoObservations&&Object.values(echoObservations).every(Boolean));
    assert.ok(rootTokenBytes>0);
    assert.ok(fullValueBytes>rootTokenBytes);
    assert.ok(requestBytes>0);

    return {
      node:process.version,
      platform:process.platform,
      browser:process.env.CHROMIUM_BIN??'google-chrome',
      package:'cbor-x@1.6.9',
      options:{structuredClone:true,useRecords:false,alwaysUseFloat:true},
      proofs,
      browserResult:browser,
      echoObservations,
      executions,
      bytes:{
        browserBundle:Buffer.byteLength(bundle),
        acceptedRequestTotal:requestBytes,
        rootTokenResponse:rootTokenBytes,
        fullValueResponse:fullValueBytes
      },
      boundary:'real Chromium binary HTTP semantics and proof-gated execution; HTTP timing excluded'
    };
  }finally{
    await new Promise((resolve,reject)=>server.close(
      error=>error?reject(error):resolve(undefined)
    ));
  }
}

if(require.main===module){
  run().then(result=>{
    process.stdout.write('SCO_CBORX_ROOT_IDENTITY_BROWSER_HTTP '+JSON.stringify(result)+'\n');
  }).catch(error=>{
    console.error(error);
    process.exitCode=1;
  });
}

module.exports={APPLICATION_SOURCE,pageSource,browserSample,readBody,semanticObservations,run};
