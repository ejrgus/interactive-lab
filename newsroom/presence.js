export const PRESENCE_TOPIC='newsroom:online';

export function onlineMembers(snapshot) {
  return Object.entries(snapshot).flatMap(([id,entries])=>{
    if(!Array.isArray(entries)||!entries.length)return [];
    const nickname=entries.find(p=>p&&typeof p.nickname==='string')?.nickname;
    return [{id,nickname:typeof nickname==='string'?nickname.slice(0,40):'회원'}];
  }).sort((a,b)=>a.nickname.localeCompare(b.nickname,'ko'));
}

export function createPresence(client,onChange) {
  let current=null,identity='',members=[],revision=0,removal=Promise.resolve();
  const emit=(status)=>onChange({status,members});
  function stop() {
    revision++;const old=current;current=null;identity='';members=[];emit('disconnected');
    if(old)removal=removal.then(()=>client.removeChannel(old)).catch(()=>{});
    return removal;
  }
  async function start(user,nickname) {
    const key=`${user.id}:${nickname}`;
    if(identity===key)return;
    const cleanup=stop(),version=revision;identity=key;emit('connecting');
    await cleanup;if(version!==revision)return;
    let channel;
    try{channel=client.channel(PRESENCE_TOPIC,{config:{private:true,presence:{key:user.id}}});}catch{emit('error');return;}
    current=channel;
    channel.on('presence',{event:'sync'},()=>{
      if(current!==channel)return;
      members=onlineMembers(channel.presenceState());emit('connected');
    }).subscribe(async status=>{
      if(current!==channel)return;
      if(status==='SUBSCRIBED') {
        try {
          const tracked=await channel.track({nickname:String(nickname||'회원').slice(0,40)});
          if(current!==channel)return;
          if(tracked!=='ok'){members=[];emit('error');}
        } catch {if(current===channel){members=[];emit('error');}}
      } else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){members=[];emit('error');}
    });
  }
  return {start,stop};
}
