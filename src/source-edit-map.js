'use strict';

const {createHash} = require('node:crypto');
const {applyEdits} = require('./ast');

/** @typedef {'before-node'|'within-node'|'unknown'} InsertionAffinity */
/**
 * @typedef {Object} SourceEdit
 * @property {number} start Original UTF-16 start offset.
 * @property {number} end Original UTF-16 end offset.
 * @property {string} text Replacement or inserted source text.
 * @property {InsertionAffinity} [affinity] Required to preserve a span when inserting exactly at its start.
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
 * @property {string} sourceUnitRef
 * @property {string} fromGeneration
 * @property {string} toGeneration
 * @property {'utf16-code-unit'} coordinateUnit
 * @property {number} fromLength
 * @property {number} toLength
 * @property {ReadonlyArray<SourceEditSegment>} segments
 */
/**
 * @typedef {Object} SourceSpanRef
 * @property {string} sourceUnitRef
 * @property {string} sourceGeneration
 * @property {number} start
 * @property {number} end
 */

/**
 * SHA-256 identity of exact UTF-8 source text. AST offsets remain UTF-16
 * code units; the digest is only the generation identity.
 * @param {string} source
 * @returns {string}
 */
function sourceGenerationOf(source) {
  if(typeof source!=='string')throw new TypeError('source must be a string');
  return createHash('sha256').update(source,'utf8').digest('hex');
}

/**
 * Apply the repository's existing edit semantics and return a source-unit-
 * and-generation-qualified positional map. Same-offset insertions retain the
 * exact ordering of applyEdits. An insertion at a protected span's start is
 * safe only when explicitly marked before-node; unknown affinity fails closed.
 *
 * @param {string} source
 * @param {SourceEdit[]} edits
 * @param {string} sourceUnitRef Stable source-unit key, normally the normalized file path.
 * @returns {{code:string,map:SourceEditMap}}
 */
function applyEditsWithMap(source,edits,sourceUnitRef) {
  if(typeof source!=='string')throw new TypeError('source must be a string');
  if(!Array.isArray(edits))throw new TypeError('edits must be an array');
  if(typeof sourceUnitRef!=='string'||sourceUnitRef.length===0) {
    throw new TypeError('sourceUnitRef must be a non-empty string');
  }
  const normalized=edits.map((edit,ordinal)=>{
    if(!edit||typeof edit!=='object')throw new TypeError('edit must be an object');
    if(!Number.isInteger(edit.start)||!Number.isInteger(edit.end)||
       edit.start<0||edit.end<edit.start||edit.end>source.length) {
      throw new RangeError('Invalid edit at '+edit.start+':'+edit.end);
    }
    if(typeof edit.text!=='string')throw new TypeError('edit.text must be a string');
    if(edit.affinity!==undefined&&
       !['before-node','within-node','unknown'].includes(edit.affinity)) {
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
    fromGeneration:sourceGenerationOf(source),
    toGeneration:sourceGenerationOf(code),
    coordinateUnit:'utf16-code-unit',
    fromLength:source.length,
    toLength:code.length,
    segments:frozenSegments
  });
  return {code,map};
}

/**
 * Map an original-generation source span through one exact pass. The caller
 * must supply both adjacent source generations. Positional identity alone is
 * insufficient: consumers must separately prove or invalidate semantic graph
 * identities affected by the pass.
 *
 * @param {SourceEditMap} map
 * @param {SourceSpanRef} span
 * @param {string} sourceBefore
 * @param {string} sourceAfter
 * @returns {SourceSpanRef|null}
 */
function mapSourceSpan(map,span,sourceBefore,sourceAfter) {
  if(!map||map.coordinateUnit!=='utf16-code-unit'||
     !span||typeof span!=='object'||
     typeof sourceBefore!=='string'||typeof sourceAfter!=='string')return null;
  if(span.sourceUnitRef!==map.sourceUnitRef||
     span.sourceGeneration!==map.fromGeneration||
     sourceGenerationOf(sourceBefore)!==map.fromGeneration||
     sourceGenerationOf(sourceAfter)!==map.toGeneration||
     sourceBefore.length!==map.fromLength||sourceAfter.length!==map.toLength||
     !Number.isInteger(span.start)||!Number.isInteger(span.end)||
     span.start<0||span.end<span.start||span.end>sourceBefore.length)return null;

  for(const segment of map.segments) {
    if(segment.kind==='replaced'||segment.kind==='deleted') {
      if(segment.fromStart<span.end&&segment.fromEnd>span.start)return null;
    } else if(segment.kind==='inserted') {
      if(span.start<segment.fromStart&&segment.fromStart<span.end)return null;
      if(segment.fromStart===span.start&&segment.affinity!=='before-node')return null;
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

  const start=mapOffset(span.start,'right');
  const end=mapOffset(span.end,'left');
  if(start===null||end===null||end<start)return null;
  if(sourceBefore.slice(span.start,span.end)!==
     sourceAfter.slice(start,end))return null;
  return Object.freeze({
    sourceUnitRef:span.sourceUnitRef,
    sourceGeneration:map.toGeneration,
    start,end
  });
}

module.exports={sourceGenerationOf,applyEditsWithMap,mapSourceSpan};
