'use strict';

const {createHash} = require('node:crypto');
const {applyEdits,parserContractIdFor} = require('./ast');

/** SourceEditMap objects are process-local capabilities, not structural records. */
/** @type {WeakSet<object>} */
const issuedSourceEditMaps = new WeakSet();

/** @typedef {'before-node'|'after-node'|'within-node'|'unknown'} InsertionAffinity */
/**
 * @typedef {Object} SourceEdit
 * @property {number} start Original UTF-16 start offset.
 * @property {number} end Original UTF-16 end offset.
 * @property {string} text Replacement or inserted source text.
 * @property {InsertionAffinity} [affinity] Use before-node at a span start and after-node at its end.
 * @property {string} [syntheticOriginId] Stable provenance for generated source.
 */
/**
 * @typedef {Object} SourceEditSegment
 * @property {number} fromStart
 * @property {number} fromEnd
 * @property {number} toStart
 * @property {number} toEnd
 * @property {'unchanged'|'replaced'|'deleted'|'inserted'} kind
 * @property {InsertionAffinity|null} affinity
 * @property {string|null} syntheticOriginId
 */
/**
 * A positional map between two exact generations of one source unit.
 * It does not prove binding, call-target, value-flow, or host-effect preservation.
 * @typedef {Object} SourceEditMap
 * @property {string} sourceUnitRef Opaque SourceUnitRefKey, not a path-only identity.
 * @property {string} parserContractId Parser version and exact parse-option identity.
 * @property {string} fromGeneration
 * @property {string} toGeneration
 * @property {'utf16-code-unit'} coordinateUnit
 * @property {number} fromLength
 * @property {number} toLength
 * @property {ReadonlyArray<SourceEditSegment>} segments
 */
/**
 * @typedef {Object} SourceSpanRef
 * @property {string} spanId
 * @property {string} sourceUnitRef
 * @property {string} sourceGeneration
 * @property {number} startOffset
 * @property {number} endOffset
 * @property {'utf16-code-unit'} coordinateUnit
 * @property {string|null} astNodeType
 */
/**
 * A relocated range only. It is not a new SourceSpanRef until the current
 * source is reparsed and the AST node and semantic graph identities are rebuilt.
 * @typedef {Object} MappedSourceRange
 * @property {string} sourceUnitRef
 * @property {string} sourceGeneration
 * @property {string} originSpanId Immutable original SourceSpanId association.
 * @property {number} startOffset
 * @property {number} endOffset
 * @property {'utf16-code-unit'} coordinateUnit
 */

/**
 * SHA-256 identity of exact JavaScript UTF-16 code units plus the parser
 * contract. This is lossless for the parser's actual string input, including
 * isolated surrogates. Raw file bytes/decoder identity remain separate.
 * @param {string} source
 * @param {string} parserContractId
 * @returns {string}
 */
function sourceGenerationOf(source,parserContractId) {
  if(typeof source!=='string')throw new TypeError('source must be a string');
  if(typeof parserContractId!=='string'||parserContractId.length===0) {
    throw new TypeError('parserContractId must be a non-empty string');
  }
  return createHash('sha256').update(parserContractId,'utf8').update('\0')
    .update(source,'utf16le').digest('hex');
}

/**
 * Apply the repository's existing edit semantics and return a source-unit-
 * and-generation-qualified positional map. Same-offset insertions retain the
 * exact ordering of applyEdits. An insertion at a protected span's start is
 * safe only when explicitly marked before-node; unknown affinity fails closed.
 *
 * @param {string} source
 * @param {SourceEdit[]} edits
 * @param {string} sourceUnitRef Opaque SourceUnitRefKey for this module instance/response.
 * @param {string} parserContractId Parser version, source type and parse options.
 * @returns {{code:string,map:SourceEditMap}}
 */
