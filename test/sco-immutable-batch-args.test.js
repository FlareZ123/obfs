'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createScoHandler,createScoBatchMethod}=require('../src');

/**
 * Make one actual HTTP request to a new SCO listener.
 * @param {import('node:http').RequestListener} handler
 * @param {string} body
 * @returns {Promise<{status:number,body:any}>}
 */
async function request(handler,body){
  const server=http.createServer(handler);
  /** @type {Promise<void>} */
  const listening=new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
  await listening;
  const address=server.address();
  if(!address||typeof address==='string')throw new Error('Expected server address');
  try{
    const response=await fetch('http://127.0.0.1:'+address.port+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},body
    });
    return {status:response.status,body:await response.json()};
  }finally{
    /** @type {Promise<void>} */
    const closed=new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve()));
    await closed;
  }
}

/** @param {unknown[]} calls @returns {string} */
function payload(calls){return JSON.stringify({method:'batch',args:[calls]});}

test('SCO read-only batch contract preserves nested own JSON data and freezes policy/task views',async()=>{
  /** @type {string[]} */
  const observations=[];
  const handler=createScoHandler([],{
    immutableBatchArgs:true,
    remoteMethods:{batch:createScoBatchMethod({
      /** @param {{own:{v:number},items:number[]}} input */
      inspect:input=>{
        observations.push('task');
        return [input.own.v,input.items.length,Object.isFrozen(input),
          Object.isFrozen(input.own),Object.isFrozen(input.items)];
      }
    })},
    authorizeRpc:()=>true,
    authorizeOperation:(req,method,args)=>{
      observations.push(method);
      assert.equal(Object.isFrozen(args),true);
      if(method==='batch'){
        const calls=/** @type {unknown[]} */(args[0]);
        assert.equal(Object.isFrozen(calls),true);
      } else {
        const record=/** @type {{own:object,items:unknown[]}} */(args[0]);
        assert.equal(Object.isFrozen(record),true);
        assert.equal(Object.isFrozen(record.own),true);
        assert.equal(Object.isFrozen(record.items),true);
      }
      return true;
    }
  });
  const result=await request(handler,payload([
    {method:'inspect',args:[{own:{v:9},items:[3,4]}]}
  ]));
  assert.deepEqual(result,{status:200,body:{ok:true,value:[{
    ok:true,value:[9,2,true,true,true]
  }]}});
  assert.deepEqual(observations,['batch','inspect','task']);
});

test('SCO read-only contract prevents outer policy from retargeting a private batch method',async()=>{
  let effects=0;
  const handler=createScoHandler([],{
    immutableBatchArgs:true,
    remoteMethods:{batch:createScoBatchMethod({
      allowed:()=>{effects++;return 1;},
      forbidden:()=>{effects++;return 99;}
    })},
    authorizeRpc:()=>true,
    authorizeOperation:(req,method,args)=>{
      if(method==='batch'){
        const calls=/** @type {{method:string,args:unknown[]}[]} */(args[0]);
        calls[0].method='forbidden';
      }
      return true;
    }
  });
  assert.deepEqual(await request(handler,payload([{method:'allowed',args:[]}])),{
    status:500,body:{ok:false,error:'Operation failed'}
  });
  assert.equal(effects,0);
});

test('SCO read-only contract prevents inner policy from rewriting task arguments',async()=>{
  /** @type {number[]} */
  const effects=[];
  const handler=createScoHandler([],{
    immutableBatchArgs:true,
    remoteMethods:{batch:createScoBatchMethod({
      /** @param {number[]} input */
      charge:input=>{effects.push(input[0]);return input[0]*10;}
    })},
    authorizeRpc:()=>true,
    authorizeOperation:(req,method,args)=>{
      if(method==='charge'){
        const items=/** @type {number[]} */(args[0]);
        items[0]=99;
      }
      return true;
    }
  });
  assert.deepEqual(await request(handler,payload([{method:'charge',args:[[1]]}])),{
    status:500,body:{ok:false,error:'Operation failed'}
  });
  assert.deepEqual(effects,[]);
});

