'use strict';

const {createHmac}=require('node:crypto');
const esbuild=require('esbuild');

const KNOWN_OWN_NAMES=Object.freeze(['secretField','otherField','sessionMark']);

/**
 * A deliberately manually reviewed, *equally secret-holding* minifier control.
 * The exact same 32-byte private key available to the obfuscator is available
 * to esbuild's mangleCache. This uses no compiler source or private AST; the
 * field allowlist is manually safe *for the bounded test fixture only*.
 *
 * Never use this fixed allowlist on arbitrary code. Unlike the obfuscator's
 * own-escape proof, generic esbuild mangleProps does not automatically prove
 * that all runtime, reflection, host and dynamic callsites are safe.
 *
 * @param {ReadonlyArray<{path:string,code:string,sourceType:'module'}>} files
 * @param {{publicSeed:string,key:string}} options
 * @returns {{files:{path:string,code:string,sourceType:'module'}[],cache:Record<string,string>,bytes:number}}
 */
function minifyWithPrivatePropertyCache(files,options) {
  if(!Array.isArray(files)||files.length!==2 ||
     files.some(f=>typeof f?.path!=='string'||
       typeof f?.code!=='string'||f.sourceType!=='module')||
     typeof options?.key!=='string'||
     !/^[a-fA-F0-9]{64}$/u.test(options.key)||
     typeof options?.publicSeed!=='string') {
    throw new TypeError('Expected two source ESM files, a public seed and a secret 32-byte hex key');
  }
  const key=Buffer.from(options.key,'hex');
  /** @type {Record<string,string>} */
  const cache={};
  for(const original of KNOWN_OWN_NAMES){
    cache[original]='_p'+createHmac('sha256',key)
      .update('equal-trust-minifier-private-keys-v1\0'+
        options.publicSeed+'/'+original).digest('hex').slice(0,12);
  }
  const output=files.map(file=>{
    const result=esbuild.transformSync(file.code,{
      loader:'js',format:'esm',platform:'neutral',target:'es2022',
      minify:true,sourcemap:false,
      mangleProps:/^(secretField|otherField|sessionMark)$/,
      mangleCache:cache
    });
    return {...file,code:result.code};
  });
  return {files:output,cache,bytes:output.reduce((acc,file)=>
    acc+Buffer.byteLength(file.code),0)};
}

module.exports={minifyWithPrivatePropertyCache};
