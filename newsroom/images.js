import {decodeNote,encodeNote,editorParts} from './note-document.js?v=20261022-05';
const BUCKET='newsroom-note-images';
const TYPES={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'};
export const MAX_IMAGE_BYTES=5*1024*1024;
export function validateImage(file) {
  if(!TYPES[file.type])throw new Error('JPG·PNG·WebP·GIF 이미지를 선택해주세요.');
  if(!file.size||file.size>MAX_IMAGE_BYTES)throw new Error('이미지 한 장은 5MB 이하여야 합니다. 원본을 그대로 저장합니다.');
}
export function clipboardImages(data) {
  const items=Array.from(data?.items||[]).filter(i=>i.kind==='file'&&i.type.startsWith('image/')).map(i=>i.getAsFile()).filter(Boolean);
  return items.length?items:Array.from(data?.files||[]).filter(f=>f.type.startsWith('image/'));
}
const check=({data,error})=>{if(error)throw error;return data;};
const keyOf=c=>c?`${c.userId}:${c.articleId}:${c.noteKey}`:'';

export function createNoteImages(client,{editor,recovery,status,context,source,onChange,editable=()=>false}) {
  let key='',generation=0,request=0,lastValue='',rich=false,rows=[],urls=new Map(),timer,loading=Promise.resolve(),pending=Promise.resolve(),lastRange=null;
  const writes=new Set(),blobs=new Set();
  let selected=null,history=[],future=[],lastSnapshot='',lastEditTime=0,lastKind='';
  const say=(text,error=false)=>{status.textContent=text;status.dataset.error=String(error);};
  const storage=()=>client.storage.from(BUCKET);
  const current=g=>g===generation&&key===keyOf(context());
  function clear() {
    generation++;request++;key='';lastValue='';lastRange=null;rows=[];urls.clear();clearTimeout(timer);
    for(const url of blobs)URL.revokeObjectURL(url);blobs.clear();
    selected=null;history=[];future=[];lastSnapshot='';editor.replaceChildren();editor.contentEditable='false';editor.setAttribute('aria-readonly','true');recovery?.replaceChildren();say('');
  }
  function rememberRange() {
    const selection=getSelection();if(!selection?.rangeCount)return;
    const range=selection.getRangeAt(0),element=range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement;
    if(editor.contains(range.startContainer)&&editor.contains(range.endContainer)&&!element?.closest('figure'))lastRange=range.cloneRange();
  }
  function insertAtCursor(node) {
    rememberRange();let range=lastRange;
    if(selected&&editor.contains(selected)){range=document.createRange();range.setStartAfter(selected);range.collapse(true);}
    unselect();
    if(!range||!editor.contains(range.startContainer)||!editor.contains(range.endContainer)){range=document.createRange();range.selectNodeContents(editor);}
    range=range.cloneRange();range.collapse(false);range.insertNode(node);
    const after=document.createTextNode('');node.after(after);ensureTail();range.setStart(after,0);range.collapse(true);
    editor.focus();const selection=getSelection();selection.removeAllRanges();selection.addRange(range);lastRange=range.cloneRange();
  }
  function sync(kind='text') {
    if(!onChange||!key||key!==keyOf(context()))return;
    const parts=editorParts(editor);rich=rich||parts.some(p=>p.type==='image')||decodeNote(lastSnapshot).parts.some(p=>p.type==='image');
    const value=encodeNote(parts,rich),snapshot=encodeNote(parts,true),now=Date.now();
    if(snapshot!==lastSnapshot){if(kind!=='text'||lastKind!=='text'||now-lastEditTime>700){history.push(lastSnapshot);if(history.length>100)history.shift();}future=[];}
    lastKind=kind;lastEditTime=now;lastSnapshot=snapshot;lastValue=value;onChange(value);renderRecovery();
  }
  function tracked(promise) {writes.add(promise);promise.finally(()=>writes.delete(promise));return promise;}
  function unselect() {selected?.classList.remove('image-selected');selected=null;}
  function selectImage(card) {
    unselect();selected=card;card.classList.add('image-selected');card.focus();
    const range=document.createRange();range.selectNode(card);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
  }
  function removeSelected() {
    if(!selected||!editor.contains(selected)||!editable())return;
    const card=selected,after=document.createTextNode('');card.after(after);unselect();card.remove();
    const range=document.createRange();range.setStart(after,0);range.collapse(true);editor.focus();getSelection().removeAllRanges();getSelection().addRange(range);lastRange=range.cloneRange();sync('image');
  }
  async function pngBlob(row) {
    const blob=check(await storage().download(row.object_path));
    if(row.mime_type==='image/png')return blob;
    const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext('2d').drawImage(bitmap,0,0);bitmap.close();
    return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('복사 실패')),'image/png'));
  }
  function copySelected() {
    if(!selected||!editor.contains(selected))return;
    const row=rows.find(r=>r.id===selected.dataset.imageId);if(!row)return;
    try{navigator.clipboard.write([new ClipboardItem({'image/png':pngBlob(row)})]).then(()=>say('사진을 복사했어요.')).catch(()=>say('사진 복사를 허용해주세요. 브라우저의 클립보드 권한을 확인해주세요.',true));}
    catch{say('이 브라우저에서는 사진 복사가 지원되지 않아요.',true);}
  }
  function restoreHistory(redo=false) {
    const from=redo?future:history,to=redo?history:future;if(!from.length)return;
    to.push(lastSnapshot);const value=from.pop();unselect();draw(value);onChange(value);lastKind='';
    const range=document.createRange();range.selectNodeContents(editor);range.collapse(false);editor.focus();getSelection().removeAllRanges();getSelection().addRange(range);lastRange=range.cloneRange();
  }
  function fillCard(card,row) {
    card.replaceChildren();card.contentEditable='false';card.className='note-image';card.classList.toggle('image-selected',selected===card);card.dataset.imageId=row.id;card.style.width=`${row.width_percent}%`;card.tabIndex=0;card.setAttribute('aria-label','메모 이미지');
    const image=document.createElement('img');image.alt='메모 이미지';image.style.width='100%';image.draggable=false;
    if(urls.has(row.id))image.src=urls.get(row.id);
    image.onerror=()=>{image.alt='이미지를 불러오지 못했어요. 메모를 다시 열어주세요.';};card.append(image);
    card.onclick=event=>{if(event.target.closest('.image-resize-handle'))return;event.stopPropagation();selectImage(card);};
    if(onChange)for(const corner of ['nw','ne','sw','se']) {
      const handle=document.createElement('span');handle.className=`image-resize-handle ${corner}`;handle.setAttribute('aria-hidden','true');card.append(handle);
      handle.onpointerdown=event=>{
        if(event.button!==0||!editable())return;event.preventDefault();event.stopPropagation();selectImage(card);
        const start=event.clientX,startY=event.clientY,rect=card.getBoundingClientRect(),width=rect.width,style=getComputedStyle(editor),available=editor.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),direction=corner.endsWith('e')?1:-1,c={...context()},g=generation;
        handle.setPointerCapture(event.pointerId);card.classList.add('image-resizing');let percent=row.width_percent;
        handle.onpointermove=move=>{const dx=(move.clientX-start)*direction,dy=(move.clientY-startY)*(corner.startsWith('s')?1:-1)*width/rect.height,delta=Math.abs(dx)>Math.abs(dy)?dx:dy;percent=Math.max(25,Math.min(100,Math.round((width+delta)/available*100)));card.style.width=`${percent}%`;};
        const finish=()=>{
          handle.onpointermove=null;handle.onpointerup=null;handle.onpointercancel=null;card.classList.remove('image-resizing');
          if(percent===row.width_percent)return;row.width_percent=percent;
          tracked((async()=>{try{check(await client.from('newsroom_note_images').update({width_percent:percent}).eq('id',row.id).eq('user_id',c.userId).select().single());}catch{if(current(g))say('사진 크기를 저장하지 못했어요. 다시 조절해주세요.',true);}})());
        };handle.onpointerup=finish;handle.onpointercancel=finish;
      };
    }
  }
  function makeCard(row) {const card=document.createElement('figure');fillCard(card,row);return card;}
  function placeholder(id) {
    const card=document.createElement('figure');card.className='note-image';card.dataset.imageId=id;card.contentEditable='false';card.textContent='이미지를 불러오는 중…';return card;
  }
  function draw(value) {
    const doc=decodeNote(value);rich=doc.rich;lastValue=value;lastRange=null;editor.replaceChildren();
    for(const part of doc.parts)editor.append(part.type==='text'?document.createTextNode(part.text):placeholder(part.id));
    hydrate();
  }
  function ensureTail() {
    const last=[...editor.childNodes].filter(n=>n.nodeType!==3||n.textContent).at(-1);
    if(last?.tagName==='FIGURE'){const tail=document.createElement('br');tail.dataset.editorTail='true';editor.append(tail);}
  }
  function hydrate() {
    const used=new Set([...editor.querySelectorAll('[data-image-id]')].map(n=>n.dataset.imageId));
    for(const card of editor.querySelectorAll('[data-image-id]')){
      const row=rows.find(r=>r.id===card.dataset.imageId);
      if(row)fillCard(card,row);else card.textContent='이미지를 불러올 수 없습니다. 메모를 다시 열어주세요.';
    }
    if(!rich)for(const row of rows)if(!used.has(row.id))editor.append(makeCard(row));
    ensureTail();
    lastSnapshot=encodeNote(editorParts(editor),true);renderRecovery();
  }
  function renderRecovery() {
    if(recovery){recovery.replaceChildren();recovery.hidden=true;}
  }
  function load(force=false) {
    const c=context();if(!c){clear();return Promise.resolve();}
    editor.contentEditable=editable()?'plaintext-only':'false';editor.dataset.reading=String(!editable());
    editor.setAttribute('aria-readonly',String(!editable()));if(recovery)recovery.dataset.reading=String(!editable());
    if(key!==keyOf(c)){clear();key=keyOf(c);editor.contentEditable=editable()?'plaintext-only':'false';editor.setAttribute('aria-readonly',String(!editable()));editor.dataset.reading=String(!editable());draw(source());force=true;}
    else if(lastValue!==source())draw(source());
    if(!force)return loading;
    const g=generation,turn=++request;say('이미지 불러오는 중…');
    loading=(async()=>{
      try{
        const found=check(await client.from('newsroom_note_images').select('*').eq('user_id',c.userId).eq('article_id',c.articleId).eq('note_key',c.noteKey).order('created_at'));
        const signed=found.length?check(await storage().createSignedUrls(found.map(r=>r.object_path),3600)):[];
        if(!current(g)||turn!==request)return;
        rows=found;urls=new Map(found.flatMap(row=>{const url=signed.find(s=>s.path===row.object_path)?.signedUrl;return url?[[row.id,url]]:[];}));
        hydrate();say('');clearTimeout(timer);if(rows.length)timer=setTimeout(()=>load(true),50*60*1000);
      }catch{if(current(g)&&turn===request)say('이미지를 불러오지 못했어요. 메모 탭을 다시 선택해주세요.',true);}
    })();return loading;
  }
  editor.addEventListener('mousedown',event=>{if(!event.target.closest('figure'))unselect();});
  editor.addEventListener('copy',event=>{if(selected&&editor.contains(selected)){event.preventDefault();copySelected();}});
  editor.addEventListener('keydown',event=>{
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='c'&&selected){event.preventDefault();copySelected();return;}
    if(!onChange||!editable())return;
    if((event.ctrlKey||event.metaKey)&&['z','y'].includes(event.key.toLowerCase())){event.preventDefault();restoreHistory(event.key.toLowerCase()==='y'||event.shiftKey);return;}
    if(selected&&['Delete','Backspace'].includes(event.key)){event.preventDefault();removeSelected();}
  });
  if(onChange) {
    editor.addEventListener('input',event=>{if(event.target.closest('figure'))return;rememberRange();sync();});
    editor.addEventListener('keyup',rememberRange);editor.addEventListener('mouseup',rememberRange);
    editor.addEventListener('drop',event=>event.preventDefault());
    editor.addEventListener('paste',event=>{
      const c=context();if(!c||!editable())return;
      const files=clipboardImages(event.clipboardData);if(!files.length)return;event.preventDefault();
      try{files.forEach(validateImage);}catch(e){say(e.message,true);return;}
      const g=generation;
      for(const file of files) {
        const slot=document.createElement('figure');slot.className='note-image pending-image';slot.dataset.pendingImage=crypto.randomUUID();slot.contentEditable='false';
        const localUrl=URL.createObjectURL(file),image=document.createElement('img');blobs.add(localUrl);image.src=localUrl;image.alt='붙여넣은 이미지 · 저장 중';
        slot.append(image);insertAtCursor(slot);
        pending=pending.then(async()=>{
          let path='',stored=false,attached=false;
          try{
            await loading;
            if(current(g)&&!slot.isConnected)return;
            const id=crypto.randomUUID();path=`${c.userId}/${id}.${TYPES[file.type]}`;say('이미지 원본 저장 중…');
            check(await storage().upload(path,file,{contentType:file.type,upsert:false}));stored=true;
            if(current(g)&&!slot.isConnected){check(await storage().remove([path]));stored=false;return;}
            const row={id,user_id:c.userId,article_id:c.articleId,note_key:c.noteKey,object_path:path,file_name:(file.name||`붙여넣은 이미지.${TYPES[file.type]}`).slice(0,200),mime_type:file.type,byte_size:file.size,width_percent:100};
            check(await client.from('newsroom_note_images').insert(row));attached=true;
            if(!current(g))return;
            rows.push(row);let url=localUrl;
            try{url=check(await storage().createSignedUrls([path],3600))[0]?.signedUrl||localUrl;}catch{}
            urls.set(id,url);delete slot.dataset.pendingImage;slot.dataset.imageId=id;fillCard(slot,row);rich=true;sync('image');say('');
          }catch(e){
            if(stored&&!attached)try{check(await storage().remove([path]));}catch{}
            if(current(g)){slot.remove();say(e.message||'이미지를 저장하지 못했어요. 다시 붙여넣어주세요.',true);}
          }finally{if(!editor.querySelector(`img[src="${localUrl}"]`)){URL.revokeObjectURL(localUrl);blobs.delete(localUrl);}}
        });
      }
    });
  }
  return {load,clear,flush:async()=>{await pending;await Promise.all([...writes]);}};
}
