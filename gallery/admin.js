/* 站长评论管理 */
(function(){
  'use strict';
  var $=function(s,r){return (r||document).querySelector(s);};
  var WORKER=window.WORKER; var TOKEN=null; var filter='all';
  function tok(){ try{ return sessionStorage.getItem('admin-token'); }catch(e){ return null; } }
  function setTok(t){ try{ t?sessionStorage.setItem('admin-token',t):sessionStorage.removeItem('admin-token'); }catch(e){} }
  function relTime(ts){ if(!ts) return ''; var s=Math.floor((Date.now()-ts)/1000); if(s<60)return s+'s ago'; if(s<3600)return Math.floor(s/60)+'m ago'; if(s<86400)return Math.floor(s/3600)+'h ago'; if(s<86400*30)return Math.floor(s/86400)+'d ago'; return new Date(ts).toLocaleDateString('zh-CN'); }
  function api(path, body){
    var o={ headers:{} }; if(body){ o.method='POST'; o.headers['Content-Type']='application/json'; o.body=JSON.stringify(body); }
    return fetch(WORKER+path+(body?'':'')+ (path.indexOf('?')>=0?'&':'?') + 'token='+encodeURIComponent(TOKEN||''), o)
      .then(function(r){ return r.json(); });
  }
  function showPanel(on){ $('#adminLogin').hidden=on; $('#adminPanel').hidden=!on; }
  function login(){
    TOKEN=$('#tokInput').value.trim(); setTok(TOKEN);
    api('/admin/comments?filter=all',{}).then(function(d){
      if(d && d.ok){ showPanel(true); load(); } else { $('#loginMsg').textContent='Token error'; }
    }).catch(function(){ $('#loginMsg').textContent='Network error'; });
  }
  $('#loginBtn').addEventListener('click', login);
  $('#tokInput').addEventListener('keydown', function(e){ if(e.key==='Enter') login(); });
  function load(){
    api('/admin/comments?filter='+filter, {}).then(function(d){
      if(!d||!d.ok){ return; }
      var list=d.comments||[]; var box=$('#aList'); box.innerHTML='';
      $('#aEmpty').hidden=list.length>0;
      var pend=0;
      list.forEach(function(c){ if(c.status==='pending') pend++; box.appendChild(row(c)); });
      $('#nPending').textContent=pend;
    }).catch(function(){});
  }
  function row(c){
    var el=document.createElement('div'); el.className='a-row'; el.dataset.id=c.id; el.dataset.photo=c.photo;
    var meta=document.createElement('div'); meta.className='a-meta';
    var a=document.createElement('a'); a.className='a-photo'; a.href='/gallery/'+c.photo+'/'; a.textContent='#'+c.photo; a.target='_blank';
    var who=document.createElement('span'); who.className='a-who'; who.textContent=c.author||'匿名';
    var stt=document.createElement('span'); stt.className='a-status '+c.status; stt.textContent=c.status==='published'?'已公开':(c.status==='pending'?'待审核':'已隐藏');
    if(c.parentId){ var rp=document.createElement('span'); rp.className='a-status'; rp.textContent='回复'; stt=rp; }
    var tm=document.createElement('span'); tm.className='a-time'; tm.textContent=relTime(c.createdAt);
    meta.appendChild(a); meta.appendChild(who); if(c.parentId) meta.appendChild(rp); else meta.appendChild(stt); meta.appendChild(tm);
    var ct=document.createElement('div'); ct.className='a-content'; ct.textContent=c.content||'';
    var acts=document.createElement('div'); acts.className='a-acts';
    function btn(label,cls,fn){ var b=document.createElement('button'); b.className='a-act'+(cls?' '+cls:''); b.textContent=label; b.addEventListener('click',fn); acts.appendChild(b); return b; }
    if(c.status!=='published'||c.parentId) btn('发布',null,function(){ setStatus(c,'published'); });
    if(!c.parentId && c.status!=='hidden') btn('隐藏',null,function(){ setStatus(c,'hidden'); });
    btn('删除','danger',function(){ if(confirm('删除这条评论？')) setStatus(c,'delete'); });
    if(!c.parentId){ var reply=document.createElement('div'); reply.className='a-reply';
      var inp=document.createElement('input'); inp.type='text'; inp.placeholder='以站长身份回复…';
      var sb=document.createElement('button'); sb.className='a-act'; sb.textContent='回复';
      sb.addEventListener('click',function(){ if(!inp.value.trim())return; api('/admin/reply',{photo:c.photo,parentId:c.id,content:inp.value.trim(),author:'LinSong'}).then(function(d){ if(d&&d.ok){ inp.value=''; load(); } }); });
      reply.appendChild(inp); reply.appendChild(sb); acts.appendChild(reply); }
    el.appendChild(meta); el.appendChild(ct); el.appendChild(acts);
    return el;
  }
  function setStatus(c,status){ api('/admin/set',{photo:c.photo,id:c.id,status:status}).then(function(d){ if(d&&d.ok) load(); }); }
  $('#aTabs').addEventListener('click',function(e){ var b=e.target.closest('.a-tab'); if(!b)return; filter=b.dataset.f;
    document.querySelectorAll('.a-tab').forEach(function(x){ x.classList.toggle('on',x===b); }); load(); });
  var t=tok(); if(t){ TOKEN=t; api('/admin/comments?filter=all',{}).then(function(d){ if(d&&d.ok) showPanel(true); }); }
})();