function applyEditsWithMap(source,edits,sourceUnitRef,parserContractId) {
  if(typeof source!=='string')throw new TypeError('source must be a string');
  if(!Array.isArray(edits))throw new TypeError('edits must be an array');
  if(typeof sourceUnitRef!=='string'||sourceUnitRef.length===0) {
    throw new TypeError('sourceUnitRef must be a non-empty string');
  }
  if(typeof parserContractId!=='string'||parserContractId.length===0) {
    throw new TypeError('parserContractId must be a non-empty string');
  }
  const normalized=edits.map((edit,ordinal)=>{
    if(!edit||typeof edit!=='object')throw new TypeError('edit must be an object');
    if(!Number.isInteger(edit.start)||!Number.isInteger(edit.end)||
       edit.start<0||edit.end<edit.start||edit.end>source.length) {
      throw new RangeError('Invalid edit at '+edit.start+':'+edit.end);
    }
    if(typeof edit.text!=='string')throw new TypeError('edit.text must be a string');
    if(edit.affinity!==undefined&&
       !['before-node','after-node','within-node','unknown'].includes(edit.affinity)) {
      throw new TypeError('Invalid insertion affinity');
    }
    if(edit.syntheticOriginId!==undefined&&
       (typeof edit.syntheticOriginId!=='string'||edit.syntheticOriginId.length===0)) {
      throw new TypeError('syntheticOriginId must be a non-empty string');
    }
    return {
      start:edit.start,end:edit.end,text:edit.text,ordinal,
      affinity:edit.affinity??'unknown',
      syntheticOriginId:edit.syntheticOriginId??null
    };
  });

  // Preserve applyEdits' overlap/range contract and exact output behavior.
  const code=applyEdits(source,normalized);
  const effective=normalized.filter(edit=>
    edit.text!==source.slice(edit.start,edit.end));
  /** @type {Array<{start:number,edits:typeof effective}>} */
  const groups=[];
  for(const edit of effective.sort((a,b)=>
    a.start-b.start||a.end-b.end||a.ordinal-b.ordinal)) {
    const last=groups[groups.length-1];
    if(last&&last.start===edit.start)last.edits.push(edit);
    else groups.push({start:edit.start,edits:[edit]});
  }

  /** @type {string[]} */
  const parts=[];
  /** @type {SourceEditSegment[]} */
  const segments=[];
  let cursor=0;
  let outputOffset=0;
  for(const group of groups) {
    if(group.start<cursor)throw new RangeError('Overlapping edits');
    const unchanged=source.slice(cursor,group.start);
    if(unchanged.length) {
      parts.push(unchanged);
      segments.push({
        fromStart:cursor,fromEnd:group.start,
        toStart:outputOffset,toEnd:outputOffset+unchanged.length,
        kind:'unchanged',affinity:null,syntheticOriginId:null
      });
      outputOffset+=unchanged.length;
    }

    // applyEdits applies same-offset edits in ascending input order at the
    // same index, so their final output order is the reverse input order.
    const insertions=group.edits.filter(edit=>edit.start===edit.end)
      .sort((a,b)=>b.ordinal-a.ordinal);
    for(const edit of insertions) {
      if(!edit.text.length)continue;
      parts.push(edit.text);
      segments.push({
        fromStart:edit.start,fromEnd:edit.end,
        toStart:outputOffset,toEnd:outputOffset+edit.text.length,
        kind:'inserted',affinity:edit.affinity,
        syntheticOriginId:edit.syntheticOriginId
      });
      outputOffset+=edit.text.length;
    }

    const replacements=group.edits.filter(edit=>edit.end>edit.start);
    if(replacements.length>1)throw new RangeError('Overlapping edits');
    const replacement=replacements[0];
    if(replacement) {
      parts.push(replacement.text);
      segments.push({
        fromStart:replacement.start,fromEnd:replacement.end,
        toStart:outputOffset,toEnd:outputOffset+replacement.text.length,
        kind:replacement.text.length?'replaced':'deleted',
        affinity:null,syntheticOriginId:replacement.syntheticOriginId
      });
      outputOffset+=replacement.text.length;
      cursor=replacement.end;
    } else {
      cursor=group.start;
    }
  }
  const tail=source.slice(cursor);
  if(tail.length) {
    parts.push(tail);
    segments.push({
      fromStart:cursor,fromEnd:source.length,
      toStart:outputOffset,toEnd:outputOffset+tail.length,
      kind:'unchanged',affinity:null,syntheticOriginId:null
    });
    outputOffset+=tail.length;
  }
  const mappedCode=parts.join('');
  if(mappedCode!==code) {
    throw new Error('Source edit map output disagrees with applyEdits');
  }

  const frozenSegments=Object.freeze(segments.map(segment=>
    Object.freeze({...segment})));
  const map=Object.freeze({
    sourceUnitRef,
    parserContractId,
    fromGeneration:sourceGenerationOf(source,parserContractId),
    toGeneration:sourceGenerationOf(code,parserContractId),
    coordinateUnit:'utf16-code-unit',
    fromLength:source.length,
    toLength:code.length,
    segments:frozenSegments
  });
  issuedSourceEditMaps.add(map);
  return {code,map};
}

/**
 * Map an original-generation source span through one exact pass. The caller
 * must supply both adjacent source generations. The result is only a relocated
 * range: reparse the current source, rebuild SourceSpanRef, and separately
 * prove or invalidate semantic graph identities affected by the pass.
 *
 * @param {SourceEditMap} map
 * @param {SourceSpanRef} span
 * @param {string} sourceBefore
 * @param {string} sourceAfter
 * @returns {MappedSourceRange|null}
 */
