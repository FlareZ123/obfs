'use strict';

const {transformSync}=require('esbuild');

/**
 * Equal-trust control: a conventional minified public ESM RPC facade for
 * the exact same private server that the generated SCO facade invokes.
 * Neither client receives the original server-side source. The method
 * identifier and the full positional arguments vector intentionally match the SCO compiler,
 * including missing, undefined and extra arguments. This is an exact
 * behavioral comparator rather than a two-argument happy-path surrogate.
 *
 * @param {string} method
 * @returns {string}
 */
function ordinaryFacade(method){
  const source=[
    'export async function evaluateRemote(seed,count){',
    'const response=await fetch("/obfs/rpc",{method:"POST",credentials:"same-origin",cache:"no-store",',
    'headers:{"content-type":"application/json"},body:JSON.stringify({method:'+
      JSON.stringify(method)+',args:[...arguments]})});',
    'const result=await response.json();',
    'if(!response.ok||result.ok!==true)throw Error("Remote operation failed");',
    'return result.value;',
    '}'
  ].join('');
  return transformSync(source,{format:'esm',minify:true,target:'es2022'}).code;
}

module.exports={ordinaryFacade};
