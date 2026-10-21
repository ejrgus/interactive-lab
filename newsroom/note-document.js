const PREFIX='[newsroom-document:v1]\n';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function decodeNote(value='') {
  if(value.startsWith(PREFIX))try {
    const parts=JSON.parse(value.slice(PREFIX.length));
    if(Array.isArray(parts)&&parts.every(p=>p&&((p.type==='text'&&typeof p.text==='string')||(p.type==='image'&&typeof p.id==='string'&&uuid.test(p.id)))))return {rich:true,parts};
  } catch { /* Invalid or literal envelopes remain ordinary text. */ }
  return {rich:false,parts:[{type:'text',text:value}]};
}
export function encodeNote(parts,rich=false) {
  const merged=[];
  for(const p of parts) {
    if(p.type==='text') {
      if(!p.text)continue;
      if(merged.at(-1)?.type==='text')merged.at(-1).text+=p.text;else merged.push({type:'text',text:p.text});
    } else if(p.type==='image'&&uuid.test(p.id))merged.push({type:'image',id:p.id});
  }
  return rich||merged.some(p=>p.type==='image')?PREFIX+JSON.stringify(merged):merged.map(p=>p.text).join('');
}
export const noteText=value=>decodeNote(value).parts.filter(p=>p.type==='text').map(p=>p.text).join('');
export const noteMarkdown=value=>decodeNote(value).parts.map(p=>p.type==='text'?p.text:`\n\n[첨부 이미지: ${p.id}]\n\n`).join('');

export function editorParts(root) {
  if(root.childNodes.length===1&&root.firstChild?.nodeType===1&&(root.firstChild.tagName==='BR'||(['DIV','P'].includes(root.firstChild.tagName)&&root.firstChild.childNodes.length===1&&root.firstChild.firstChild?.tagName==='BR')))return [];
  const parts=[];
  const text=value=>{if(!value)return;if(parts.at(-1)?.type==='text')parts.at(-1).text+=value;else parts.push({type:'text',text:value});};
  const endsLine=()=>parts.at(-1)?.type==='text'&&parts.at(-1).text.endsWith('\n');
  function walk(node) {
    if(node.nodeType===3){text(node.nodeValue);return;}
    if(node.nodeType!==1)return;
    if(node.dataset.pendingImage||node.dataset.editorTail)return;
    if(node.dataset.imageId){parts.push({type:'image',id:node.dataset.imageId});return;}
    if(node.tagName==='BR'){text('\n');return;}
    const block=['DIV','P','LI'].includes(node.tagName);
    if(block&&node.previousSibling&&!endsLine())text('\n');
    for(const child of node.childNodes)walk(child);
    if(block&&node.nextSibling&&!endsLine())text('\n');
  }
  for(const child of root.childNodes)walk(child);
  return parts;
}