function mapSourceSpan(map,span,sourceBefore,sourceAfter) {
  if(!map||!issuedSourceEditMaps.has(map)||map.coordinateUnit!=='utf16-code-unit'||
     !span||typeof span!=='object'||
     span.coordinateUnit!=='utf16-code-unit'||
     typeof sourceBefore!=='string'||typeof sourceAfter!=='string')return null;
  if(typeof span.spanId!=='string'||span.spanId.length===0||
     span.sourceUnitRef!==map.sourceUnitRef||
     span.sourceGeneration!==map.fromGeneration||
     sourceGenerationOf(sourceBefore,map.parserContractId)!==map.fromGeneration||
     sourceGenerationOf(sourceAfter,map.parserContractId)!==map.toGeneration||
     sourceBefore.length!==map.fromLength||sourceAfter.length!==map.toLength||
     !Number.isInteger(span.startOffset)||!Number.isInteger(span.endOffset)||
     span.startOffset<0||span.endOffset<span.startOffset||
     span.endOffset>sourceBefore.length)return null;

  for(const segment of map.segments) {
    if(segment.kind==='replaced'||segment.kind==='deleted') {
      if(segment.fromStart<span.endOffset&&segment.fromEnd>span.startOffset)return null;
    } else if(segment.kind==='inserted') {
      if(span.startOffset<segment.fromStart&&segment.fromStart<span.endOffset)return null;
      if(segment.fromStart===span.startOffset&&segment.affinity!=='before-node')return null;
      if(segment.fromStart===span.endOffset&&segment.affinity!=='after-node')return null;
    }
  }

  /**
   * Map an original offset. Insertions at the boundary use left/right affinity;
   * replacement interiors have no exact image.
   * @param {number} offset
   * @param {'left'|'right'} bias
   * @returns {number|null}
   */
  function mapOffset(offset,bias) {
    const insertions=map.segments.filter(segment=>
      segment.kind==='inserted'&&segment.fromStart===offset);
    if(insertions.length) {
      return bias==='left'?
        Math.min(...insertions.map(segment=>segment.toStart)):
        Math.max(...insertions.map(segment=>segment.toEnd));
    }
    for(const segment of map.segments) {
      if(segment.kind==='unchanged'&&
         offset>=segment.fromStart&&offset<=segment.fromEnd) {
        return segment.toStart+(offset-segment.fromStart);
      }
      if(segment.kind==='replaced'||segment.kind==='deleted') {
        if(offset>segment.fromStart&&offset<segment.fromEnd)return null;
        if(offset===segment.fromStart)return segment.toStart;
        if(offset===segment.fromEnd)return segment.toEnd;
      }
    }
    let delta=0;
    for(const segment of map.segments) {
      if(segment.kind==='inserted'&&segment.fromStart<offset) {
        delta+=segment.toEnd-segment.toStart;
      } else if((segment.kind==='replaced'||segment.kind==='deleted')&&
                segment.fromEnd<=offset) {
        delta+=(segment.toEnd-segment.toStart)-
          (segment.fromEnd-segment.fromStart);
      }
    }
    return offset+delta;
  }

  const start=mapOffset(span.startOffset,'right');
  const end=span.startOffset===span.endOffset?start:mapOffset(span.endOffset,'left');
  if(start===null||end===null||end<start)return null;
  if(sourceBefore.slice(span.startOffset,span.endOffset)!==
     sourceAfter.slice(start,end))return null;
  return Object.freeze({
    sourceUnitRef:span.sourceUnitRef,
    sourceGeneration:map.toGeneration,
    originSpanId:span.spanId,
    startOffset:start,
    endOffset:end,
    coordinateUnit:'utf16-code-unit'
  });
}


/**
 * Map an already relocated range through the next sequential pass. The
 * original SourceSpanRef remains immutable; only this current-generation
 * range advances, retaining the original span ID as provenance.
 *
 * @param {SourceEditMap} map
 * @param {MappedSourceRange} range
 * @param {string} sourceBefore
 * @param {string} sourceAfter
 * @returns {MappedSourceRange|null}
 */
function mapMappedSourceRange(map,range,sourceBefore,sourceAfter) {
  if(!range||typeof range.originSpanId!=='string'||range.originSpanId.length===0) {
    return null;
  }
  return mapSourceSpan(map,{
    spanId:range.originSpanId,
    sourceUnitRef:range.sourceUnitRef,
    sourceGeneration:range.sourceGeneration,
    startOffset:range.startOffset,
    endOffset:range.endOffset,
    coordinateUnit:range.coordinateUnit,
    astNodeType:null
  },sourceBefore,sourceAfter);
}

module.exports={parserContractIdFor,sourceGenerationOf,applyEditsWithMap,mapSourceSpan,mapMappedSourceRange};
