'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {createHash}=require('node:crypto');
const esbuild=require('esbuild');
const {partitionScoSelectedAsyncExports,bindScoModuleExports,createScoHandler}=
  require('../src');
const {makeFixture}=require('./sparse-triangular-fixedpoint-inversion');
const {invertByReanchoring}=
  require('./random-affine-anchor-compatible-inversion');
const {makeLinearTransform,makeRng,u32}=
  require('./compatible-permutation-linear-sandwich-blackbox');

const TOKEN='authorized-four-shear-matched-attack';

/**
 * Build an actual independently importable ESM private source with four
 * interacting compatible shears, hidden dense affine wrappers and a
 * deliberately rare chosen target. The attacker never sees this source.
 * @param {ReturnType<typeof makeFixture>} fixture
 * @returns {string}
 */
function privateSource(fixture) {
  const outer=makeLinearTransform(fixture.sourceSeed^0xbb67ae85);
  return [
    ...fixture.inner.map((value,index)=>
      'const OBFS_PRIVATE_I'+index+'='+value+';'),
    ...outer.map((value,index)=>
      'const OBFS_PRIVATE_O'+index+'='+value+';'),
    'const OBFS_PRIVATE_IN_OFFSET='+fixture.innerOffset+';',
    'const OBFS_PRIVATE_OUT_OFFSET='+fixture.outputOffset+';',
    ...fixture.gates.flatMap((gate,index)=>[
      'const OBFS_PRIVATE_G'+index+'_MASK='+gate.mask+';',
      'const OBFS_PRIVATE_G'+index+'_MARKER='+gate.marker+';',
      'const OBFS_PRIVATE_G'+index+'_FLIP='+gate.flip+';'
    ]),
    'function obfsPrivateApply(columns,input){',
    '  let x=input>>>0,output=0,bit=0;',
    '  while(x!==0){if((x&1)!==0)output^=columns[bit];x>>>=1;bit++;}',
    '  return output>>>0;',
    '}',
    'export async function protectedFourShear(input){',
    '  const inner=['+fixture.inner.map((_,i)=>'OBFS_PRIVATE_I'+i).join(',')+'];',
    '  const outer=['+outer.map((_,i)=>'OBFS_PRIVATE_O'+i).join(',')+'];',
    '  let z=(obfsPrivateApply(inner,input>>>0)^OBFS_PRIVATE_IN_OFFSET)>>>0;',
    ...fixture.gates.map((_,i)=>
      '  if((z&OBFS_PRIVATE_G'+i+'_MASK)===OBFS_PRIVATE_G'+i+
      '_MARKER)z=(z^OBFS_PRIVATE_G'+i+'_FLIP)>>>0;'),
    '  return (obfsPrivateApply(outer,z)^OBFS_PRIVATE_OUT_OFFSET)>>>0;',
    '}',
    'export function publicIdentity(input){return input>>>0;}'
  ].join('\n');
}

class NeedQuery extends Error {
  /** @param {number} input */
  constructor(input) {
    super('Public chosen-oracle inversion requires a missing input');
    this.input=input>>>0;
  }
}

/**
 * Resume the same public synchronous inversion policy after each missing
 * authenticated HTTP query. Each missing input is transmitted exactly
 * once, and the attacker only sees the selected method name and replies.
 *
 * @param {{origin:string,method:string,token:string}} access
 * @param {number} target
 * @returns {Promise<{value:number,queries:number,corrections:number,
 *   transcriptHash:string}>}
 */
