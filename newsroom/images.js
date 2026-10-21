const BUCKET='newsroom-note-images';
const TYPES={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'};
export const MAX_IMAGE_BYTES=5*1024*1024;
export function validateImage(file) {
  if(!TYPES[file.type])throw new Error('JPG·PNG·WebP·GIF 이미지를 선택해주세요.');
  if(!file.size||file.size>MAX_IMAGE_BYTES)throw new Error('이미지 한 장은 5MB 이하여야 합니다. 원본을 그대로 저장합니다.');
}
const check=({data,error})=>{if(error)throw error;return data;};
const keyOf=c=>c?`${c.userId}:${c.articleId}:${c.noteKey}`:'';

export function createNoteImages(client,{gallery,status,context,input,upload}) {
  let key='',generation=0,uploading=false,refreshTimer;
  const say=(text,error=false)=>{status.textContent=text;status.dataset.error=String(error);};
  const storage=()=>client.storage.from(BUCKET);
  function clear() {
    generation++;key='';clearTimeout(refreshTimer);gallery.replaceChildren();say('');
    if(input)input.value='';if(upload)upload.disabled=true;
  }
  function openOriginal(row,url) {
    const image=document.getElementById('image-original');image.src=url;image.alt=row.file_name;
    document.getElementById('image-dialog-title').textContent=row.file_name;
    document.getElementById('image-dialog').showModal();
  }
  async function load(force=false) {
    const c=context();if(!c){clear();return;}
    if(upload)upload.disabled=uploading;
    if(!force&&key===keyOf(c))return;
    key=keyOf(c);const turn=++generation;clearTimeout(refreshTimer);gallery.replaceChildren();say('이미지 불러오는 중…');
    try {
      const rows=check(await client.from('newsroom_note_images').select('*').eq('user_id',c.userId).eq('article_id',c.articleId).eq('note_key',c.noteKey).order('created_at'));
      const signed=rows.length?check(await storage().createSignedUrls(rows.map(r=>r.object_path),3600)):[];
      if(turn!==generation||keyOf(context())!==keyOf(c))return;
      for(const row of rows) {
        const signedFile=signed.find(s=>s.path===row.object_path),url=signedFile?.signedUrl;
        const card=document.createElement('figure');card.className='note-image';
        const image=document.createElement('img');image.alt=row.file_name;image.loading='lazy';image.style.width=`${row.width_percent}%`;
        if(url)image.src=url;else image.alt=`${row.file_name} · 이미지를 불러오지 못했습니다.`;
        image.onerror=()=>{image.alt=`${row.file_name} · 이미지를 불러오지 못했습니다. 잠시 후 다시 열어주세요.`;};
        const caption=document.createElement('figcaption');caption.textContent=row.file_name;
        const controls=document.createElement('div');controls.className='image-controls';
        const original=document.createElement('button');original.type='button';original.textContent='원본 보기';original.disabled=!url;original.onclick=()=>openOriginal(row,url);controls.append(original);
        if(input) {
          const label=document.createElement('label');label.textContent='크기';
          const range=document.createElement('input');range.type='range';range.min='25';range.max='100';range.step='5';range.value=String(row.width_percent);range.setAttribute('aria-label',`${row.file_name} 표시 크기`);
          const output=document.createElement('output');output.textContent=`${row.width_percent}%`;
          range.oninput=()=>{image.style.width=`${range.value}%`;output.textContent=`${range.value}%`;};
          let pending=Promise.resolve();
          range.onchange=()=>{
            const width=Number(range.value);
            pending=pending.catch(()=>{}).then(async()=>{check(await client.from('newsroom_note_images').update({width_percent:width}).eq('id',row.id).eq('user_id',c.userId).select().single());if(turn===generation)say('이미지 표시 크기 저장됨 · 원본 유지');}).catch(()=>{if(turn===generation)say('이미지 크기 저장에 실패했어요. 다시 조절해주세요.',true);});
          };
          label.append(range,output);controls.append(label);
          const remove=document.createElement('button');remove.type='button';remove.textContent='삭제';remove.setAttribute('aria-label',`${row.file_name} 첨부 삭제`);
          remove.onclick=async()=>{
            if(!confirm('이 첨부 이미지를 삭제할까요? 원본 파일도 삭제되며 복구할 수 없습니다.'))return;
            remove.disabled=true;
            try {await pending;check(await storage().remove([row.object_path]));check(await client.from('newsroom_note_images').delete().eq('id',row.id).eq('user_id',c.userId));if(keyOf(context())===keyOf(c))await load(true);}
            catch {if(turn===generation)say('이미지 삭제를 완료하지 못했어요. 다시 시도해주세요.',true);remove.disabled=false;}
          };controls.append(remove);
        }
        card.append(caption,controls,image);gallery.append(card);
      }
      say(rows.length?`${rows.length}장 · 원본 화질로 저장됨`:'');
      if(rows.length)refreshTimer=setTimeout(()=>load(true),50*60*1000);
    } catch {
      if(turn===generation){key='';say('이미지 목록을 불러오지 못했어요. 메모 탭을 다시 선택해주세요.',true);}
    }
  }
  if(input) {
    upload.onclick=()=>input.click();
    input.onchange=async()=>{
      const file=input.files[0],c=context();input.value='';if(!file||!c||uploading)return;
      let path='',stored=false,attached=false;
      try {
        validateImage(file);uploading=true;upload.disabled=true;say('원본 이미지 업로드 중…');
        const id=crypto.randomUUID();path=`${c.userId}/${id}.${TYPES[file.type]}`;
        check(await storage().upload(path,file,{contentType:file.type,upsert:false}));stored=true;
        check(await client.from('newsroom_note_images').insert({id,user_id:c.userId,article_id:c.articleId,note_key:c.noteKey,object_path:path,file_name:file.name.slice(0,200),mime_type:file.type,byte_size:file.size,width_percent:100}));attached=true;
        if(keyOf(context())===keyOf(c))await load(true);
      } catch(e) {
        let cleaned=true;
        if(stored&&!attached)try{check(await storage().remove([path]));}catch{cleaned=false;}
        if(keyOf(context())===keyOf(c))say(cleaned?(e.message||'이미지 업로드에 실패했어요.'):'첨부 등록에 실패했고 파일 정리가 필요해요. 관리자에게 알려주세요.',true);
      } finally {uploading=false;if(context())upload.disabled=false;}
    };
  }
  return {load,clear};
}
