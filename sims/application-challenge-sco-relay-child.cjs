'use strict';

const {pathToFileURL}=require('node:url');

/**
 * Public-only attacker worker. Receives a generated facade file in an
 * isolated temporary directory, an original server address, and a legitimate
 * caller token. No original private modules or compiler are imported.
 * @returns {Promise<void>}
 */
async function main(){
  const [sourceFile,origin,token,serializedCases]=process.argv.slice(2);
  if(!sourceFile||!origin||!token||!serializedCases)
    throw TypeError('Need facade file, origin, authorized token and cases');
  const cases=JSON.parse(serializedCases);
  const originalFetch=globalThis.fetch;
  globalThis.fetch=(input,options)=>originalFetch(new URL(
    /** @type {string} */ (input),origin),{
      ...options,headers:{...options?.headers,'x-demo-token':token}
    });
  const api=await import(pathToFileURL(sourceFile).href);
  const values=[];
  for(const item of cases){
    values.push(await api.evaluateRemote(item[0],item[1]));
  }
  process.stdout.write(JSON.stringify(values)+'\n');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
