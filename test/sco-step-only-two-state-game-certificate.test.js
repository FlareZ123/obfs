'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {certifyTwoStateMinimaxGame}=require('../sims/sco-step-only-two-state-game-certificate');

test('constructive eight-step defender and nine-step attacker certify exact minimax game',()=>{
  const result=certifyTwoStateMinimaxGame();
  assert.deepEqual(result,{
    sourceModels:260,explicitBeliefs:4429,rootRank:9,
    nonterminalBeliefs:4085,
    defenderEightStepTapes:256,nonterminalEightStepTapes:256,
    maximumAttackerDepth:9,upperTreeLeaves:116,
    minimumEightStepRemaining:2,maximumEightStepRemaining:98
  });
  console.log('SCO_TWO_STATE_GAME_CERTIFICATE '+JSON.stringify(result));
});
