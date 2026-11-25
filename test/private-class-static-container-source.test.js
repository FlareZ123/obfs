'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * Execute a CommonJS module and observe the exported class's native source.
 * Static initializers are part of Function#toString for the class constructor.
 * @param {string} code
 * @returns {{value:unknown,source:string}}
 */
function inspectOuter(code){
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:1000});
  const Outer=/** @type {Function & {value?:unknown}} */ (context.module.exports);
  return {
    value:Outer.value,
    source:Function.prototype.toString.call(Outer)
  };
}

const fixtures=[
  {
    label:'direct owner read in static block',
    code:[
      'class Outer{',
      '  static{',
      '    const owner={secretField:7};',
      '    this.value=owner.secretField;',
      '  }',
      '}',
      'module.exports=Outer;'
    ].join('\n')
  },
  {
    label:'direct owner read in static field initializer',
    code:[
      'const owner={secretField:7};',
      'class Outer{',
      '  static value=owner.secretField;',
      '}',
      'module.exports=Outer;'
    ].join('\n')
  },
  {
    label:'direct owner read in class-expression static block',
    code:[
      'const Outer=class Outer{',
      '  static{',
      '    const owner={secretField:7};',
      '    this.value=owner.secretField;',
      '  }',
      '};',
      'module.exports=Outer;'
    ].join('\n')
  },
  {
    label:'direct owner read in class-expression static field initializer',
    code:[
      'const owner={secretField:7};',
      'const Outer=class Outer{',
      '  static value=owner.secretField;',
      '};',
      'module.exports=Outer;'
    ].join('\n')
  }
];

for(const mode of /** @type {Array<'coo'|'sno'|'sco'>} */ (['coo','sno','sco'])){
  for(const fixture of fixtures){
    test(mode+' '+fixture.label+' must preserve exported outer class source',()=>{
      const native=inspectOuter(fixture.code);
      const result=obfuscateFiles([{
        path:'entry.cjs',sourceType:'commonjs',code:fixture.code
      }],{
        mode,seed:'class-source-static-container/'+mode+'/'+fixture.label,
        properties:true,identifiers:false,strings:false
      });
      const output=result.files.find(file=>file.path==='entry.cjs');
      assert.ok(output,'transformed CommonJS entry must remain present');
      const emitted=inspectOuter(String(output.code));
      assert.deepEqual(emitted,native,
        mode+'/'+fixture.label+': class source and behavior must remain identical');
      assert.equal(output.metrics.properties,0,
        mode+'/'+fixture.label+': owner reads inside observable class source must not be renamed');
    });
  }
}
