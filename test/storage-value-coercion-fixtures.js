'use strict';

/** @type {Record<'ownToString'|'ownSymbolToPrimitive'|'directBypass',string>} */
const fixtures={
  ownToString:[
    'function inspect(){const privateLocal=29;return privateLocal;}',
    'function independent(){const independentLocal=7;return independentLocal;}',
    'let hookCalls=0;',
    'let receiverMatched=false;',
    'export function sample(){',
    '  inspect.toString=function(){',
    '    receiverMatched=this===inspect;',
    '    hookCalls++;',
    '    return receiverMatched?"storage-own-toString-key":"wrong-receiver";',
    '  };',
    '  localStorage.setItem(inspect,"value");',
    '  return {stored:localStorage.getItem("storage-own-toString-key"),',
    '    hookCalls,receiverMatched,value:inspect(),independent:independent()};',
    '}'
  ].join('\n'),
  ownSymbolToPrimitive:[
    'function inspect(){const privateLocal=29;return privateLocal;}',
    'function independent(){const independentLocal=7;return independentLocal;}',
    'let observedHint="";',
    'let hookCalls=0;',
    'let receiverMatched=false;',
    'export function sample(){',
    '  inspect[Symbol.toPrimitive]=function(hint){',
    '    observedHint=hint;',
    '    receiverMatched=this===inspect;',
    '    hookCalls++;',
    '    return receiverMatched?"storage-own-symbol-value":"wrong-receiver";',
    '  };',
    '  sessionStorage.setItem("storage-own-symbol",inspect);',
    '  return {stored:sessionStorage.getItem("storage-own-symbol"),',
    '    hint:observedHint,hookCalls,receiverMatched,value:inspect(),independent:independent()};',
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
