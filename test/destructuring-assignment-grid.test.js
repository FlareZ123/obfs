'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * Keep source and output execution realms independent; JSON rendering gives
 * a stable scalar representation for arrays from distinct VM contexts.
 * @param {string} source
 * @returns {string|undefined}
 */
function execute(source) {
  const context={module:{exports:null}};
  vm.runInNewContext(source,context,{timeout:1000});
  return JSON.stringify(context.module.exports);
}

/**
 * Build independently varied fixtures for each ownership-graph category.
 * The value names are deliberately unique across generated cases.
 * @param {number} seed
 * @param {number} style
 * @returns {string}
 */
function positive(seed,style) {
  const field='privateScore'+seed;
  const weight='cacheWeight'+seed;
  const value=(seed*37+11)%100000;
  const second=(seed*17+7)%100000;
  const firstValue=style===6?'['+value+','+second+']':String(value);
  const root='const root={'+field+':'+firstValue+','+weight+':'+second+'};';
  const access=style===1?'['+JSON.stringify('privateScore')+'+'+JSON.stringify(String(seed))+']':field;
  if(style===4) {
    return root+'function consume(value){let captured=0;({'+field+':captured}=value);return captured;}'+
      'module.exports=[consume(root),root.'+weight+'];';
  }
  if(style===5) {
    return root+'function forward(value){return value;}const alias=forward(root);'+
      'let captured=0;({'+field+':captured}=alias);module.exports=[captured,root.'+weight+'];';
  }
  if(style===7) {
    return root+'let first=0,second=0;({'+field+':first,'+weight+':second}=root);'+
      'module.exports=[first,second];';
  }
  const owner=style===2||style===3?'alias':'root';
  const prefix=style===2?'let alias=root;':style===3?'const middle=root;const alias=middle;':'';
  return root+prefix+'let captured=0;({'+access+':captured}='+owner+');'+
    'module.exports=['+(style===6?'captured[0]':'captured')+','+owner+'.'+weight+'];';
}

/**
 * Negative cases expose unproven ownership, side effects, or the assignment
 * expression's identity result. The compiler should decline key rewrites.
 * @param {number} seed
 * @param {number} style
 * @returns {string}
 */
function negative(seed,style) {
  const field='privateScore'+seed;
  const weight='cacheWeight'+seed;
  const value=(seed*37+11)%100000;
  const second=(seed*17+7)%100000;
  const firstValue=style===4?'['+value+','+second+']':String(value);
  const root='const root={'+field+':'+firstValue+','+weight+':'+second+'};';
  const init=root+'let captured=0;';
  switch(style) {
    case 0:
      return init+'const leaked=({'+field+':captured}=root);'+
        'module.exports=[captured,Object.keys(leaked)];';
    case 1:
      return init+'const leaked=true&&({'+field+':captured}=root);'+
        'module.exports=Object.keys(leaked);';
    case 2:
      return init+'({'+field+':captured=9}=root);module.exports=[captured,root.'+weight+'];';
    case 3:
      return init+'let rest;({'+field+':captured,...rest}=root);'+
        'module.exports=[captured,rest.'+weight+'];';
    case 4:
      return init+'({'+field+':[captured]}=root);module.exports=[captured,root.'+weight+'];';
    case 5:
      return init+'({[String('+JSON.stringify(field)+')]:captured}=root);'+
        'module.exports=[captured,root.'+weight+'];';
    case 6:
      return init+'({'+field+':captured}=root);'+
        'module.exports=[captured,JSON.stringify(root)];';
    default:
      return init+'let alias=root;({'+field+':alias}=root);'+
        'module.exports=[alias,root.'+weight+'];';
  }
}

test('256 deterministic local destructuring assignment flows rename own fields',()=>{
  let candidates=0;
  let covered=0;
  for(let seed=0;seed<32;seed++)for(let style=0;style<8;style++) {
    const original=positive(seed,style);
    const baseline=execute(original);
    for(const mode of /** @type {const} */ (['coo','sno'])) {
      const result=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:original}],{
        mode,seed:'assignment-grid-pos/'+seed+'/'+style,
        strings:false,identifiers:false
      }).files[0];
      assert.equal(execute(String(result.code)),baseline,
        'semantic difference seed='+seed+' style='+style+' mode='+mode);
      assert.equal(result.metrics.objects,1,
        'missed owner seed='+seed+' style='+style+' mode='+mode+': '+result.code);
      assert.equal(result.metrics.properties,2);
      candidates+=2;
      covered+=result.metrics.properties;
    }
  }
  assert.equal(candidates,1024);
  assert.equal(covered,1024);
});

test('256 deterministic ambiguous assignment flows refuse own-field renaming',()=>{
  let declined=0;
  for(let seed=0;seed<32;seed++)for(let style=0;style<8;style++) {
    const original=negative(seed,style);
    const baseline=execute(original);
    for(const mode of /** @type {const} */ (['coo','sno'])) {
      const result=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:original}],{
        mode,seed:'assignment-grid-negative/'+seed+'/'+style,
        strings:false,identifiers:false
      }).files[0];
      assert.equal(execute(String(result.code)),baseline,
        'semantic difference seed='+seed+' style='+style+' mode='+mode);
      assert.equal(result.metrics.objects,0,
        'unsafe key rename seed='+seed+' style='+style+' mode='+mode+': '+result.code);
      declined++;
    }
  }
  assert.equal(declined,512);
});
