import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
import { canonicalUrl, parseBackup, recordForExport, DEFAULT_COMPANY, EXTERNAL_CATEGORY, NOTE_LABELS, topicId, topicCompany, articleFields, inCategory } from './model.js?v=20261021-04';

// Keep the desktop application's DOM and style selectors intact.
const legacyIds={ 'article-list':'articleList', 'article-count':'listCount', 'list-title':'listTitle', 'reader-title':'articleTitle', 'reader-category':'articleCategory', 'reader-date':'articleDate', 'note-editor':'noteEditor', 'note-context':'noteContext', 'note-count':'noteChars', 'save-status':'noteSaveStatus', 'add-open':'addNews', 'add-dialog':'addDialog', 'add-form':'addForm', 'add-url':'addUrl', 'add-title':'addTitle', 'add-category':'addCategory', 'add-date':'addDate', 'add-status':'addError', 'category-suggestions':'fieldSuggestions' };
const $ = id => document.getElementById(legacyIds[id]||id);
const state = { user:null, articles:[], companies:[], companyId:DEFAULT_COMPANY, notes:new Map(), dirty:new Map(), selected:null, tab:'memo', filter:'all', admin:false, generation:0, view:'web', preview:false };
const companyArticles = () => state.articles.filter(a=>a.company_id===state.companyId);
const currentCompany = () => state.companies.find(c=>c.id===state.companyId);
const FIELD_ORDER=['열관리 / 충전','섀시 / NVH','차체 / 충돌','차량전자 / E/E','품질 / 신뢰성','시험 / 가상개발','프레스 / 차체','스마트제조','도장 / 의장','소재 / 경량화','하이브리드','ADAS / 자율주행','전동화 구동','SDV / IVI','배터리 / BMS','수소 / 연료전지','구매 / 공급망','상품 / 사업전략'];
let client, authMode='login', timer, saving=null, importData=null, recoveryMode=false;
let adminNotes=[], adminSelected=null, adminTab='memo';
const emptyNote = id => ({ article_id:id, memo:'', qa:'', takeaway:'', origin:'', favorite:false, read:false, user_edited:false, revision:0 });
const note = id => state.notes.get(id) || emptyNote(id);
const message = (id, text, error=false) => { $(id).textContent=text; $(id).dataset.error=String(error); };
function errorText(error) {
  if (error?.code === 'PGRST205' || error?.code === 'PGRST202' || /schema cache|does not exist/i.test(error?.message || '')) return '뉴스룸 저장소 설정이 아직 완료되지 않았습니다. 운영자에게 알려주세요.';
  if (error?.code === '42501') return '저장 권한을 확인할 수 없습니다. 운영자에게 알려주세요.';
  if (/Invalid login credentials/i.test(error?.message || '')) return '이메일 또는 비밀번호를 확인해주세요.';
  if (/Email not confirmed/i.test(error?.message || '')) return '받은 메일에서 이메일 인증을 마친 뒤 로그인해주세요.';
  if (/rate limit/i.test(error?.message || '')) return '요청이 많아 잠시 제한되었습니다. 조금 뒤에 다시 시도해주세요.';
  return error?.message || '연결이 원활하지 않습니다. 다시 시도해주세요.';
}
async function checked(query) { const { data,error }=await query; if(error)throw error; return data; }
async function allRows(table, columns='*', configure=q=>q) {
  const rows=[];
  for(let start=0;start<20000;start+=500) {
    const page=await checked(configure(client.from(table).select(columns)).range(start,start+499));
    rows.push(...page); if(page.length<500)return rows;
  }
  throw new Error('한 번에 불러올 수 있는 목록을 초과했습니다. 운영자에게 알려주세요.');
}
function setAuthMode(mode) {
  authMode=mode; const signup=mode==='signup';
  $('signup-tab').classList.toggle('active',signup); $('login-tab').classList.toggle('active',!signup);
  $('nickname-label').hidden=!signup; $('nickname').required=signup;
  $('consent-label').hidden=!signup; $('consent').required=signup;
  $('password').autocomplete=signup?'new-password':'current-password';
  $('auth-title').textContent=signup?'함께 읽을 공간을 만들어보세요.':'뉴스룸에 오신 걸 환영해요.';
  $('auth-submit').textContent=signup?'회원가입':'로그인';
  message('auth-status','');
}
function lockView() {
  clearTimeout(timer); state.generation++; state.user=null; state.articles=[]; state.notes.clear(); state.dirty.clear(); state.selected=null; state.admin=false;
  $('workspace').hidden=true; $('auth-panel').hidden=false; $('recovery-panel').hidden=true;
  $('app-topbar').hidden=true;document.body.classList.remove('signed-in','reader-focus');
  $('article-list').replaceChildren(); resetAdminNotes(); $('admin-panel').hidden=true;
  $('note-editor').value=''; $('note-editor').disabled=true; $('password').value='';
  $('notePreview').textContent='';$('notePreview').hidden=true;$('articleFrame').removeAttribute('src');$('articleFrame').dataset.source='';
  $('search').value='';$('category').value='';state.filter='all';state.preview=false;
  state.companies=[];state.companyId=DEFAULT_COMPANY;$('company-menu').hidden=true;
  for(const id of ['add-dialog','import-dialog','company-dialog','admin-dialog']) if($(id).open)$(id).close();
  $('import-file').value=''; importData=null;
}
async function acceptSession(session) {
  if(recoveryMode) { $('auth-panel').hidden=true; $('workspace').hidden=true; $('recovery-panel').hidden=false; return; }
  if(!session?.user) { lockView(); return; }
  if(state.user?.id===session.user.id)return;
  lockView(); state.user=session.user;
  $('auth-panel').hidden=true; $('workspace').hidden=false;
  $('app-topbar').hidden=false;document.body.classList.add('signed-in');
  $('account-label').textContent=session.user.user_metadata?.nickname || '회원';
  await reloadWorkspace().catch(e=>message('workspace-status',errorText(e),true));
}
async function reloadWorkspace() {
  if(!state.user)return;
  const generation=state.generation, user=state.user;
  message('workspace-status','뉴스와 내 메모를 불러오는 중…');
  const [articles,notes,isAdmin,companies]=await Promise.all([
    allRows('newsroom_articles','*',q=>q.order('date',{ascending:false,nullsFirst:false}).order('id')),
    allRows('newsroom_notes','*',q=>q.eq('user_id',user.id).order('article_id')),
    checked(client.rpc('newsroom_is_admin')),
    allRows('newsroom_companies','*',q=>q.order('name'))
  ]);
  if(generation!==state.generation)return;
  state.articles=articles;state.companies=companies;
  if(!currentCompany())state.companyId=companies.find(c=>c.id===DEFAULT_COMPANY)?.id||companies[0]?.id;
  const merged=new Map(notes.map(n=>[n.article_id,n]));
  // A background load must not replace edits or saves made while it was in flight.
  for(const [id,local] of state.notes) {
    if(state.dirty.has(id) || local.revision > (merged.get(id)?.revision || 0))merged.set(id,local);
  }
  state.notes=merged; state.admin=isAdmin===true;
  $('admin-panel').hidden=!state.admin;
  let profile=await checked(client.from('newsroom_profiles').select('nickname').eq('user_id',user.id).maybeSingle());
  if(!profile) {
    const nickname=String(user.user_metadata?.nickname || '회원').slice(0,40);
    const response=await client.from('newsroom_profiles').insert({user_id:user.id,nickname});
    if(response.error && response.error.code!=='23505')throw response.error;
    profile={nickname};
  }
  if(generation!==state.generation)return;
  $('account-label').textContent=`${profile.nickname}${state.admin?' · 관리자':''}`;
  renderCompany();refreshCategories();
  const previous=state.selected;
  renderList();
  if(previous && (companyArticles().some(a=>a.id===previous.id)||topicArticles().some(a=>a.id===previous.id)))await selectArticle(state.articles.find(a=>a.id===previous.id)||previous,false);
  else if(companyArticles().length)await selectArticle(companyArticles()[0],false);
  else clearReader();
  message('workspace-status','뉴스는 회원 모두에게 공유됩니다. 다른 회원이 추가한 뉴스는 새로고침하면 반영됩니다.');
}
function topicArticles() {
  const ids=new Set([...state.notes.keys()].filter(id=>!state.articles.some(a=>a.id===id)&&topicCompany(id)===state.companyId));
  for(const category of articleFields(companyArticles()))ids.add(topicId(state.companyId,category));
  return [...ids].map(id=>({id,title:id.includes('topic:')?`${id.split('topic:').slice(1).join('topic:')} · 주제 노트`:`가져온 개인 노트 · ${id}`,company_id:state.companyId,category:'개인 노트',topics:[],tags:[],url:'',date:null,summary:'분야 전체의 원리와 생각을 기록하는 나의 노트입니다.',study:''}));
}
function refreshCategories() {
  const previous=$('category').value,categories=articleFields(companyArticles()).sort((a,b)=>a.localeCompare(b,'ko'));
  $('category').replaceChildren(new Option('모든 분야',''),new Option(EXTERNAL_CATEGORY,EXTERNAL_CATEGORY),...categories.map(c=>new Option(c,c)));
  $('category').value=[EXTERNAL_CATEGORY,...categories].includes(previous)?previous:'';
  $('category-suggestions').replaceChildren(...categories.map(c=>{const o=document.createElement('option');o.value=c;return o;}));
  $('catalogDate').textContent=`공유 뉴스 ${companyArticles().length}건 · 계정에 동기화`;
}
function companyIcon(company) {
  const span=document.createElement('span');span.className='company-icon';
  const fallback=document.createElement('span');fallback.textContent=company.name.slice(0,2);span.append(fallback);
  if(company.logo_url) {
    try {
      const url=canonicalUrl(company.logo_url),img=document.createElement('img');img.alt='';img.referrerPolicy='no-referrer';img.src=url;
      img.onload=()=>{fallback.hidden=true;};img.onerror=()=>{img.remove();fallback.hidden=false;};span.append(img);
    } catch { /* Keep the name initials if a stored logo cannot be displayed. */ }
  }
  return span;
}
function renderCompany() {
  const company=currentCompany();if(!company)return;
  $('company-button').replaceChildren(companyIcon(company));$('company-button').setAttribute('aria-label',`${company.name} · 기업 선택`);$('company-button').title='기업 선택';
  $('company-name').textContent=company.name;$('company-caption').textContent='NEWS & NOTES';
  $('company-list').replaceChildren();
  for(const c of state.companies) {
    const button=document.createElement('button');button.type='button';button.className=`company-option${c.id===state.companyId?' active':''}`;
    button.setAttribute('aria-pressed',String(c.id===state.companyId));button.append(companyIcon(c),document.createTextNode(c.name));
    button.onclick=()=>switchCompany(c.id).catch(e=>message('workspace-status',errorText(e),true));$('company-list').append(button);
  }
  $('company-edit').hidden=!state.admin;
  $('company-newsroom-link').hidden=!company.newsroom_url;
  if(company.newsroom_url)$('company-newsroom-link').href=canonicalUrl(company.newsroom_url);else $('company-newsroom-link').removeAttribute('href');
}
function clearReader() {
  state.selected=null;$('reader-content').hidden=false;$('note-editor').value='';$('note-editor').disabled=true;$('save-note').disabled=true;$('admin-load').disabled=true;
  $('reader-empty').hidden=false;$('reader-empty').textContent='아직 등록된 뉴스가 없어요.\n뉴스를 추가하거나 주제 노트를 열어보세요.';
  for(const selector of ['.article-top','#browserToolbar','#webSurface','#summaryContent','.reader-footer'])$('reader-content').querySelector(selector).hidden=true;
  $('note-context').textContent='뉴스를 추가하거나 주제 노트를 열어보세요.';$('note-count').textContent='0자';
  message('save-status','뉴스를 선택해주세요.');
  $('articleFrame').removeAttribute('src');$('articleFrame').dataset.source='';$('notePreview').hidden=true;$('note-editor').hidden=false;
  resetAdminNotes();
}
async function switchCompany(id) {
  if(!state.companies.some(c=>c.id===id))return;
  await saveAll();if(!state.user)return;
  state.companyId=id;state.selected=null;state.filter='all';state.preview=false;$('category').value='';$('search').value='';
  $('company-menu').hidden=true;$('company-button').setAttribute('aria-expanded','false');
  renderCompany();refreshCategories();renderList();
  if(companyArticles().length)await selectArticle(companyArticles()[0],false);else clearReader();
}
function openCompanyForm(edit=false) {
  $('company-form').reset();$('company-form').dataset.edit=edit?state.companyId:'';
  $('company-dialog-title').textContent=edit?'기업 정보 관리':'기업 추가';
  $('new-company-name').readOnly=edit;$('new-company-name').value=edit?currentCompany().name:'';
  $('company-metadata').hidden=!state.admin;
  if(edit){$('new-company-newsroom').value=currentCompany().newsroom_url;$('new-company-logo').value=currentCompany().logo_url;}
  message('company-error','');$('company-menu').hidden=true;$('company-button').setAttribute('aria-expanded','false');$('company-dialog').showModal();
}
function updateArticleSource() {
  const official=$('add-official').value==='true';
  $('add-category').disabled=!official;$('add-category').required=official;$('add-category-label').hidden=!official;
  $('external-hint').hidden=$('add-official').value!=='false';
}
function renderList() {
  const query=$('search').value.trim().toLowerCase(), category=$('category').value;
  const source=state.filter==='topics'?topicArticles():state.filter==='all'&&query?[...companyArticles(),...topicArticles().filter(a=>[note(a.id).memo,note(a.id).qa,note(a.id).takeaway].some(Boolean))]:companyArticles();
  const items=source.filter(a=>(!category || inCategory(a,category) || state.filter==='topics') &&
    (state.filter!=='favorites' || note(a.id).favorite) && (state.filter!=='read' || note(a.id).read) && (state.filter!=='mine' || a.created_by===state.user?.id) &&
    (!query || [a.title,a.company,a.category,...a.tags,a.summary,note(a.id).memo,note(a.id).qa,note(a.id).takeaway].join(' ').toLowerCase().includes(query)));
  $('list-title').textContent=$('category').value || ({topics:'내 주제 노트',favorites:'즐겨찾기',read:'읽은 뉴스',mine:'내가 추가한 뉴스',all:'전체 뉴스'}[state.filter]);
  $('article-count').textContent=`${items.length}건`;
  $('article-list').replaceChildren();
  for(const a of items) {
    const n=note(a.id), button=document.createElement('button');button.type='button';
    button.className=`article-card${state.selected?.id===a.id?' active':''}${n.read?' read':''}`;
    const meta=document.createElement('small'), date=document.createElement('span'), star=document.createElement('span'), title=document.createElement('strong'), cat=document.createElement('span');
    meta.className='card-meta';date.textContent=a.date||'게시일 미확인';star.textContent=n.favorite?'★':n.read?'✓':'';star.className=n.favorite?'starred':'';meta.append(date,star);
    title.textContent=a.title;title.className='card-title';cat.textContent=a.tags.join(' · ')||a.category;cat.className='card-tags';button.append(meta,title,cat);
    button.addEventListener('click',()=>selectArticle(a).catch(e=>message('workspace-status',errorText(e),true)));
    $('article-list').append(button);
  }
  if(!items.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='아직 항목이 없어요.\n검색 조건을 바꾸거나 뉴스를 추가해보세요.';$('article-list').append(empty);}
  renderNavigation();
}
function renderNavigation() {
  function nav(label,count,active,action,id) {
    const button=document.createElement('button');button.className=`nav-item${active?' active':''}`;if(id)button.id=id;
    const text=document.createElement('span'),num=document.createElement('span');text.textContent=label;num.textContent=count;num.className='count';button.append(text,num);button.onclick=action;return button;
  }
  $('quickNav').replaceChildren();
  for(const [key,label,id] of [['all','▤  전체 뉴스','all-filter'],['favorites','☆  즐겨찾기','favorite-filter'],['read','✓  읽은 뉴스','read-filter'],['mine','＋  내가 추가한 뉴스','mine-filter'],['topics','▧  내 주제 노트','topics-filter']]) {
    const count=key==='topics'?topicArticles().length:companyArticles().filter(a=>key==='all'||key==='favorites'&&note(a.id).favorite||key==='read'&&note(a.id).read||key==='mine'&&a.created_by===state.user?.id).length;
    $('quickNav').append(nav(label,count,state.filter===key&&!$('category').value,()=>{state.filter=key;$('category').value='';renderList();},id));
  }
  const available=articleFields(companyArticles());
  const fields=[...FIELD_ORDER.filter(f=>available.includes(f)),...available.filter(f=>!FIELD_ORDER.includes(f))];
  $('fieldCount').textContent=fields.length+1;$('categories').replaceChildren();
  $('categories').append(nav('↗ 외부링크',companyArticles().filter(a=>a.is_official===false).length,$('category').value===EXTERNAL_CATEGORY,()=>{state.filter='all';$('category').value=EXTERNAL_CATEGORY;renderList();},'external-filter'));
  for(const field of fields)$('categories').append(nav(field,companyArticles().filter(a=>inCategory(a,field)).length,$('category').value===field,()=>{state.filter='all';$('category').value=field;renderList();}));
  $('categories').append(nav('면접 연결 노트','↗',state.selected?.id===topicId(state.companyId,'면접 연결'),()=>selectTopic('면접 연결')));
}
function selectTopic(category) {
  const id=topicId(state.companyId,category);
  const article=topicArticles().find(a=>a.id===id)||{id,title:`${category} · 주제 노트`,category:'개인 노트',topics:[],tags:[],url:'',summary:'분야 전체의 원리와 생각을 기록하는 나의 노트입니다.',study:''};
  selectArticle(article).catch(e=>message('workspace-status',errorText(e),true));
}
function renderReaderView() {
  const article=state.selected;if(!article)return;
  const web=!!article.url&&state.view==='web';
  $('webSurface').hidden=!web;$('summaryContent').hidden=web;$('browserToolbar').hidden=!article.url;
  $('webTab').disabled=!article.url;$('webTab').classList.toggle('active',web);$('summaryTab').classList.toggle('active',!web);
  $('currentUrl').textContent=article.url||'';$('currentUrl').title=article.url||'';
  if(web&&$('articleFrame').dataset.source!==article.url){$('articleFrame').src=canonicalUrl(article.url);$('articleFrame').dataset.source=article.url;}
  if(!web){$('articleFrame').removeAttribute('src');$('articleFrame').dataset.source='';}
  $('webStatus').textContent=web?'내부 원문이 표시되지 않으면 ↗ 버튼으로 새 탭에서 열어주세요.':'뉴스는 함께 공유하고, 메모는 내 계정에 저장됩니다.';
}
async function selectArticle(article, flush=true) {
  if(flush)await saveAll();
  if(!state.user)return;
  state.selected=article; $('reader-empty').hidden=true; $('reader-content').hidden=false;
  $('reader-content').querySelector('.article-top').hidden=false;$('reader-content').querySelector('.reader-footer').hidden=false;$('admin-load').disabled=false;
  $('reader-title').textContent=article.title; $('reader-category').textContent=article.company?`${article.company} · ${article.category}`:article.category;
  $('reader-date').textContent=article.date||'게시일 미확인';
  $('reader-tags').replaceChildren(...article.tags.map(t=>{const el=document.createElement('span');el.className='tag';el.textContent=t;return el;}));
  $('reader-related').textContent=[article.category,...article.topics].join(' · ');
  $('reader-summary').textContent=article.summary||'공식 원문을 읽고 오른쪽에 생각을 정리해보세요.';
  $('reader-study').textContent=article.study||'무엇이 바뀌었는지, 어떤 문제를 해결했는지, 나의 직무와 어떻게 연결되는지 생각해보세요.';
  $('study-section').hidden=!article.url; $('original-link').hidden=!article.url; $('source-caption').hidden=!article.url;
  if(article.url){$('original-link').href=canonicalUrl(article.url);$('original-link').textContent=article.url;}else $('original-link').removeAttribute('href');
  resetAdminNotes();
  $('note-editor').disabled=false; $('save-note').disabled=false; $('reload-note').hidden=true;
  if(!note(article.id).read)changeNote({read:true},false);
  state.preview=false;renderNote();renderList();renderReaderView();
}
function renderNote() {
  if(!state.selected)return;
  const n=note(state.selected.id);$('note-editor').value=n[state.tab]||'';
  $('note-context').textContent=state.selected.title;
  $('note-count').textContent=`${$('note-editor').value.length.toLocaleString()}자`;
  $('favorite').textContent=n.favorite?'★':'☆';$('favorite').classList.toggle('selected',n.favorite);
  $('readToggle').textContent=n.read?'✓':'○';$('readToggle').classList.toggle('selected',n.read);
  $('readToggle').title=n.read?'읽음 표시 해제':'읽음 표시';
  $('note-editor').hidden=state.preview;$('notePreview').hidden=!state.preview;
  $('previewNote').textContent=state.preview?'편집 모드':'읽기 모드';
  if(state.preview)$('notePreview').textContent=n[state.tab]||'아직 작성한 내용이 없습니다.';
  message('save-status',state.dirty.has(n.article_id)?'저장 대기 중…':n.revision?'계정에 저장됨':'자동 저장 켜짐');
  document.querySelectorAll('[data-note]').forEach(b=>b.classList.toggle('active',b.dataset.note===state.tab));
}
function changeNote(patch, edited=true) {
  if(!state.selected || !state.user)return;
  const id=state.selected.id,current=note(id);
  state.notes.set(id,{...current,...patch,user_edited:edited||current.user_edited});
  state.dirty.set(id,(state.dirty.get(id)||0)+1);
  message('save-status','저장 대기 중…');clearTimeout(timer);
  timer=setTimeout(()=>saveAll().catch(e=>message('save-status',errorText(e),true)),850);
}
async function saveAll() {
  clearTimeout(timer);
  if(saving){await saving;if(state.dirty.size)return saveAll();return;}
  if(!state.user || !state.dirty.size)return;
  const generation=state.generation, user=state.user;
  saving=(async()=>{
    while(state.dirty.size && generation===state.generation) {
      const [id,version]=state.dirty.entries().next().value, snapshot={...note(id)};
      const payload={memo:snapshot.memo,qa:snapshot.qa,takeaway:snapshot.takeaway,origin:snapshot.origin,favorite:snapshot.favorite,read:snapshot.read,user_edited:snapshot.user_edited,updated_at:new Date().toISOString()};
      if(state.selected?.id===id)message('save-status','계정에 저장 중…');
      const request=snapshot.revision
        ? client.from('newsroom_notes').update(payload).eq('user_id',user.id).eq('article_id',id).eq('revision',snapshot.revision).select()
        : client.from('newsroom_notes').insert({...payload,user_id:user.id,article_id:id}).select();
      const {data,error}=await request;
      if(generation!==state.generation)return;
      if(error || !data?.length) {
        const conflict=error?.code==='23505' || (!error && !data?.length);
        if(conflict) {
          $('reload-note').hidden=false;
          throw new Error('다른 창에서 수정된 메모입니다. 현재 내용을 복사한 뒤 최신 메모를 불러와주세요.');
        }
        throw error || new Error('저장에 실패했습니다.');
      }
      const current=note(id);
      state.notes.set(id,{...current,revision:data[0].revision,updated_at:data[0].updated_at});
      if(state.dirty.get(id)===version)state.dirty.delete(id);
      if(state.selected?.id===id)message('save-status',state.dirty.has(id)?'저장 대기 중…':'계정에 저장됨');
    }
  })();
  try { await saving; } finally { saving=null; }
}
function downloadBackup() {
  const records=Object.fromEntries([...state.notes].map(([id,n])=>[id,recordForExport(n)]));
  const customArticles=state.articles.filter(a=>a.created_by===state.user.id);
  const blob=new Blob([JSON.stringify({version:2,records,customArticles},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`뉴스룸-내공부기록-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function loadAdminNotes() {
  if(!state.admin || !state.selected)return;
  const generation=state.generation, id=state.selected.id;
  resetAdminNotes();adminTab='memo';$('admin-dialog-title').textContent=state.selected.title;
  $('admin-status').textContent='회원 메모를 불러오는 중…';$('admin-dialog').showModal();
  message('workspace-status','회원 메모를 조회하는 중…');
  const [notes,profiles]=await Promise.all([
    allRows('newsroom_notes','*',q=>q.eq('article_id',id).order('user_id')),
    allRows('newsroom_profiles','user_id,nickname',q=>q.order('user_id'))
  ]);
  if(generation!==state.generation || state.selected?.id!==id || !$('admin-dialog').open)return;
  const names=new Map(profiles.map(p=>[p.user_id,p.nickname]));
  adminNotes=notes.filter(n=>n.memo||n.qa||n.takeaway).map(n=>({...n,author:names.get(n.user_id)||'회원'}));
  adminSelected=adminNotes[0]?.user_id||null;
  $('admin-status').textContent=adminNotes.length?`작성자 ${adminNotes.length}명 · 열람 전용`:'이 항목에 작성된 회원 메모가 없습니다.';
  renderAdminNotes();
  message('workspace-status','관리자 권한으로 조회했습니다. 회원 메모는 여기서 수정할 수 없습니다.');
}
function resetAdminNotes() {
  adminNotes=[];adminSelected=null;
  $('admin-results').replaceChildren();$('admin-author').textContent='작성자를 선택해주세요.';$('admin-note-body').textContent='';
  if($('admin-dialog').open)$('admin-dialog').close();
}
function renderAdminNotes() {
  $('admin-results').replaceChildren();
  for(const n of adminNotes) {
    const button=document.createElement('button');button.type='button';button.className='admin-author-option';button.setAttribute('aria-pressed',String(n.user_id===adminSelected));
    const title=document.createElement('strong'),date=document.createElement('small');title.textContent=`${n.author}${n.user_id===state.user.id?' (나)':''}`;
    date.textContent=n.updated_at?new Date(n.updated_at).toLocaleString('ko-KR'):'저장 시각 미확인';button.append(title,date);
    button.onclick=()=>{adminSelected=n.user_id;renderAdminNotes();};$('admin-results').append(button);
  }
  const selected=adminNotes.find(n=>n.user_id===adminSelected);
  $('admin-author').textContent=selected?`${selected.author} · ${selected.user_id.slice(0,8)}`:'작성자를 선택해주세요.';
  $('admin-note-body').textContent=selected?(selected[adminTab]||'이 메모에는 작성된 내용이 없습니다.'):'왼쪽에서 작성자를 선택하면 메모를 볼 수 있어요.';
  document.querySelectorAll('[data-admin-note]').forEach(b=>{const active=b.dataset.adminNote===adminTab;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
}
function wireEvents() {
  $('login-tab').onclick=()=>setAuthMode('login');$('signup-tab').onclick=()=>setAuthMode('signup');
  $('auth-form').addEventListener('submit',async event=>{
    event.preventDefault();$('auth-submit').disabled=true;message('auth-status','계정을 확인하고 있어요…');
    try {
      const email=$('email').value.trim(),password=$('password').value;
      if(authMode==='signup') {
        if(!$('consent').checked)throw new Error('메모 열람 안내를 확인해주세요.');
        const data=await checked(client.auth.signUp({email,password,options:{data:{nickname:$('nickname').value.trim()||'회원'},emailRedirectTo:new URL('./index.html',location.href).href}}));
        $('password').value='';
        if(data.session)await acceptSession(data.session);
        else message('auth-status','가입 확인 메일을 보냈어요. 메일의 인증 링크를 누른 뒤 로그인해주세요. 이미 가입했다면 로그인을 이용하세요.');
      } else { const data=await checked(client.auth.signInWithPassword({email,password}));$('password').value='';await acceptSession(data.session); }
    } catch(e){message('auth-status',errorText(e),true);}finally{$('auth-submit').disabled=false;}
  });
  $('forgot-password').onclick=async()=>{
    if(!$('email').reportValidity() || !$('email').value)return;
    $('forgot-password').disabled=true;
    try{await checked(client.auth.resetPasswordForEmail($('email').value.trim(),{redirectTo:new URL('./index.html',location.href).href}));message('auth-status','비밀번호 재설정 메일을 요청했어요. 받은 편지함을 확인해주세요.');}
    catch(e){message('auth-status',errorText(e),true);}finally{$('forgot-password').disabled=false;}
  };
  $('recovery-form').onsubmit=async event=>{
    event.preventDefault();const submit=event.submitter;submit.disabled=true;
    try{await checked(client.auth.updateUser({password:$('new-password').value}));$('new-password').value='';recoveryMode=false;state.user=null;await acceptSession((await checked(client.auth.getSession())).session);}
    catch(e){message('recovery-status',errorText(e),true);}finally{submit.disabled=false;}
  };
  $('signout').onclick=async()=>{
    try{await saveAll();await checked(client.auth.signOut());lockView();message('auth-status','로그아웃했습니다.');}
    catch(e){message('workspace-status',`로그아웃하지 못했습니다. ${errorText(e)}`,true);}
  };
  $('search').oninput=renderList;$('category').onchange=renderList;
  $('toolsButton').onclick=()=>{const open=$('toolsMenu').hidden;$('toolsMenu').hidden=!open;$('toolsButton').setAttribute('aria-expanded',String(open));};
  $('company-button').onclick=()=>{const open=$('company-menu').hidden;$('company-menu').hidden=!open;$('company-button').setAttribute('aria-expanded',String(open));};
  $('company-add').onclick=()=>openCompanyForm();$('company-edit').onclick=()=>openCompanyForm(true);
  $('company-form').onsubmit=async event=>{
    event.preventDefault();const submit=event.submitter;submit.disabled=true;const generation=state.generation;
    try {
      if(!state.user)throw new Error('다시 로그인해주세요.');
      const name=$('new-company-name').value.trim(),editing=$('company-form').dataset.edit;
      if(!name)throw new Error('기업명을 입력해주세요.');
      const url=id=>{const value=$(id).value.trim();if(!value)return '';const normalized=canonicalUrl(value);if(!normalized.startsWith('https://'))throw new Error('공식 뉴스룸과 로고는 https 주소를 입력해주세요.');return normalized;};
      const metadata=state.admin?{newsroom_url:url('new-company-newsroom'),logo_url:url('new-company-logo')}:{};
      let company;
      if(editing){company=(await checked(client.from('newsroom_companies').update(metadata).eq('id',editing).select()))[0];if(!company)throw new Error('기업 정보 변경 권한을 확인해주세요.');}
      else {
        const response=await client.from('newsroom_companies').insert({name,...metadata,created_by:state.user.id}).select().single();
        if(response.error?.code==='23505')company=state.companies.find(c=>c.name===name)||await checked(client.from('newsroom_companies').select('*').eq('name',name).single());
        else if(response.error)throw response.error;else company=response.data;
      }
      if(generation!==state.generation)return;
      await saveAll();await reloadWorkspace();await switchCompany(company.id);$('company-dialog').close();
      message('workspace-status',editing?'기업 정보를 업데이트했습니다.':'기업을 열었습니다. 뉴스를 추가해보세요.');
    }catch(e){message('company-error',errorText(e),true);}finally{submit.disabled=false;}
  };
  document.addEventListener('click',event=>{if(!event.target.closest('#toolsMenu')&&!event.target.closest('#toolsButton'))$('toolsMenu').hidden=true;if(!event.target.closest('.company-picker')){$('company-menu').hidden=true;$('company-button').setAttribute('aria-expanded','false');}});
  $('topicNote').onclick=()=>selectTopic($('category').value||'면접 연결');
  $('previewNote').onclick=()=>{state.preview=!state.preview;renderNote();};
  $('readerFocus').onclick=()=>{document.body.classList.toggle('reader-focus');$('readerFocus').textContent=document.body.classList.contains('reader-focus')?'☷ 목록 보기':'⤢ 뉴스 넓게';};
  $('webTab').onclick=()=>{state.view='web';renderReaderView();};$('summaryTab').onclick=()=>{state.view='summary';renderReaderView();};
  $('external').title='새 탭에서 원문 열기';$('external').onclick=()=>{if(state.selected?.url)window.open(canonicalUrl(state.selected.url),'_blank','noopener,noreferrer');};
  for(const id of ['reload','homeArticle'])$(id).onclick=()=>{if(state.selected?.url){$('articleFrame').dataset.source='';state.view='web';renderReaderView();}};
  $('currentAdd').onclick=()=>{$('add-open').click();if(state.selected?.url){$('add-url').value=state.selected.url;$('add-title').value=state.selected.title;if(state.selected.category!==EXTERNAL_CATEGORY)$('add-category').value=state.selected.category;}};
  $('refresh').onclick=async()=>{try{await saveAll();await reloadWorkspace();}catch(e){message('workspace-status',errorText(e),true);}};
  document.querySelectorAll('[data-note]').forEach(button=>button.onclick=()=>{state.tab=button.dataset.note;renderNote();});
  $('note-editor').maxLength=200000;
  $('note-editor').oninput=()=>{changeNote({[state.tab]:$('note-editor').value});$('note-count').textContent=`${$('note-editor').value.length.toLocaleString()}자`;};
  $('save-note').onclick=()=>saveAll().catch(e=>message('save-status',errorText(e),true));
  $('favorite').onclick=()=>{if(!state.selected)return;changeNote({favorite:!note(state.selected.id).favorite});renderNote();renderList();};
  $('readToggle').onclick=()=>{if(!state.selected)return;changeNote({read:!note(state.selected.id).read},false);renderNote();renderList();};
  $('reload-note').onclick=async()=>{
    if(!state.selected || !confirm('현재 입력한 내용은 서버의 최신 메모로 교체됩니다. 필요한 내용을 복사했나요?'))return;
    const id=state.selected.id,generation=state.generation;
    try{const latest=await checked(client.from('newsroom_notes').select('*').eq('user_id',state.user.id).eq('article_id',id).maybeSingle());if(generation!==state.generation)return;state.dirty.delete(id);state.notes.set(id,latest||emptyNote(id));if(state.selected?.id===id)renderNote();$('reload-note').hidden=true;}
    catch(e){message('save-status',errorText(e),true);}
  };
  $('admin-load').onclick=()=>loadAdminNotes().catch(e=>{message('workspace-status',errorText(e),true);$('admin-status').textContent=errorText(e);});
  document.querySelectorAll('[data-admin-note]').forEach(button=>button.onclick=()=>{adminTab=button.dataset.adminNote;renderAdminNotes();});
  $('admin-dialog').addEventListener('close',()=>{if($('admin-dialog').open)return;adminNotes=[];adminSelected=null;$('admin-results').replaceChildren();$('admin-note-body').textContent='';});
  $('add-open').onclick=()=>{$('add-form').reset();$('add-company').replaceChildren(...state.companies.map(c=>new Option(c.name,c.id)));$('add-company').value=state.companyId;updateArticleSource();message('add-status','');$('add-dialog').showModal();};
  $('add-official').onchange=updateArticleSource;
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
  for(const id of ['closeDialog','cancelDialog'])$(id).onclick=()=>$('add-dialog').close();
  $('add-form').onsubmit=async event=>{
    event.preventDefault();const submit=event.submitter;submit.disabled=true;
    try {
      if(!state.user)throw new Error('다시 로그인해주세요.');
      const url=canonicalUrl($('add-url').value),user=state.user,generation=state.generation;
      if(!$('add-official').value)throw new Error('공식 뉴스룸 여부를 선택해주세요.');
      const official=$('add-official').value==='true',company=state.companies.find(c=>c.id===$('add-company').value);
      if(!company)throw new Error('기업을 선택해주세요.');
      const title=$('add-title').value.trim(),category=official?$('add-category').value.trim():EXTERNAL_CATEGORY;
      if(!title || !category)throw new Error('제목과 분야를 입력해주세요.');
      if(official && category===EXTERNAL_CATEGORY)throw new Error('공식 뉴스룸의 분야를 입력해주세요.');
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(url));
      const id='custom:'+Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,16);
      const tags=$('addTags').value.split(',').map(t=>t.trim()).filter(Boolean).slice(0,30);
      const article={id,url,title,company:company.name,company_id:company.id,is_official:official,category,date:$('add-date').value||null,summary:$('add-summary').value.trim(),tags,created_by:user.id};
      const {error}=await client.from('newsroom_articles').insert(article);
      if(error && error.code!=='23505')throw error;
      if(generation!==state.generation)return;
      await saveAll();await reloadWorkspace();
      const existing=state.articles.find(a=>a.url===url || a.id===id);
      $('add-dialog').close();if(existing){if(existing.company_id!==state.companyId)await switchCompany(existing.company_id);state.filter='all';$('search').value='';$('category').value=existing.is_official===false?EXTERNAL_CATEGORY:'';await selectArticle(existing);}
      message('workspace-status',error?'이미 등록된 기사입니다. 기존 기사를 열었어요.':'공유 뉴스에 추가했습니다. 다른 회원도 새로고침하면 볼 수 있어요.');
    }catch(e){message('add-status',errorText(e),true);}finally{submit.disabled=false;}
  };
  $('import-open').onclick=()=>{importData=null;$('import-file').value='';$('import-submit').disabled=true;message('import-preview','');$('import-dialog').showModal();};
  $('import-file').onchange=async()=>{
    importData=null;$('import-submit').disabled=true;const file=$('import-file').files[0];if(!file)return;
    try {if(file.size>10*1024*1024)throw new Error('10MB 이하 JSON 파일을 선택해주세요.');importData=parseBackup(JSON.parse(await file.text()));message('import-preview',`개인 메모 ${Object.keys(importData.records).length}건 · 추가 공유 기사 ${importData.customArticles.length}건. 현재 계정으로 가져옵니다.`);$('import-submit').disabled=false;}
    catch(e){message('import-preview',errorText(e),true);}
  };
  $('import-submit').onclick=async()=>{
    if(!importData || !state.user)return;$('import-submit').disabled=true;
    const generation=state.generation;
    try{await saveAll();if(generation!==state.generation)return;message('import-preview','계정으로 가져오는 중…');const result=await checked(client.rpc('newsroom_import_records',{records:importData.records,custom_articles:importData.customArticles}));if(generation!==state.generation)return;await reloadWorkspace();importData=null;$('import-dialog').close();message('workspace-status',`메모 ${result.imported}건을 가져왔습니다. 더 최신인 서버 기록은 유지했습니다. 주제별 메모는 ‘내 주제 노트’에서 볼 수 있어요.`);}
    catch(e){message('import-preview',errorText(e),true);$('import-submit').disabled=false;}
  };
  $('export-notes').onclick=async()=>{try{await saveAll();downloadBackup();}catch(e){message('workspace-status',errorText(e),true);}};
  $('export-markdown').onclick=async()=>{
    try {await saveAll();const sections=[...state.notes].filter(([,n])=>n.memo||n.qa||n.takeaway).map(([id,n])=>{const article=state.articles.find(a=>a.id===id)||topicArticles().find(a=>a.id===id);return `## ${article?.title||id}\n\n${article?.url||''}\n\n### 메모1\n\n${n.memo}\n\n### 메모2\n\n${n.qa}\n\n### 메모3\n\n${n.takeaway}`;});const url=URL.createObjectURL(new Blob([sections.join('\n\n---\n\n')],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='내공부기록.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    catch(e){message('workspace-status',errorText(e),true);}
  };
  window.addEventListener('beforeunload',event=>{if(state.dirty.size){event.preventDefault();event.returnValue='';}});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')saveAll().catch(e=>message('save-status',errorText(e),true));});
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'&&state.user){event.preventDefault();saveAll().catch(e=>message('save-status',errorText(e),true));}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='f'&&state.user){event.preventDefault();document.body.classList.remove('reader-focus');$('search').focus();}if(event.key==='Escape'){document.body.classList.remove('reader-focus');$('readerFocus').textContent='⤢ 뉴스 넓게';$('toolsMenu').hidden=true;$('company-menu').hidden=true;$('company-button').setAttribute('aria-expanded','false');}});
}
async function init() {
  if(document.readyState==='loading')await new Promise(resolve=>document.addEventListener('DOMContentLoaded',resolve,{once:true}));
  if(!window.supabase)throw new Error('로그인 라이브러리를 불러오지 못했습니다. 페이지를 새로고침해주세요.');
  client=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'interactive-lab-newsroom-auth'}});
  wireEvents();message('auth-status','이메일로 로그인하거나 새 계정을 만들어주세요.');
  client.auth.onAuthStateChange((event,session)=>{
    if(event==='PASSWORD_RECOVERY')recoveryMode=true;
    // Keep Supabase API requests outside its auth callback lock.
    setTimeout(()=>acceptSession(session).catch(e=>message('workspace-status',errorText(e),true)),0);
  });
  const data=await checked(client.auth.getSession());await acceptSession(data.session);
}
init().catch(e=>message('auth-status',errorText(e),true));
