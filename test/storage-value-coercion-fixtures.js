'use strict';

/** @type {Record<'ownToString'|'ownSymbolToPrimitive'|'directBypass',string>} */
const fixtures={
  ownToString:[
    'function inspect(){const privateLocal=29;return privateLocal;}',
    'function independent(){const independentLocal=7;return independentLocal;}',
    'let hookCalls=0;',
    'export function sample(){',
    '  inspect.toString=function(){',
    '    if(this!==inspect)throw new Error("wrong ToString receiver");',
    '    hookCalls++;',
    '    return "storage-own-toString-key";',
    '  };',
    '  localStorage.setItem(inspect,"value");',
    '  return {stored:localStorage.getItem("storage-own-toString-key"),',
    '    hookCalls,value:inspect(),independent:independent()};',
    '}'
  ].join('\n'),
  ownSymbolToPrimitive:[
    'function inspect(){const privateLocal=29;return privateLocal;}',
    'function independent(){const independentLocal=7;return independentLocal;}',
    'let observedHint="";',
    'let hookCalls=0;',
    'export function sample(){',
    '  inspect[Symbol.toPrimitive]=function(hint){',
    '    if(this!==inspect)throw new Error("wrong ToPrimitive receiver");',
    '    observedHint=hint;',
    '    hookCalls++;',
    '    return "storage-own-symbol-value";',
    '  };',
    '  sessionStorage.setItem("storage-own-symbol",inspect);',
    '  return {stored:sessionStorage.getItem("storage-own-symbol"),',
    '    hint:observedHint,hookCalls,value:inspect(),independent:independent()};',
    '}'
  ].join('\n'),
  directBypass:[
    'function inspect(){const privateLocal=29;return privateLocal;}',
    'function independent(){const independentLocal=7;return independentLocal;}',
    'let hookCalls=0;',
    'export function sample(){',
    '  inspect.toString=function(){hookCalls++;return "own-toString-must-not-run";};',
    '  const source=Function.prototype.toString.call(inspect);',
    '  localStorage.setItem("storage-direct-bypass",source);',
    '  return {stored:localStorage.getItem("storage-direct-bypass"),',
    '    hookCalls,value:inspect(),independent:independent()};',
    '}'
  ].join('\n')
};

module.exports={fixtures};
