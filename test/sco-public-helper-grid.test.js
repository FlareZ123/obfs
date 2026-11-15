'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {partitionScoSelectedAsyncExports,bindScoModuleExports}=require('../src');

const FORMATS=[
  /** @param {string} n @param {string} body */
  (n,body)=>'function '+n+'(value){return '+body+';}',
  /** @param {string} n @param {string} body */
  (n,body)=>'const '+n+'=value=>'+body+';',
  /** @param {string} n @param {string} body */
  (n,body)=>'const '+n+'=function(value){return '+body+';};'
];

test('36 mixed SCO local-helper graphs preserve 180 original-versus-RPC outputs',async()=>{
  const originalFetch=globalThis.fetch;
  let graphs=0;
  let checks=0;
  try{
    for(let privateForm=0;privateForm<3;privateForm++){
      for(let publicForm=0;publicForm<3;publicForm++){
        for(let variant=0;variant<4;variant++){
          const id=privateForm*12+publicForm*4+variant;
          const secretKey='KEY_'+id;
          const privateName='hidden_'+id;
          const publicName='visible_'+id;
          const privateHelper=FORMATS[privateForm](privateName,'value.length+'+secretKey);
          const publicHelper=FORMATS[publicForm](publicName,'value.toUpperCase()');
          const source=[
            'const '+secretKey+'='+(17+id)+';',
            ...(variant%2?[publicHelper,privateHelper]:[privateHelper,publicHelper]),
            'export async function secret(value){return '+privateName+'(value);}',
            'export function local(value){return '+publicName+'(value);}',
            'export async function combined(value){return (await secret(value))+":"+local(value);}'
          ].join('\n');
          const split=partitionScoSelectedAsyncExports({
            path:'mixed.mjs',sourceType:'module',code:source
          },{
            seed:'public-helper-grid-'+id,privateNames:['secret'],
            publicHelperNames:[publicName]
          });
          assert.deepEqual(split.publicHelperNames,[publicName]);
          assert.doesNotMatch(split.clientFile.code,new RegExp(privateName,'u'));
          assert.doesNotMatch(split.clientFile.code,new RegExp(secretKey,'u'));
          assert.ok(split.clientFile.code.includes(publicName));
          const native=await import('data:text/javascript,'+encodeURIComponent(source));
          const methods=bindScoModuleExports(split,native);
          globalThis.fetch=async(_url,options)=>{
            const request=JSON.parse(/** @type {string} */ (options.body));
            const value=await methods[request.method](...request.args);
            return /** @type {Response} */ (/** @type {unknown} */ ({
              ok:true,json:async()=>({ok:true,value})
            }));
          };
          const client=await import('data:text/javascript,'+
            encodeURIComponent(split.clientFile.code));
          for(const input of ['Alpha','', 'one','Ω','🚀']){
            assert.equal(client.local(input),native.local(input));
            assert.equal(await client.combined(input),await native.combined(input));
            checks++;
          }
          graphs++;
        }
      }
    }
  }finally{
    globalThis.fetch=originalFetch;
  }
  assert.equal(graphs,36);
  assert.equal(checks,180);
});