async function invertOverHttp(access,target) {
  /** @type {Map<number,number>} */
  const seen=new Map();
  const transcript=createHash('sha256');
  for(;;) {
    try {
      const result=invertByReanchoring(input=>{
        const key=input>>>0;
        if(!seen.has(key))throw new NeedQuery(key);
        return /** @type {number} */(seen.get(key));
      },target,0,1,true);
      assert.equal(result.queries,seen.size);
      return {value:result.value,queries:seen.size,
        corrections:result.corrections,transcriptHash:transcript.digest('hex')};
    }catch(error) {
      if(!(error instanceof NeedQuery))throw error;
      const input=error.input;
      const response=await fetch(access.origin+'/obfs/rpc',{
        method:'POST',
        headers:{'content-type':'application/json','x-demo-session':access.token},
        body:JSON.stringify({method:access.method,args:[input]})
      });
      assert.equal(response.status,200,'Legitimate chosen query denied');
      /** @type {{ok?:unknown,value?:unknown}} */
      const body=await response.json();
      assert.equal(body.ok,true);
      assert.ok(typeof body.value==='number'&&Number.isInteger(body.value)&&
        body.value>=0&&body.value<=0xffffffff,'RPC output must be uint32');
      seen.set(input,body.value);
      transcript.update(JSON.stringify([input,body.value])+'\n');
    }
  }
}

/**
 * Two identical hidden-functions and equal-authentication HTTP arms:
 * generated SCO private RPC versus an ordinary esbuild-minified native
 * Node RPC. The attacker only sees the public chosen-query interface.
 *
 * @param {'sco'|'minified'} arm
 * @param {string} source
 * @param {ReturnType<typeof makeFixture>} fixture
 * @returns {Promise<{arm:'sco'|'minified',queries:number,corrections:number,
 *   exact:boolean,privateCalls:number,deniedStatus:number,
 *   transcriptHash:string,privateSourceLeaked:boolean,
 *   exposedPrivateBytes:number,privateModuleBytes:number,verifiedInputs:number}>}
 */
async function executeArm(arm,source,fixture) {
  const servedPrivate=arm==='minified'
    ?esbuild.transformSync(source,{loader:'js',format:'esm',
      target:'es2022',minify:true}).code
    :source;
  const original=await import('data:text/javascript,'+
    encodeURIComponent(servedPrivate));
  const next=makeRng(fixture.sourceSeed^0x51ed270b);
  for(const x of [0,1,0xffffffff,fixture.secret,fixture.control]) {
    assert.equal(await original.protectedFourShear(x),fixture.oracle(x),
      'ESM private implementation differs from source fixture');
  }
  for(let i=0;i<128;i++) {
    const x=next();
    assert.equal(await original.protectedFourShear(x),fixture.oracle(x),
      'Minified or private ESM changed source behavior');
  }
  /** @type {import('node:http').Server|undefined} */
  let server;
  let privateCalls=0;
  let method='protectedFourShear';
  let publicCode='';
  try {
    if(arm==='sco') {
      const selected=partitionScoSelectedAsyncExports({
        path:'mixed.mjs',sourceType:'module',code:source
      },{seed:'sco-four-shear-reanchor-matched-20261123',
        privateNames:['protectedFourShear']});
      const methods=bindScoModuleExports(selected,original);
      /** @type {Record<string,(...args:any[])=>unknown|Promise<unknown>>} */
      const instrumented=Object.create(null);
      for(const [name,fn] of Object.entries(methods)) {
        instrumented[name]=(...args)=>{privateCalls++;return fn(...args);};
      }
      server=http.createServer(createScoHandler([selected.clientFile],{
        remoteMethods:instrumented,
        authorizeRead:req=>req.headers['x-demo-session']===TOKEN,
        authorizeRpc:req=>req.headers['x-demo-session']===TOKEN,
        authorizeOperation:(req,name,args)=>
          req.headers['x-demo-session']===TOKEN&&
          name===selected.methodNames.protectedFourShear&&
          args.length===1&&Number.isInteger(args[0])&&
          /** @type {number} */(args[0])>=0&&
          /** @type {number} */(args[0])<=0xffffffff
      }));
    }else{
      server=http.createServer(async(req,res)=>{
        if(req.headers['x-demo-session']!==TOKEN){
          res.statusCode=403;res.end('Forbidden');return;
        }
        if(req.url!=='/obfs/rpc'||req.method!=='POST'){
          res.statusCode=404;res.end('Not found');return;
        }
        /** @type {Buffer[]} */
        const chunks=[];
        for await(const part of req)chunks.push(Buffer.from(part));
        /** @type {{method?:unknown,args?:unknown}} */
        const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const args=body.args;
        if(body.method!==method||!Array.isArray(args)||
           args.length!==1||typeof args[0]!=='number'||
           !Number.isInteger(args[0])||args[0]<0||args[0]>0xffffffff){
          res.statusCode=400;res.end('Bad request');return;
        }
        privateCalls++;
        const value=await original.protectedFourShear(args[0]);
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify({ok:true,value}));
      });
    }
    const active=server;
    /** @type {Promise<void>} */
    const ready=new Promise((resolve,reject)=>{
      active.once('error',reject);
      active.listen(0,'127.0.0.1',resolve);
    });
    await ready;
    const address=active.address();
    assert.ok(address&&typeof address!=='string');
    const origin='http://127.0.0.1:'+address.port;
    const denied=await fetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method,args:[1]})
    });
    assert.equal(denied.status,403,'Unauthenticated request must be refused');
    if(arm==='sco') {
      const published=await fetch(origin+'/obfs/mixed.mjs',{
        headers:{'x-demo-session':TOKEN}
      });
      assert.equal(published.status,200);
      publicCode=await published.text();
      const facade=publicCode.match(
        /export async function protectedFourShear\([^)]*\)\{return await [\w$]+\("([^"]+)",\[\.\.\.arguments\]\);\}/u);
      assert.ok(facade?.[1],'Cannot discover public SCO method identifier');
      method=facade[1];
    }
    const privateSourceLeaked=/OBFS_PRIVATE_INNER|OBFS_PRIVATE_OUTER|OBFS_PRIVATE_GATES/u
      .test(publicCode);
    assert.equal(privateSourceLeaked,false,
      'Published SCO client facade leaked source-private constants');
    const target=fixture.oracle(fixture.secret);
    const recovered=await invertOverHttp({origin,method,token:TOKEN},target);
    assert.equal(recovered.value,fixture.secret);
    assert.equal(privateCalls,recovered.queries,
      'Only authorized chosen-oracle calls may run the private source');
    assert.ok(recovered.queries<=64);
    return {arm,queries:recovered.queries,corrections:recovered.corrections,
      exact:true,privateCalls,deniedStatus:denied.status,
      transcriptHash:recovered.transcriptHash,privateSourceLeaked,
      exposedPrivateBytes:Buffer.byteLength(publicCode),
      privateModuleBytes:Buffer.byteLength(servedPrivate),
      verifiedInputs:133};
  }finally{
    if(server) {
      const remaining=server;
      /** @type {Promise<void>} */
      const closed=new Promise((resolve,reject)=>
        remaining.close(error=>error?reject(error):resolve()));
      await closed;
    }
  }
}

