export function noteWidthLimits(viewport, sidebars = 0) {
  const max = Math.max(220, Math.min(720, viewport - sidebars - 340));
  return { min:Math.min(260,max), max };
}

export function setupNoteLayout() {
  const notes=document.querySelector('.notes'),handle=document.getElementById('note-resize'),toggle=document.getElementById('expand-note');
  const desktop=matchMedia('(min-width:901px)'),storageKey='newsroom-note-width';
  let preferred=0,dragging=false;
  try { preferred=Number(localStorage.getItem(storageKey))||0; } catch { /* Preferences are optional. */ }
  const baseWidth=()=>innerWidth<=1100?255:innerWidth<=1300?270:300;
  const bounds=()=>noteWidthLimits(innerWidth,document.body.classList.contains('reader-focus')?0:['.sidebar','.library'].reduce((n,s)=>n+document.querySelector(s).getBoundingClientRect().width,0));
  function apply(width,remember=false) {
    if(!desktop.matches){document.documentElement.style.removeProperty('--note');handle.hidden=true;toggle.hidden=true;return;}
    handle.hidden=false;toggle.hidden=false;
    const {min,max}=bounds(),value=Math.round(Math.max(min,Math.min(max,width)));
    document.documentElement.style.setProperty('--note',`${value}px`);
    handle.setAttribute('aria-valuemin',String(min));handle.setAttribute('aria-valuemax',String(max));handle.setAttribute('aria-valuenow',String(value));
    handle.setAttribute('aria-valuetext',`메모 너비 ${value}픽셀`);
    const expanded=value>baseWidth()+30;
    toggle.textContent=expanded?'↔ 메모 접기':'↔ 메모 펼치기';toggle.setAttribute('aria-expanded',String(expanded));
    if(remember){preferred=value;try{localStorage.setItem(storageKey,String(value));}catch{}}
  }
  const refresh=()=>apply(preferred||baseWidth());
  toggle.onclick=()=>apply(toggle.getAttribute('aria-expanded')==='true'?baseWidth():Math.max(480,baseWidth()),true);
  handle.onkeydown=event=>{
    const width=notes.getBoundingClientRect().width,{min,max}=bounds(),step=event.shiftKey?10:30;
    const values={ArrowLeft:width+step,ArrowRight:width-step,Home:min,End:max};
    if(event.key in values){event.preventDefault();apply(values[event.key],true);}
  };
  handle.ondblclick=()=>apply(baseWidth(),true);
  handle.onpointerdown=event=>{
    if(event.button!==0||!desktop.matches)return;
    dragging=true;handle.setPointerCapture(event.pointerId);document.body.classList.add('resizing-note');event.preventDefault();
  };
  handle.onpointermove=event=>{if(dragging)apply(innerWidth-event.clientX,true);};
  const finish=()=>{dragging=false;document.body.classList.remove('resizing-note');};
  handle.onpointerup=finish;handle.onpointercancel=finish;handle.onlostpointercapture=finish;
  window.addEventListener('resize',refresh);desktop.addEventListener('change',refresh);
  new MutationObserver(refresh).observe(document.body,{attributes:true,attributeFilter:['class']});
  refresh();
}
