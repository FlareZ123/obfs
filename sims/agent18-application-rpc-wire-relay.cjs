'use strict';

/**
 * An authenticated dynamic-trace adversary. The caller copied ONE observed
 * RPC method/argument shape from an instrumented public client. This process
 * never loads the generated SCO facade, the equal-trust ordinary facade, or
 * any of the server-private application modules.
 *
 * @returns {Promise<void>}
 */
async function main(){
  const [origin,token,method,encodedInputs]=process.argv.slice(2);
  if(!origin||!token||!method||!encodedInputs)throw TypeError('Missing relay inputs');
  /** @type {[number,number][]} */
  const cases=JSON.parse(encodedInputs);
  if(!Array.isArray(cases)||cases.some(item=>
    !Array.isArray(item)||item.length!==2||
    !item.every(value=>typeof value==='number'&&Number.isInteger(value)))){
    throw TypeError('Expected finite integer challenge pairs');
  }
  const endpoint=new URL('/obfs/rpc',origin);
  /** @type {unknown[]} */
  const values=[];
  for(const args of cases){
    const response=await fetch(endpoint,{
      method:'POST',
      headers:{'content-type':'application/json','x-demo-token':token},
      body:JSON.stringify({method,args})
    });
    if(response.status!==200)throw Error('Authorized operation failed: '+response.status);
    /** @type {{ok?:boolean,value?:unknown}} */
    const packet=await response.json();
    if(packet?.ok!==true)throw Error('Authorized operation did not return success');
    values.push(packet.value);
  }
  process.stdout.write(JSON.stringify(values)+'\n');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
