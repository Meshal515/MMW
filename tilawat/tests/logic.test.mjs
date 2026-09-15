import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveVariant } from '../js/catalog/core.js';
import { queueTargetIndex, recordMatchesQuery, portableTrack, findEquivalentTrack } from '../js/app-logic.js';

test('ended playback does not wrap when repeat is off',()=>{
  assert.equal(queueTargetIndex(0,1,1,{wrap:false}),-1);
  assert.equal(queueTargetIndex(2,3,1,{wrap:false}),-1);
  assert.equal(queueTargetIndex(2,3,1,{wrap:true}),0);
});

test('preferred variant wins over a local copy when user explicitly chose it',()=>{
  const rec={preferredVariantId:'remote',variants:[
    {id:'local',localAudioKey:'blob-1',provider:'local'},
    {id:'remote',audioUrl:'https://example.com/320.mp3',provider:'archive'}
  ]};
  assert.equal(resolveVariant(rec)?.id,'remote');
});

test('compound Arabic search matches record-wide metadata',()=>{
  const rec={reciter:'ياسر الدوسري',surah:'الكهف',year:'1425',collection:'تراويح رمضان'};
  assert.equal(recordMatchesQuery(rec,'ياسر 1425 الكهف'),true);
  assert.equal(recordMatchesQuery(rec,'ماهر الكهف'),false);
});

test('portable backup removes nested device blob references',()=>{
  const out=portableTrack({id:'t1',coverKey:'cover-x',variants:[{id:'v1',localAudioKey:'blob-x',audioUrl:'https://example.com/a.mp3'}]});
  assert.equal(out.coverKey,'');
  assert.equal(out.variants[0].localAudioKey,'');
  assert.equal(out.variants[0].audioUrl,'https://example.com/a.mp3');
});

test('same catalog recitation is detected instead of duplicated',()=>{
  const ref={reciterId:92,moshafId:1,surahId:18};
  const existing={id:'saved',catalogRef:ref,variants:[]};
  assert.equal(findEquivalentTrack([existing],{catalogRef:{...ref},variants:[]})?.id,'saved');
});