test('SCO read-only contract exposes private method mutation as a generic per-item failure',async()=>{
  const handler=createScoHandler([],{
    immutableBatchArgs:true,
    remoteMethods:{batch:createScoBatchMethod({
      /** @param {{amount:number}} input */
      mutate:input=>{input.amount=99;return input.amount;},
      /** @param {{amount:number}} input */
      read:input=>input.amount
    })},
    authorizeRpc:()=>true,
    authorizeOperation:()=>true
  });
  assert.deepEqual(await request(handler,payload([
    {method:'mutate',args:[{amount:1}]},{method:'read',args:[{amount:2}]}
  ])),{status:200,body:{ok:true,value:[
    {ok:false,error:'Operation failed'},{ok:true,value:2}
  ]}});
});

test('SCO read-only contract handles 5000-deep JSON and parsed numeric/proto edge cases',async()=>{
  const handler=createScoHandler([],{
    immutableBatchArgs:true,
    remoteMethods:{batch:createScoBatchMethod({
      /** @param {unknown[]} values */
      check:values=>{
        const record=/** @type {object} */(values[2]);
        return [Object.is(values[0],-0),values[1]===Infinity,
          Object.hasOwn(record,'__proto__'),Object.isFrozen(record)];
      },
      deep:()=>7
    })},
    authorizeRpc:()=>true,
    authorizeOperation:()=>true
  });
  const edge='{"method":"batch","args":[[{"method":"check","args":[[-0,1e999,{"__proto__":{"marked":true}}]]}]]}';
  assert.deepEqual(await request(handler,edge),{
    status:200,body:{ok:true,value:[{ok:true,value:[true,true,true,true]}]}
  });
  const nested='['.repeat(5000)+'0'+']'.repeat(5000);
  const deep='{"method":"batch","args":[[{"method":"deep","args":['+nested+']}]]}';
  assert.deepEqual(await request(handler,deep),{
    status:200,body:{ok:true,value:[{ok:true,value:7}]}
  });
});

test('SCO read-only batch option is explicit and does not affect ordinary direct RPC',async()=>{
  assert.throws(()=>createScoHandler([],{immutableBatchArgs:true}),/authorizeOperation/);
  assert.throws(()=>createScoHandler([],{immutableBatchArgs:/** @type {any} */ ('yes')}),/boolean/);
  const handler=createScoHandler([],{
    immutableBatchArgs:true,
    remoteMethods:{
      batch:createScoBatchMethod({allowed:()=>1}),
      /** @param {{value:number}} record */
      direct:record=>{record.value++;return record.value;}
    },
    authorizeRpc:()=>true,
    authorizeOperation:()=>true
  });
  const output=await request(handler,JSON.stringify({
    method:'direct',args:[{value:7}]
  }));
  assert.deepEqual(output,{status:200,body:{ok:true,value:8}});
});

test('SCO read-only registered batch needs one request-body JSON.parse versus three default policy copies',async()=>{
  const readOnlyMethods={batch:createScoBatchMethod({read:()=>37})};
  const defaultHandler=createScoHandler([],{
    remoteMethods:readOnlyMethods,
    authorizeRpc:()=>true,
    authorizeOperation:()=>true
  });
  const frozenHandler=createScoHandler([],{
    immutableBatchArgs:true,
    remoteMethods:readOnlyMethods,
    authorizeRpc:()=>true,
    authorizeOperation:()=>true
  });
  const body=payload([{method:'read',args:[5]}]);
  const parse=JSON.parse;
  let count=0;
  try{
    // Count exactly the admitted RPC body, excluding fetch's parsing of
    // result JSON. The server receives the identical trusted request bytes
    // in both arms. Restore the host primitive even if a request fails.
    JSON.parse=(text,reviver)=>{
      if(text===body)count++;
      return parse(text,reviver);
    };
    assert.deepEqual(await request(defaultHandler,body),{
      status:200,body:{ok:true,value:[{ok:true,value:37}]}
    });
    assert.equal(count,3,'Default body, outer-policy and inner-policy parses');
    count=0;
    assert.deepEqual(await request(frozenHandler,body),{
      status:200,body:{ok:true,value:[{ok:true,value:37}]}
    });
    assert.equal(count,1,'Opt-in frozen sharing parses the body once');
  }finally{
    JSON.parse=parse;
  }
});