/**
 * Source-private fixture and same-source SCO/minified HTTP comparison.
 * @returns {Promise<{sco:Awaited<ReturnType<typeof executeArm>>,
 *   minified:Awaited<ReturnType<typeof executeArm>>,
 *   matchedTranscript:boolean,matchedExactTarget:boolean,
 *   rareGateCount:number,sourceSeed:number,sourceSha256:string}>}
 */
async function compare() {
  const fixture=makeFixture(3188840621);
  assert.equal(fixture.anchorsClean,true);
  assert.equal(fixture.gates.length,4);
  const source=privateSource(fixture);
  const sco=await executeArm('sco',source,fixture);
  const minified=await executeArm('minified',source,fixture);
  assert.equal(sco.queries,minified.queries);
  assert.equal(sco.corrections,minified.corrections);
  assert.equal(sco.transcriptHash,minified.transcriptHash);
  assert.equal(sco.privateCalls,sco.queries);
  assert.equal(minified.privateCalls,minified.queries);
  assert.equal(sco.queries,38);
  assert.equal(minified.queries,38);
  return {sco,minified,matchedTranscript:true,matchedExactTarget:true,
    rareGateCount:fixture.gates.length,sourceSeed:fixture.sourceSeed,
    sourceSha256:createHash('sha256').update(source).digest('hex')};
}

if(require.main===module) {
  compare().then(result=>
    console.log('SCO_FOUR_SHEAR_MATCHED_HTTP '+JSON.stringify(result)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={privateSource,invertOverHttp,executeArm,compare};
