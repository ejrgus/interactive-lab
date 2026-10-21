import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalUrl, parseBackup } from '../newsroom/model.js';

test('article URLs reject active schemes and embedded passwords',()=>{
  for(const url of ['javascript:alert(1)','data:text/html,test','https://name:pass@example.com']) assert.throws(()=>canonicalUrl(url));
  assert.equal(canonicalUrl('https://example.com/article/?utm_source=test&x=2#memo'),'https://example.com/article/?x=2');
});
test('legacy notes preserve text, categories and personal flags without accepting owner or role',()=>{
  const result=parseBackup({records:{'topic:열관리':{memo:'개인 메모',qa:'질문',takeaway:'정리',favorite:true,read:true,userEdited:true,user_id:'attacker',role:'admin'}}});
  assert.equal(result.records['topic:열관리'].memo,'개인 메모');
  assert.equal(result.records['topic:열관리'].favorite,true);
  assert.equal(result.records['topic:열관리'].user_id,undefined);
  assert.equal(result.records['topic:열관리'].role,undefined);
});
test('invalid and oversized backup data cannot be imported',()=>{
  for(const value of [{}, {records:[]}, {records:{a:{memo:{text:'bad'}}}}, {records:{a:{memo:'x'.repeat(200001)}}}]) assert.throws(()=>parseBackup(value));
});
test('exported timestamp and local timestamp normalize for merge comparison',()=>{
  const record=parseBackup({records:{a:{updated_at:'2026-10-21T12:00:00Z',user_edited:true}}}).records.a;
  assert.equal(record.updated,'2026-10-21T12:00:00.000Z');assert.equal(record.userEdited,true);
});
