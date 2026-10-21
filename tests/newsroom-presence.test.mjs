import test from 'node:test';
import assert from 'node:assert/strict';
import {createPresence,onlineMembers,PRESENCE_TOPIC} from '../newsroom/presence.js';
import {noteWidthLimits} from '../newsroom/layout.js';
import {validateImage,MAX_IMAGE_BYTES,clipboardImages} from '../newsroom/images.js';

test('several tabs for one member are one entry; empty and malformed state is ignored',()=>{
  const result=onlineMembers({a:[{nickname:'회원 A'},{nickname:'회원 A'}],b:[{nickname:'회원 B'}],c:[],d:null});
  assert.equal(result.length,2);assert.equal(result.find(r=>r.id==='a').nickname,'회원 A');
});
test('private presence publishes only nickname, clears on failure, and ignores callbacks after logout',async()=>{
  const channels=[],changes=[];
  const client={removeChannel:async()=>{},channel(topic,options){
    const channel={topic,options,on(type,filter,fn){this.sync=fn;return this;},subscribe(fn){this.status=fn;return this;},async track(payload){this.payload=payload;return 'ok';},presenceState(){return {one:[{nickname:'나'},{nickname:'나'}]};}};
    channels.push(channel);return channel;
  }};
  const presence=createPresence(client,v=>changes.push(v));
  await presence.start({id:'one',email:'private@example.test'},'나');const first=channels[0];
  assert.equal(first.topic,PRESENCE_TOPIC);assert.equal(first.options.config.private,true);
  await first.status('SUBSCRIBED');assert.deepEqual(first.payload,{nickname:'나'});
  first.sync();assert.equal(changes.at(-1).members.length,1);
  await presence.start({id:'one'},'나');assert.equal(channels.length,1);
  await first.status('CHANNEL_ERROR');assert.deepEqual(changes.at(-1),{status:'error',members:[]});
  await presence.stop();const count=changes.length;first.sync();await first.status('SUBSCRIBED');assert.equal(changes.length,count);
});
test('memo resizing leaves room for the reader and supports a focused reader',()=>{
  assert.deepEqual(noteWidthLimits(1280,370),{min:260,max:570});
  assert.deepEqual(noteWidthLimits(1280,0),{min:260,max:720});
  assert.deepEqual(noteWidthLimits(901,340),{min:221,max:221});
});
test('image uploads preserve original bytes and reject unsupported or oversized input',()=>{
  assert.doesNotThrow(()=>validateImage({type:'image/png',size:MAX_IMAGE_BYTES}));
  assert.throws(()=>validateImage({type:'image/png',size:MAX_IMAGE_BYTES+1}));
  assert.throws(()=>validateImage({type:'image/svg+xml',size:100}));
  assert.throws(()=>validateImage({type:'image/jpeg',size:0}));
});
test('clipboard screenshots are picked once and text-only paste is left alone',()=>{
  const image={type:'image/png',size:1024},item={kind:'file',type:'image/png',getAsFile:()=>image};
  assert.deepEqual(clipboardImages({items:[item],files:[image]}),[image]);
  assert.deepEqual(clipboardImages({items:[],files:[image]}),[image]);
  assert.deepEqual(clipboardImages({items:[{kind:'string',type:'text/html',getAsFile:()=>null}],files:[]}),[]);
  assert.deepEqual(clipboardImages(null),[]);
});
