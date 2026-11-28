'use strict';
// Native-only diagnostic; deliberately forces an idle close, not the original CI failure.
const http=require('node:http');
const {setImmediate:immediate}=require('node:timers/promises');
async function main(){
  const results=[];
  for(let trial=0;trial<10;trial++){
    const server=http.createServer((request,response)=>{
      request.resume();
      request.on('end',()=>response.end('ok'));
    });
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',resolve);
    });
    const address=server.address();
    const url='http://127.0.0.1:'+address.port+'/step';
    const yieldAfterClose=trial%2===1;
    try{
      await (await fetch(url,{method:'POST',body:'{}'})).text();
      await immediate();
      server.closeIdleConnections();
      if(yieldAfterClose)await immediate();
      const response=await fetch(url,{method:'POST',body:'{}'});
      await response.text();
      results.push({trial,yieldAfterClose,result:response.status});
    }catch(error){
      results.push({trial,yieldAfterClose,result:error.cause?.code||error.message});
    }finally{
      await new Promise(resolve=>server.close(resolve));
    }
  }
  console.log(JSON.stringify({node:process.version,undici:process.versions.undici,platform:process.platform,results},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
