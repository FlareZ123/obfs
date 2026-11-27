'use strict';

/**
 * Independent exhaustive 3-bit verifier for the sharpened conditional
 * compatible-basis reanchoring query bound. Its inversion implementation
 * is deliberately self-contained rather than reusing the 32-bit solver.
 * @returns {{triangularPermutations:number,inputLinearMaps:number,
 *   sourceAnchors:number,admissibleAnchors:number,singularAnchors:number,
 *   fullRankIncompatibleAnchors:number,verifiedTargets:number,
 *   zeroCorrection:number,oneCorrection:number,
 *   queryHistogram:Record<string,number>,maxDistinctQueries:number}}
 */
function runEvidence() {
  const gl=[];
  for(let a=1;a<8;a++)for(let b=1;b<8;b++)for(let c=1;c<8;c++) {
    const columns=[a,b,c];
    const table=Array.from({length:8},(_,x)=>
      ((x&1)?a:0)^((x&2)?b:0)^((x&4)?c:0));
    if(new Set(table).size!==8)continue;
    const inverse=Array(8).fill(0);
    for(let x=0;x<8;x++)inverse[table[x]]=x;
    gl.push({columns,table,inverse});
  }

  let triangularPermutations=0,sourceAnchors=0,admissibleAnchors=0;
  let singularAnchors=0,fullRankIncompatibleAnchors=0,verifiedTargets=0;
  let zeroCorrection=0,oneCorrection=0,maxDistinctQueries=0;
  /** @type {Record<string,number>} */
  const queryHistogram={};
  for(let h0=0;h0<2;h0++)for(let h1=0;h1<4;h1++)
    for(let h2=0;h2<16;h2++) {
      const p=Array.from({length:8},(_,x)=>
        x^h0^(((h1>>>(x&1))&1)<<1)^(((h2>>>(x&3))&1)<<2));
      if(new Set(p).size!==8)throw Error('Not a compatible permutation');
      triangularPermutations++;
      for(const linear of gl)for(let offset=0;offset<8;offset++) {
        sourceAnchors++;
        const f=linear.table.map(x=>p[x^offset]);
        const base=f[0];
        const columns=[f[1]^base,f[2]^base,f[4]^base];
        const m=Array.from({length:8},(_,x)=>
          ((x&1)?columns[0]:0)^((x&2)?columns[1]:0)^
          ((x&4)?columns[2]:0));
        const inverseM=Array(8).fill(-1);
        let singular=false;
        for(let x=0;x<8;x++) {
          if(inverseM[m[x]]!==-1){singular=true;break;}
          inverseM[m[x]]=x;
        }
        if(singular){singularAnchors++;continue;}
        // Validate each basis column of B=M composed Lin^-1, including
        // all forbidden output bits below that column's input bit.
        let lowerUnitriangular=true;
        for(let bit=0;bit<3;bit++) {
          const column=m[linear.inverse[1<<bit]];
          if((column&(1<<bit))===0||(column&((1<<bit)-1))!==0) {
            lowerUnitriangular=false;
            break;
          }
        }
        if(!lowerUnitriangular){fullRankIncompatibleAnchors++;continue;}
        admissibleAnchors++;

        for(let secret=0;secret<8;secret++) {
          const target=f[secret];
          let candidate=inverseM[target^base];
          const asked=new Set([0,1,2,4,candidate]);
          let corrections=0;
          if(f[candidate]!==target) {
            candidate^=inverseM[target^f[candidate]];
            asked.add(candidate);
            corrections=1;
          }
          if(f[candidate]!==target||candidate!==secret) {
            throw Error('Conditional inversion failed on an admissible source');
          }
          verifiedTargets++;
          if(corrections===0)zeroCorrection++;
          else oneCorrection++;
          const count=asked.size;
          queryHistogram[String(count)]=(queryHistogram[String(count)]||0)+1;
          if(count>maxDistinctQueries)maxDistinctQueries=count;
        }
      }
    }
  return {triangularPermutations,inputLinearMaps:gl.length,
    sourceAnchors,admissibleAnchors,singularAnchors,
    fullRankIncompatibleAnchors,verifiedTargets,zeroCorrection,
    oneCorrection,queryHistogram,maxDistinctQueries};
}

if(require.main===module)console.log('REANCHOR_WIDTH3 '+JSON.stringify(runEvidence()));
module.exports={runEvidence};
