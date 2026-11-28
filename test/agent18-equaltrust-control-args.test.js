'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {build,EXPOSED}=require('../examples/application-challenge/sco-build.cjs');
const {ordinaryFacade}=require('../sims/agent18-equaltrust-facade.cjs');

/**
 * The same-trust ordinary RPC comparator must be a true input-level
 * replacement, not merely equivalent on a predetermined two-argument
 * happy path. JSON.stringify serializes missing/extra JS arguments
 * differently: the generated SCO client forwards [...arguments].
 *
 * @returns {Promise<void>}
 */
async function compareWire(){
  const graph=await build();
  const method=graph.partitions[EXPOSED].methodNames.evaluateRemote;
  const generatedSource=graph.clientFiles[0].code;
  const ordinarySource=ordinaryFacade(method);
  const originalFetch=globalThis.fetch;
  /** @type {{method:string,args:unknown[]}|undefined} */
  let observed;
  try{
    globalThis.fetch=/** @type {typeof fetch} */ ((endpoint,init)=>{
      assert.equal(String(endpoint),'/obfs/rpc');
      if(typeof init?.body!=='string')throw TypeError('Missing request body');
      observed=JSON.parse(init.body);
      return Promise.resolve(new Response(
        JSON.stringify({ok:true,value:371}),
        {status:200,headers:{'content-type':'application/json'}}));
    });
    const generated=await import('data:text/javascript;base64,'+
      Buffer.from(generatedSource).toString('base64'));
    const ordinary=await import('data:text/javascript;base64,'+
      Buffer.from(ordinarySource).toString('base64'));
    /** @type {Array<unknown[]>} */
    const cases=[
      [17,400],[17],[17,400,9],[],[17,undefined],[17,400,null]
    ];
    /** @param {(x?:unknown,y?:unknown)=>Promise<unknown>} invoke
     * @param {unknown[]} args
     * @returns {Promise<{method:string,args:unknown[]}>}
     */
    async function trace(invoke,args){
      observed=undefined;
      assert.equal(await invoke(...args),371);
      assert.ok(observed,'Expected network JSON request');
      return observed;
    }
    for(const args of cases){
      const sco=await trace(generated.evaluateRemote,args);
      const control=await trace(ordinary.evaluateRemote,args);
      assert.deepEqual(control,sco,
        'Equal-trust comparator must forward exact JavaScript arguments');
      assert.equal(sco.method,method);
    }
  }finally{
    globalThis.fetch=originalFetch;
  }
}

test('ordinary equal-trust minified RPC has exact SCO wire argument semantics',compareWire);
