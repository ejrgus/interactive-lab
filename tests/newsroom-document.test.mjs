import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeNote,encodeNote,noteText,noteMarkdown,editorParts} from '../newsroom/note-document.js';
import {parseBackup,recordForExport} from '../newsroom/model.js';
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002';
test('legacy text remains byte-for-byte identical, including Korean, spacing, and literal HTML',()=>{
  const value='앞 글\n\n  한글 메모 <img src=x onerror=alert(1)>\n끝\n';
  assert.equal(decodeNote(value).rich,false);assert.equal(encodeNote(decodeNote(value).parts),value);assert.equal(noteText(value),value);
});
test('mixed notes preserve text/image/text/image order through save and reload',()=>{
  const parts=[{type:'text',text:'앞 글\n'},{type:'image',id:A},{type:'text',text:'중간 글'},{type:'image',id:B},{type:'text',text:'\n뒷 글'}];
  assert.deepEqual(decodeNote(encodeNote(parts)).parts,parts);assert.equal(noteText(encodeNote(parts)),'앞 글\n중간 글\n뒷 글');
  assert.match(noteMarkdown(encodeNote(parts)),/앞 글[\s\S]*첨부 이미지[\s\S]*중간 글[\s\S]*첨부 이미지[\s\S]*뒷 글/);
});
test('removing the last image keeps mixed format so old files do not reappear',()=>{
  const value=encodeNote([{type:'text',text:'글만 남음'}],true);
  assert.equal(decodeNote(value).rich,true);assert.equal(noteText(value),'글만 남음');
});
test('existing JSON backup and import preserve a mixed document without accepting a different owner',()=>{
  const value=encodeNote([{type:'text',text:'한글 메모'},{type:'image',id:A},{type:'text',text:'뒤 설명'}]);
  const record=recordForExport({memo:'기존 원문',qa:'질문',takeaway:value,updated_at:'2026-10-22T00:00:00Z'});
  const result=parseBackup({records:{a:{...record,user_id:'other'}}}).records.a;
  assert.equal(result.takeaway,value);assert.equal(result.memo,'기존 원문');assert.equal(result.user_id,undefined);
});
test('malformed envelopes and external image references stay literal text',()=>{
  for(const value of ['[newsroom-document:v1]\nnot-json','[newsroom-document:v1]\n[{"type":"image","id":"https://evil.test/x"}]'])assert.deepEqual(decodeNote(value),{rich:false,parts:[{type:'text',text:value}]});
});
test('DOM serialization omits image controls and pending uploads while retaining paragraph breaks',()=>{
  const text=t=>({nodeType:3,nodeValue:t}),el=(tag,children=[],dataset={})=>({nodeType:1,tagName:tag,childNodes:children,dataset});
  const nodes=[el('DIV',[text('앞 글')]),el('FIGURE',[text('원본 보기 크기 100%')],{imageId:A}),el('FIGURE',[text('업로드중')],{pendingImage:'pending'}),el('DIV',[text('뒷 글')])];
  nodes.forEach((n,i)=>{n.previousSibling=nodes[i-1];n.nextSibling=nodes[i+1];});
  const parts=editorParts({childNodes:nodes});assert.equal(parts.filter(p=>p.type==='image').length,1);assert.ok(!parts.some(p=>p.text?.includes('원본 보기')||p.text?.includes('업로드중')));assert.match(parts.filter(p=>p.type==='text').map(p=>p.text).join(''),/앞 글\n[\s\S]*뒷 글/);
});
test('the caret landing after a final image does not add a saved blank line',()=>{
  assert.deepEqual(editorParts({childNodes:[{nodeType:1,tagName:'FIGURE',dataset:{imageId:A}},{nodeType:1,tagName:'BR',dataset:{editorTail:'true'}}]}),[{type:'image',id:A}]);
});
