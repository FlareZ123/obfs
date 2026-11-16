'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * Evaluate one ordered classic-script group in one shared browser-like realm.
 * @param {string[]} code
 * @returns {string}
 */
function run(code) {
  const context=vm.createContext({});
  for(const script of code)vm.runInContext(script,context,{timeout:1500});
  return JSON.stringify({first:context.first,second:context.second});
}

/**
 * Build a family of complete classic-script groups. The first three use
 * private, provably nonescaping owners. Other groups expose a deliberate
 * global, dynamic, reflective, or opaque-reader edge.
 *
 * @param {number} index
 * @returns {{name:string,code:string[],expected:number}[]}
 */
function families(index) {
  const field='secretKey'+index;
  const other='auxKey'+index;
  const value=17+(index*23)%97;
  const literal='{'+field+':'+value+','+other+':5}';
  const access='packet.'+field+'+packet.'+other;
  return [
    {name:'local-read',expected:2,code:[
      'function measure(){const packet='+literal+';return '+access+';}' +
        'globalThis.first=measure();',
      'globalThis.second=measure();'
    ]},
    {name:'block-read',expected:2,code:[
      '{const packet='+literal+';globalThis.first='+access+';}'
    ]},
    {name:'owned-alias',expected:2,code:[
      'function measure(){const packet='+literal+';const alias=packet;' +
        'return alias.'+field+'+alias.'+other+';}' +
        'globalThis.first=measure();'
    ]},
    {name:'global-lexical',expected:0,code:[
      'const packet='+literal+';globalThis.first='+access+';',
      'globalThis.second=packet.'+field+';'
    ]},
    {name:'computed-host',expected:0,code:[
      'globalThis.hostKey='+JSON.stringify(field)+';',
      'function measure(){const packet='+literal+';return packet[globalThis.hostKey];}' +
        'globalThis.first=measure();'
    ]},
    {name:'external-reader',expected:0,code:[
      'globalThis.bridge={read(packet){return packet.'+field+';}};',
      'function measure(){const packet='+literal+';return globalThis.bridge.read(packet);}' +
        'globalThis.first=measure();'
    ]},
    {name:'reflective-shape',expected:0,code:[
      'function measure(){const packet='+literal+';' +
        'return Object.keys(packet).join(",");}globalThis.first=measure();'
    ]},
    {name:'mutable-global-forwarder',expected:0,code:[
      'function identity(x){return x;}' +
        'function measure(){const packet='+literal+';const alias=identity(packet);' +
        'return alias.'+field+';}globalThis.first=measure();',
      'identity=x=>({'+field+':99});globalThis.second=measure();'
    ]},
    {name:'mutable-global-reader',expected:0,code:[
      'function peek(x){return x.'+field+';}' +
        'function measure(){const packet='+literal+';return peek(packet);}' +
        'globalThis.first=measure();',
      'peek=x=>x.'+field+'+10;globalThis.second=measure();'
    ]}
  ];
}

test('270 generated ordered classic-script graphs match native execution and proof coverage',()=>{
  let accepted=0,refused=0;
  for(let trial=0;trial<30;trial++) {
    for(const graph of families(trial)) {
      const files=graph.code.map((code,index)=>({
        path:'classic-'+index+'.js',sourceType:/** @type {const} */ ('script'),code
      }));
      const compiled=obfuscateFiles(files,{
        mode:'coo',closedWorld:true,seed:'classic-grid-'+trial,
        strings:false,identifiers:false
      });
      const count=compiled.files.reduce((sum,file)=>sum+file.metrics.properties,0);
      assert.equal(count,graph.expected,trial+' '+graph.name);
      const actual=run(compiled.files.map(file=>/** @type {string} */ (file.code)));
      const expected=run(graph.code);
      assert.equal(actual,expected,trial+' '+graph.name);
      if(count)accepted++;
      else refused++;
    }
  }
  assert.equal(accepted,90);
  assert.equal(refused,180);
});
