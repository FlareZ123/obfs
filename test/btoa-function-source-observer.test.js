'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * btoa() performs String(value), which can expose the exact source of a
 * function without any explicit .toString() member access. Both modern
 * Node.js and browsers provide this web-compatible global.
 *
 * @param {string} source
 * @returns {string}
 */
function execute(source) {
  const context=vm.createContext({module:{exports:null},btoa});
  vm.runInContext(source,context,{timeout:2500});
  return String(context.module.exports);
}

/** @type {{label:string,source:string}[]} */
const sources=[
  {
    label:'direct btoa(function) source',
    source:"'use strict';function inspect(){return 'original-function-source-ABC123';}"+
      "module.exports=btoa(inspect);"
  },
  {
    label:'detached btoa alias source',
    source:"'use strict';const binaryEncode=btoa;"+
      "function inspect(){return 'original-function-source-ABC123';}"+
      "module.exports=binaryEncode(inspect);"
  },
  {
    label:'btoa in nested direct call',
    source:"'use strict';function inspect(){return 'original-function-source-ABC123';}"+
      "function observer(){return btoa(inspect);}module.exports=observer();"
  },
  {
    label:'globalThis.btoa(function) source',
    source:"'use strict';function inspect(){return 'original-function-source-ABC123';}"+
      "module.exports=globalThis.btoa(inspect);"
  },
  {
    label:'btoa.call receiver source',
    source:"'use strict';function inspect(){return 'original-function-source-ABC123';}"+
      "module.exports=btoa.call(null,inspect);"
  },
  {
    label:'btoa.apply receiver source',
    source:"'use strict';function inspect(){return 'original-function-source-ABC123';}"+
      "module.exports=btoa.apply(null,[inspect]);"
  },
  {
    label:'detached globalThis.btoa alias',
    source:"'use strict';const binaryEncode=globalThis.btoa;"+
      "function inspect(){return 'original-function-source-ABC123';}"+
      "module.exports=binaryEncode(inspect);"
  }
];

for(const mode of /** @type {const} */(['sno','coo','sco'])) {
  for(const {label,source} of sources) {
    test(mode+' preserves exact native function source through '+label,()=>{
      const transformed=obfuscateFiles([
        {path:'entry.cjs',sourceType:'commonjs',code:source}
      ],{
        mode,seed:'btoa-source-parity/'+mode+'/'+label,
        strings:true,identifiers:false,properties:false
      }).files[0];
      const observed=execute(String(transformed.code));
      assert.equal(observed,execute(source),
        'Native btoa must see the exact original function source');
    });
  }

  test(mode+' retains string-protection yield without a source observer',()=>{
    const source="'use strict';function privateFunction(){"+
      "return 'unobserved-private-literal-ABC123';}"+
      "module.exports=privateFunction();";
    const transformed=obfuscateFiles([
      {path:'private.cjs',sourceType:'commonjs',code:source}
    ],{
      mode,seed:'btoa-source-private-positive/'+mode,
      strings:true,identifiers:false,properties:false
    }).files[0];
    assert.equal(execute(String(transformed.code)),execute(source));
    assert.ok(transformed.metrics.literals>0,
      'Unobserved private work should remain eligible for transformation');
  });
}

for(const mode of /** @type {const} */(['sno','coo','sco'])) {
  test(mode+' keeps btoa primitive-string input eligible for encoding',()=>{
    const source="'use strict';module.exports=btoa('safe-ordinary-string-for-encoding-123456');";
    const transformed=obfuscateFiles([
      {path:'primitive.cjs',sourceType:'commonjs',code:source}
    ],{
      mode,seed:'btoa-primitive-positive/'+mode,
      strings:true,identifiers:false,properties:false
    }).files[0];
    assert.equal(execute(String(transformed.code)),execute(source));
    assert.ok(transformed.metrics.literals>0,
      'A primitive btoa argument cannot expose function source');
  });
}
