'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {randomBytes,createHash}=require('node:crypto');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const esbuild=require('esbuild');
const puppeteer=require('puppeteer-core');
const {partitionScoSelectedAsyncExports,bindScoModuleExports,createScoHandler}=
  require('../src');
const {privateSource}=require('./sco-two-sided-affine-inverse-comparison');

/**
 * Browser-only attacker bundle, imported by the COMPROMISED first-party
 * client. No original private source, source seed, affine matrices,
 * compiler return object or server implementation are accessible here.
 * The Node browser verifier has separate private data in its process.
 *
 * @returns {string}
 */
function attackerBundle(){
  const contents=[
    "const {masksOfWeight,learnBoundedDegreeOracle}=require('./sims/bounded-degree-oracle-functional-clone');",
    "const {invertQuadraticAffineTriangularModel}=require('./sims/quadratic-affine-triangular-inverse');",
    'module.exports={masksOfWeight,learnBoundedDegreeOracle,invertQuadraticAffineTriangularModel};'
  ].join('\n');
  const build=esbuild.buildSync({
    stdin:{contents,resolveDir:path.resolve(__dirname,'..'),sourcefile:'attack-bootstrap.cjs',loader:'js'},
    bundle:true,platform:'browser',format:'iife',globalName:'ATTACK',
    write:false,target:'es2022',minify:false
  });
  assert.ok(build.outputFiles?.length);
  return build.outputFiles[0].text;
}

const attackEntry=[
  'import {protectedTriangular} from "/obfs/triangular.mjs";',
  'const result=document.getElementById("result");',
  'const errors=document.getElementById("errors");',
  '(async()=>{',
  '  const response=await fetch("/targets.json");',
  '  if(response.status!==200)throw new Error("Targets HTTP "+response.status);',
  '  const targets=await response.json();',
  '  const observed=new Map();',
  '  for(let degree=0;degree<=2;degree++){',
  '    for(const input of ATTACK.masksOfWeight(32,degree)){',
  '      observed.set(input,await protectedTriangular(input));',
  '    }',
  '  }',
  '  const learned=ATTACK.learnBoundedDegreeOracle(input=>{',
  '    if(!observed.has(input))throw new Error("Missing browser-acquired oracle input");',
  '    return observed.get(input);',
  '  },32,2);',
  '  if(learned.queryCount!==529||observed.size!==529)throw new Error("Unexpected query count");',
  '  const stopped=await fetch("/disable-private-rpc",{method:"POST"});',
  '  if(stopped.status!==200)throw new Error("Private endpoint disable rejected");',
  '  const ack=await stopped.json();',
  '  if(ack.privateCalls!==529||ack.disabled!==true)throw new Error("Private endpoint was not stopped");',
  '  const recovered=targets.map(target=>{',
  '    const result=ATTACK.invertQuadraticAffineTriangularModel(learned,target);',
  '    if(!result)throw new Error("No algebraic inverse for target");',
  '    if(result.localModelEvaluations!==1)throw new Error("Offline model cost regression");',
  '    return result.input;',
  '  });',
  '  result.textContent=JSON.stringify({',
  '    recovered,trainingQueries:learned.queryCount,offlineModelEvaluations:recovered.length,',
  '    privateDisabledBeforeInversion:ack.disabled,',
  '    browserCookieReadable:document.cookie.includes("obfs_demo="),',
  '    targetCount:targets.length',
  '  });',
  '})().catch(error=>{errors.textContent=String(error&&error.stack||error);result.textContent="ERROR";});'
].join('\n');

