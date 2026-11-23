'use strict';

/**
 * @typedef {{start:number,end:number,text:string}} TextEdit
 * @typedef {{start:number,end:number}} SourceSpan
 * @typedef {'left'|'right'} BoundaryBias
 * @typedef {TextEdit & {newStart:number,newEnd:number,delta:number}} MappedEdit
 * @typedef {{
 *   output:string,
 *   edits:ReadonlyArray<MappedEdit>,
 *   mapOffset:(offset:number,bias?:BoundaryBias)=>number|null,
 *   preservesSpan:(span:SourceSpan)=>boolean,
 *   mapSpan:(span:SourceSpan)=>SourceSpan|null
 * }} Utf16EditMap
 */

/** @param {number} value @param {number} limit @param {string} label */
function assertOffset(value,limit,label) {
  if(!Number.isInteger(value)||value<0||value>limit){
    throw new RangeError(label+' must be an integer UTF-16 offset within the source');
  }
}

/** @param {SourceSpan} span @param {number} length */
function assertSpan(span,length) {
  if(!span||typeof span!=='object')throw new TypeError('span must be an object');
  assertOffset(span.start,length,'span.start');
  assertOffset(span.end,length,'span.end');
  if(span.end<span.start)throw new RangeError('span.end must not precede span.start');
}

/**
 * Apply non-overlapping edits and retain a composable map from original UTF-16
 * code-unit offsets to offsets in the rewritten source. An offset strictly
 * inside replaced source has no image and maps to null. For zero-width
 * insertions, left bias maps before inserted text and right bias after it.
 *
 * A preserved half-open span [start,end) maps its start with right bias and
 * its end with left bias: insertions at the boundaries are therefore outside
 * the span, while insertions or replacements in its interior invalidate it.
 *
 * @param {string} source
 * @param {TextEdit[]} edits
 * @returns {Utf16EditMap}
 */
function applyEditsWithMap(source,edits) {
  if(typeof source!=='string')throw new TypeError('source must be a string');
  if(!Array.isArray(edits))throw new TypeError('edits must be an array');
  /** @type {Array<TextEdit & {ordinal:number}>} */
  const sorted=edits.map((edit,ordinal)=>{
    if(!edit||typeof edit!=='object')throw new TypeError('edit must be an object');
    assertOffset(edit.start,source.length,'edit.start');
    assertOffset(edit.end,source.length,'edit.end');
    if(edit.end<edit.start)throw new RangeError('edit.end must not precede edit.start');
    if(typeof edit.text!=='string')throw new TypeError('edit.text must be a string');
    return {start:edit.start,end:edit.end,text:edit.text,ordinal};
  }).filter(edit=>edit.text!==source.slice(edit.start,edit.end))
    .sort((a,b)=>a.start-b.start||a.end-b.end||a.ordinal-b.ordinal);

  /** @type {TextEdit|null} */
  let previous=null;
  for(const edit of sorted){
    if(previous&&edit.start<previous.end){
      throw new RangeError('Overlapping edits at '+previous.start+':'+previous.end+
        ' and '+edit.start+':'+edit.end);
    }
    if(previous&&edit.start===previous.start){
      throw new RangeError('Multiple edits at one source offset are ambiguous');
    }
    previous=edit;
  }

  /** @type {string[]} */
  const parts=[];
  /** @type {MappedEdit[]} */
  const mapped=[];
  let cursor=0;
  let delta=0;
  for(const edit of sorted){
    parts.push(source.slice(cursor,edit.start),edit.text);
    const newStart=edit.start+delta;
    const newEnd=newStart+edit.text.length;
    const editDelta=edit.text.length-(edit.end-edit.start);
    delta+=editDelta;
    mapped.push({start:edit.start,end:edit.end,text:edit.text,newStart,newEnd,delta:editDelta});
    cursor=edit.end;
  }
  parts.push(source.slice(cursor));
  const output=parts.join('');

  /**
   * Map one original source offset. Positions strictly inside replaced text
   * have no exact image. Insertions at the same offset use the requested bias.
   * All lengths and offsets are JavaScript UTF-16 code units.
   * @param {number} offset
   * @param {BoundaryBias} [bias]
   * @returns {number|null}
   */
  function mapOffset(offset,bias='right') {
    assertOffset(offset,source.length,'offset');
    if(bias!=='left'&&bias!=='right')throw new TypeError('bias must be left or right');
    for(const edit of mapped){
      if(edit.start<offset&&offset<edit.end)return null;
    }
    const insertion=mapped.find(edit=>edit.start===offset&&edit.end===offset);
    if(insertion)return bias==='left'?insertion.newStart:insertion.newEnd;
    const atStart=mapped.find(edit=>edit.start===offset&&edit.end>edit.start);
    if(atStart)return atStart.newStart;
    const atEnd=mapped.find(edit=>edit.end===offset&&edit.end>edit.start);
    if(atEnd)return atEnd.newEnd;
    let shift=0;
    for(const edit of mapped){
      if(edit.end<offset)shift+=edit.delta;
      else if(edit.start>offset)break;
    }
    return offset+shift;
  }

  /**
   * Whether every original code unit in a half-open span is unchanged.
   * Insertions exactly at either boundary are outside the span.
   * @param {SourceSpan} span
   * @returns {boolean}
   */
  function preservesSpan(span) {
    assertSpan(span,source.length);
    for(const edit of mapped){
      if(edit.start===edit.end){
        if(span.start<edit.start&&edit.start<span.end)return false;
      }else if(edit.start<span.end&&edit.end>span.start){
        return false;
      }
    }
    return true;
  }

  /**
   * Map a source span only if no edit changes its contents. The result remains
   * a half-open UTF-16 range in the output source.
   * @param {SourceSpan} span
   * @returns {SourceSpan|null}
   */
  function mapSpan(span) {
    if(!preservesSpan(span))return null;
    if(span.start===span.end){
      const point=mapOffset(span.start,'right');
      return point===null?null:{start:point,end:point};
    }
    const start=mapOffset(span.start,'right');
    const end=mapOffset(span.end,'left');
    if(start===null||end===null||end<start)return null;
    return {start,end};
  }

  return {
    output,
    edits:Object.freeze(mapped.map(edit=>Object.freeze({...edit}))),
    mapOffset,
    preservesSpan,
    mapSpan
  };
}

module.exports={applyEditsWithMap};
