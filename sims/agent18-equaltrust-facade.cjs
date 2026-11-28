'use strict';

const {transformSync}=require('esbuild');

/**
 * Equal-trust control: a conventional minified public ESM RPC facade for
 * the exact same private server that the generated SCO facade invokes.
 * Neither client receives the original server-side source. The method
 * identifier and argument vector intentionally match the SCO compiler.
 *
 * @param {string} method
 * @returns {string}
 */
function ordinaryFacade(method){
  const source=[
    'export async function evaluateRemote(seed,count){',
    'const response=await fetch("/obfs/rpc",{method:"POST",credentials:"same-origin",cache:"no-store",',
    'headers:{"content-type":"application/json"},body:JSON.stringify({method:'+
      JSON.stringify(method)+',args:[seed,count]})});',
    'const result=await response.json();',
    'if(!response.ok||result.ok!==true)throw Error("Remote operation failed");',
    'return result.value;',
    '}'
  ].join('');
  return transformSync(source,{format:'esm',minify:true,target:'es2022'}).code;
}

module.exports={ordinaryFacade};