/**
 * Real Chromium end-to-end browser client: actual generated SCO facade
 * and 529 authorized same-origin HTTP RPC calls with an HttpOnly cookie
 * and restrictive same-origin CSP. The browser attacker never reads the
 * cookie or receives any server-private function source. A dedicated
 * test-only endpoint disables all subsequent private RPC BEFORE the
 * browser performs coefficient-only local inversion.
 *
 * The test does not assert cookie/CSP bypass; in this attacker model the
 * client already has first-party script execution and an authorized
 * session. This is a functional preimage acquisition result, not source
 * extraction or unrelated SCO/COO/SNO security performance evidence.
 *
 * @returns {Promise<{
 *   seed:number,sourceSha256:string,privateSourceBytes:number,
 *   publishedBytes:number,privateSourceLeaked:boolean,
 *   deniedWithoutCookie:number,authorizedPrivateCalls:number,
 *   disabledAt:number,offlineRecoveries:number,targetCount:number,
 *   onlineQueries:number,offlineModelEvaluations:number,
 *   sessionCookieReadable:boolean,privateDisabledBeforeInversion:boolean,
 *   csp:string,browserExecuted:boolean
 * }>}
 */
async function runBrowserChallenge(){
  const seed=randomBytes(4).readUInt32BE(0);
  const source=privateSource(seed);
  const sourceSha256=createHash('sha256').update(source).digest('hex');
  const original=await import('data:text/javascript,'+encodeURIComponent(source));
  /** @type {(input:number)=>Promise<number>} */
  const verifier=original.protectedTriangular;
  const secrets=Array.from({length:16},(_,index)=>
    createHash('sha256').update(sourceSha256+'/'+index).digest().readUInt32BE(0));
  const targets=await Promise.all(secrets.map(secret=>verifier(secret)));
  const selected=partitionScoSelectedAsyncExports({
    path:'triangular.mjs',sourceType:'module',code:source
  },{seed:'sco-two-sided-affine-browser-20261123',
    privateNames:['protectedTriangular']});
  const publicCode=selected.clientFile.code;
  const privateSourceLeaked=/OBFS_PRIVATE_INNER|OBFS_PRIVATE_OUTER|OBFS_PRIVATE_PAIRS/u
    .test(publicCode);
  assert.equal(privateSourceLeaked,false);
  const methods=bindScoModuleExports(selected,original);
  /** @type {Record<string,(...args:any[])=>unknown|Promise<unknown>>} */
  const remote=Object.create(null);
  let privateCalls=0,disabledAt=-1,privateDisabled=false;
  for(const [name,method] of Object.entries(methods)) {
    remote[name]=(...args)=>{privateCalls++;return method(...args);};
  }
  const cookieName='obfs_demo',token=randomBytes(16).toString('hex');
  const cookieHeader=cookieName+'='+token;
  /** @param {http.IncomingMessage} request @returns {boolean} */
  const authenticated=request=>
    (request.headers.cookie??'').split(';').some(x=>x.trim()===cookieHeader);
  const scoHandler=createScoHandler([selected.clientFile],{
    remoteMethods:remote,
    authorizeRead:authenticated,
    authorizeRpc:request=>authenticated(request)&&!privateDisabled,
    authorizeOperation:(request,method,args)=>
      authenticated(request)&&!privateDisabled&&
      method===selected.methodNames.protectedTriangular&&
      args.length===1&&Number.isSafeInteger(args[0])&&
      /** @type {number} */(args[0])>=0&&
      /** @type {number} */(args[0])<=0xffffffff
  });
  const csp="default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'none'; object-src 'none'";
  const scriptBundle=attackerBundle();
  const html='<!doctype html><html><head><meta charset="UTF-8"></head>'+
    '<body><pre id="result">pending</pre><pre id="errors"></pre>'+
    '<script src="/attacker-bundle.js"></script>'+
    '<script type="module" src="/attacker-entry.mjs"></script></body></html>';
  const server=http.createServer((req,res)=>{
    /** @param {number} status @param {string} type @param {string} value @returns {void} */
    const send=(status,type,value)=>{
      res.writeHead(status,{'content-type':type,'cache-control':'no-store'});
      res.end(value);
    };
    if(req.method==='GET'&&req.url==='/'){
      res.setHeader('set-cookie',cookieHeader+'; Path=/; HttpOnly; SameSite=Strict');
      res.setHeader('content-security-policy',csp);
      send(200,'text/html; charset=utf-8',html);
      return;
    }
    if(req.method==='GET'&&req.url==='/attacker-bundle.js'){
      send(200,'application/javascript; charset=utf-8',scriptBundle);
      return;
    }
    if(req.method==='GET'&&req.url==='/attacker-entry.mjs'){
      send(200,'application/javascript; charset=utf-8',attackEntry);
      return;
    }
    if(req.method==='GET'&&req.url==='/targets.json'){
      if(!authenticated(req)){send(403,'application/json','{"ok":false}');return;}
      send(200,'application/json',JSON.stringify(targets));
      return;
    }
    if(req.method==='POST'&&req.url==='/disable-private-rpc'){
      if(!authenticated(req)){send(403,'application/json','{"ok":false}');return;}
      privateDisabled=true;
      disabledAt=privateCalls;
      send(200,'application/json',JSON.stringify({
        disabled:true,privateCalls,stoppedAt:disabledAt
      }));
      return;
    }
    scoHandler(req,res);
  });

  /** @type {import('puppeteer-core').Browser|undefined} */
  let browser;
  try{
    /** @type {Promise<void>} */
    const ready=new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve());
    });
    await ready;
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const origin='http://127.0.0.1:'+address.port;
    const denied=await fetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:selected.methodNames.protectedTriangular,args:[1]})
    });
    assert.equal(denied.status,403);
    const chromiumName=process.env.CHROMIUM_BIN??'google-chrome';
    const chromiumPath=path.isAbsolute(chromiumName)?chromiumName:
      String(execFileSync('which',[chromiumName],{encoding:'utf8'})).trim();
    browser=await puppeteer.launch({
      executablePath:chromiumPath,
      headless:true,
      args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run']
    });
    const page=await browser.newPage();
    await page.goto(origin,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>{
      const field=document.getElementById('result');
      return field!==null&&field.textContent!=='pending';
    },{timeout:90000});
    const resultText=await page.$eval('#result',el=>el.textContent);
    const errorText=await page.$eval('#errors',el=>el.textContent);
    assert.equal(errorText,'','Browser script failed: '+errorText);
    assert.ok(resultText&&resultText!=='ERROR');
    /** @type {{
     *   recovered:number[],trainingQueries:number,offlineModelEvaluations:number,
     *   privateDisabledBeforeInversion:boolean,browserCookieReadable:boolean,
     *   targetCount:number
     * }} */
    const result=JSON.parse(resultText);
    assert.deepEqual(result.recovered,secrets,
      'Browser must recover source-private target inputs without private RPC');
    assert.equal(privateCalls,529);
    assert.equal(disabledAt,529);
    assert.equal(result.trainingQueries,529);
    assert.equal(result.offlineModelEvaluations,secrets.length);
    assert.equal(result.privateDisabledBeforeInversion,true);
    assert.equal(result.browserCookieReadable,false);
    return {
      seed,sourceSha256,privateSourceBytes:Buffer.byteLength(source),
      publishedBytes:Buffer.byteLength(publicCode),privateSourceLeaked,
      deniedWithoutCookie:denied.status,authorizedPrivateCalls:privateCalls,
      disabledAt,offlineRecoveries:result.recovered.length,targetCount:result.targetCount,
      onlineQueries:result.trainingQueries,
      offlineModelEvaluations:result.offlineModelEvaluations,
      sessionCookieReadable:result.browserCookieReadable,
      privateDisabledBeforeInversion:result.privateDisabledBeforeInversion,
      csp,browserExecuted:true
    };
  }finally{
    if(browser)await browser.close();
    /** @type {Promise<void>} */
    const closed=new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve()));
    await closed;
  }
}

if(require.main===module){
  runBrowserChallenge().then(result=>
    console.log('SCO_TWO_SIDED_BROWSER_OFFLINE_INVERSE '+JSON.stringify(result)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={runBrowserChallenge,attackerBundle};
