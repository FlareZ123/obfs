'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src/core');
const {neutralizeHashedNames}=require('../sims/offline-normalize');

/** @param {string} source @returns {string} */
function run(source){
  const context=vm.createContext({module:{exports:undefined}});
  vm.runInContext(source,context,{timeout:2000});
  return JSON.stringify(context.module.exports);
}

for(const name of ['read','toString','valueOf']){
  const privateSource=[
    "'use strict';",
    'const owner={'+name+':23,secretBias:7};',
    'class Reader{'+name+'(){return owner.'+name+';}}',
    'const instance=new Reader();',
    'module.exports=instance.'+name+'()+owner.secretBias;'
  ].join('\n');
  const visibleSource=[
    "'use strict';",
    'const owner={'+name+':23,secretBias:7};',
    'class Reader{'+name+'(){return owner.'+name+';}}',
    'const instance=new Reader();',
    'module.exports=[instance.'+name+'()+owner.secretBias,Reader.prototype.'+name+'.toString()];'
  ].join('\n');
  for(const mode of /** @type {const} */ (['coo','sno','sco'])){
    test(mode+': private method/owner field spelling collision '+name,()=>{
      const generated=obfuscateFiles([{
        path:'entry.cjs',sourceType:'commonjs',code:privateSource
      }],{mode,seed:'private-class-owner-method-name/'+name+'/'+mode,
        properties:true,identifiers:false,strings:false}).files[0];
      assert.equal(generated.metrics.properties,2,
        'Only private owner fields are renamed; class method remains callable');
      assert.match(/** @type {string} */ (generated.code),
        new RegExp('class Reader\\{'+name+'\\(','u'),
        'Method spelling remains a native class method name');
      assert.equal(run(/** @type {string} */ (generated.code)),run(privateSource));
      const recovered=neutralizeHashedNames([{
        path:'entry.cjs',sourceType:'commonjs',code:/** @type {string} */(generated.code)
      }]);
      assert.equal(recovered.properties,2);
      assert.equal(run(recovered.files[0].code),run(privateSource));
    });
    test(mode+': visible class method source refuses colliding own keys '+name,()=>{
      const generated=obfuscateFiles([{
        path:'entry.cjs',sourceType:'commonjs',code:visibleSource
      }],{mode,seed:'visible-private-owner-method-name/'+name+'/'+mode,
        properties:true,identifiers:false,strings:false}).files[0];
      assert.equal(generated.metrics.properties,0);
      assert.equal(run(/** @type {string} */ (generated.code)),run(visibleSource));
    });
  }
}
