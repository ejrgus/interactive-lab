import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalUrl, parseBackup, DEFAULT_COMPANY, EXTERNAL_CATEGORY, topicId, topicCompany, articleFields, inCategory } from '../newsroom/model.js';

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
test('external articles only match the fixed external section, even with extra topics',()=>{
  const external={is_official:false,category:'외부링크',topics:['섀시 / NVH']};
  const official={is_official:true,category:'섀시 / NVH',topics:['시험 / 가상개발']};
  assert.equal(inCategory(external,'섀시 / NVH'),false);
  assert.equal(inCategory(external,EXTERNAL_CATEGORY),true);
  assert.equal(inCategory(official,EXTERNAL_CATEGORY),false);
  assert.deepEqual(articleFields([external,official]),['섀시 / NVH','시험 / 가상개발']);
});
test('company topic keys preserve Hyundai legacy notes and isolate other companies',()=>{
  assert.equal(topicId(DEFAULT_COMPANY,'열관리'),'topic:열관리');
  assert.notEqual(topicId('kia','열관리'),topicId(DEFAULT_COMPANY,'열관리'));
  assert.equal(topicCompany(topicId('kia','열관리')),'kia');
  assert.equal(topicCompany('legacy-note'),DEFAULT_COMPANY);
});
test('backups preserve explicit classification and default old custom links to external',()=>{
  const result=parseBackup({records:{x:{memo:'보존'}},customArticles:[{id:'x',title:'외부 뉴스',url:'https://example.test/x',company_id:'kia',company:'기아',category:'섀시',is_official:false}]});
  assert.equal(result.customArticles[0].category,EXTERNAL_CATEGORY);
  assert.equal(result.customArticles[0].company_id,'kia');
  assert.equal(result.records.x.memo,'보존');
});
