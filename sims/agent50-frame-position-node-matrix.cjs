'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');

/** Exact copy of the candidate's UTF-16/line/code-point position helper. */
function framePositionOf(source,offset) {
  if(typeof source!=='string'||!Number.isInteger(offset)||offset<0||offset>source.length)return null;
  let line=1,columnUtf16=1,columnCodePoints=1;
  for(let index=0;index<offset;index++) {
    const code=source.charCodeAt(index);
    if(code===0x0d) {
      if(index+1<offset&&source.charCodeAt(index+1)===0x0a)index++;
      line++;
      columnUtf16=1;
      columnCodePoints=1;
    } else if(code===0x0a||code===0x2028||code===0x2029) {
      line++;
      columnUtf16=1;
      columnCodePoints=1;
    } else {
      columnUtf16++;
      if(code>=0xdc00&&code<=0xdfff&&index>0) {
        const previous=source.charCodeAt(index-1);
        if(previous>=0xd800&&previous<=0xdbff)continue;
      }
      columnCodePoints++;
    }
  }
  return {line,columnUtf16,columnCodePoints};
}

const cases=[
  ['ascii',"function observed(){return 29;}\nfunction reader(){return Function.prototype.toString.call(observed);}"],
  ['astral-before',"function observed(){return 29;}\nfunction reader(){const emoji='😀';return Function.prototype.toString.call(observed);}"],
  ['bmp-before',"function observed(){return 29;}\nfunction reader(){const symbol='é';return Function.prototype.toString.call(observed);}"],
  ['crlf-astral',"function observed(){return 29;}\r\nfunction reader(){const emoji='😀';return Function.prototype.toString.call(observed);}"],
  ['u2028-astral',"function observed(){return 29;}\u2028function reader(){const emoji='😀';return Function.prototype.toString.call(observed);}"],
  ['u2029-astral',"function observed(){return 29;}\u2029function reader(){const emoji='😀';return Function.prototype.toString.call(observed);}"],
  ['multiline-crlf',"function observed(){return 29;}\r\nfunction reader(){\r\n  const emoji='😀';\r\n  return Function.prototype.toString.call(observed);\r\n}"]
];

const originalToString=Function.prototype.toString;
const originalPrepareStackTrace=Error.prepareStackTrace;
const results=[];
try {
  for(const [name,source] of cases) {
    vm.runInThisContext(source+'\nglobalThis.__agent50Reader=reader;',{
      filename:'agent50-frame-position-'+name+'.js'
    });
    Function.prototype.toString=function() {
      const previous=Error.prepareStackTrace;
      Error.prepareStackTrace=(_error,stack)=>stack;
      try {
        const frame=new Error().stack.find(item=>item.getFunctionName()==='reader');
        assert.ok(frame,'reader CallSite must be present');
        return JSON.stringify({line:frame.getLineNumber(),column:frame.getColumnNumber()});
      } finally {
        Error.prepareStackTrace=previous;
      }
    };
    try {
      const observed=JSON.parse(globalThis.__agent50Reader());
      // Acorn's MemberExpression.property.start points at the identifier call,
      // one UTF-16 code unit after the dot in .call.
      const readerFrameOffset=source.indexOf('.call')+1;
      assert.ok(readerFrameOffset>0,'direct Function#toString.call reader must exist');
      const predicted=framePositionOf(source,readerFrameOffset);
      assert.deepEqual(observed,{line:predicted.line,column:predicted.columnUtf16});
      const lastLineBreak=Math.max(source.lastIndexOf('\n',readerFrameOffset),
        source.lastIndexOf('\r',readerFrameOffset),source.lastIndexOf('\u2028',readerFrameOffset),
        source.lastIndexOf('\u2029',readerFrameOffset));
      const astralBefore=source.indexOf('😀')>=0&&source.indexOf('😀')<readerFrameOffset&&
        source.indexOf('😀')>lastLineBreak;
      if(astralBefore)assert.ok(predicted.columnUtf16>predicted.columnCodePoints);
      results.push({name,observed,predicted,match:true});
    } finally {
      Function.prototype.toString=originalToString;
      Error.prepareStackTrace=originalPrepareStackTrace;
      delete globalThis.__agent50Reader;
    }
  }
} finally {
  Function.prototype.toString=originalToString;
  Error.prepareStackTrace=originalPrepareStackTrace;
  delete globalThis.__agent50Reader;
}

process.stdout.write(JSON.stringify({node:process.version,cases:results.length,results})+'\n');
