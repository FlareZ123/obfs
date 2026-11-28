'use strict';

const fs=require('node:fs');

/**
 * Run the public 24-call policy using only an HTTP endpoint, method name,
 * and public policy DAG. This process is deliberately separate from the
 * server process and receives no hidden model or expected terminal class.
 * @returns {Promise<void>}
 */
async function main(){
  const [origin,method,policyPath]=process.argv.slice(2);
  if(!origin||!method||!policyPath)
    throw new Error('Usage: node attacker.js <origin> <method> <policy.json>');
  const clientResponse=await fetch(new URL('/obfs/client.mjs',origin),{
    signal:AbortSignal.timeout(5000)
  });
  if(!clientResponse.ok)throw new Error('Public SCO client unavailable: '+clientResponse.status);
  const clientSource=await clientResponse.text();
  if(!clientSource.includes(method)||!clientSource.includes('/obfs/rpc'))
    throw new Error('RPC method or endpoint is not visible in the public client');
  /** @type {{root:number,nodes:{input:number,children:[number,number]}[]}} */
  const policy=JSON.parse(fs.readFileSync(policyPath,'utf8'));
  let node=policy.root;
  /** @type {number[]} */
  const inputs=[];
  /** @type {number[]} */
  const outputs=[];
  for(let queries=0;queries<24;queries++){
    if(!Number.isSafeInteger(node)||node<0||node>=policy.nodes.length)
      throw new Error('Invalid public policy node '+node);
    const current=policy.nodes[node];
    const input=current.input;
    if(input!==0&&input!==1)throw new Error('Invalid policy input '+input);
    const response=await fetch(new URL('/obfs/rpc',origin),{
      method:'POST',
      headers:{
        'content-type':'application/json',
        cookie:'session=legitimate'
      },
      body:JSON.stringify({method,args:[input]}),\n      signal:AbortSignal.timeout(5000)
    });
    const payload=await response.json();
    if(response.status!==200||payload?.ok!==true)
      throw new Error('RPC rejected policy step: '+response.status+' '+JSON.stringify(payload));
    const output=payload.value;
    if(output!==0&&output!==1)
      throw new Error('Unexpected oracle output '+String(output));
    inputs.push(input);
    outputs.push(output);
    const child=current.children[output];
    if(!Number.isSafeInteger(child))
      throw new Error('Missing policy branch for observed output '+output);
    if(child<=-2){
      process.stdout.write(JSON.stringify({
        queries:inputs.length,inputs,outputs,terminalClass:-child-2
      })+'\n');
      return;
    }
    if(child<0)throw new Error('Policy reached impossible child '+child);
    node=child;
  }
  throw new Error('The three-state policy exceeded its 24-call bound');
}

main().catch(error=>{
  process.stderr.write(String(error?.stack||error)+'\n');
  process.exitCode=1;
});
