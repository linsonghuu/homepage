/* 站长评论管理 */
(function(){
  'use strict';
  var $=function(s,r){return (r||document).querySelector(s);};
  var WORKER=window.WORKER; var TOKEN=null; var filter='all';
  function tok(){ try{ return sessionStorage.getItem('admin-token'); }catch(e){ return null; } }
  function setTok(t){ try{ t?sessionStorage.setItem('admin-token',t):sessionStorage.removeItem('admin-token'); }catch(e){} }
  function relTime(ts){ if(!ts) return ''; var s=Math.floor((Date.now()-ts)/1000); if(s<60)return s+'s ago'; if(s<3600)return Math.floor(s/60)+'m ago'; if(s<86400)return Math.floor(s/3600)+'h ago'; if(s<86400*30)return Math.floor(s/86400)+'d ago'; return new Date(ts).toLocaleDateString('zh-CN'); }
  function api(path, body){
    var o={ headers:{}, cache:'no-store' }; if(body){ o.method='POST'; o.headers['Content-Type']='application/json'; o.body=JSON.stringify(body); }
    return fetch(WORKER+path+(body?'':'')+ (path.indexOf('?')>=0?'&':'?') + 'token='+encodeURIComponent(TOKEN||''), o)
      .then(function(r){ return r.json(); });
  }
  function showPanel(on){ $('#adminLogin').hidden=on; $('#adminPanel').hidden=!on; }
  function login(){
    TOKEN=$('#tokInput').value.trim(); setTok(TOKEN);
    api('/admin/comments?filter=all',{}).then(function(d){
      if(d && d.ok){ showPanel(true); load(); loadMeta(); } else { $('#loginMsg').textContent='Token error'; }
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
  function setStatus(c,status){
    // 删除必须走 action:'delete'：Worker 的 status 白名单只认 hidden/pending/published，
    // 传 status:'delete' 会命中「未知状态→保持原值」并返回 ok:true，看似成功实则没删。
    var body = { photo:c.photo, id:c.id };
    if(status==='delete') body.action='delete'; else body.status=status;
    api('/admin/set',body).then(function(d){ if(d&&d.ok) load(); });
  }
  /* ── 图片文案编辑（大标题 / 小标题 / 分类 / 标签 / 日期）── */
  function loadMeta(){
    var box=$('#metaList'); if(!box) return;
    box.innerHTML='<div class="m-msg">加载中…</div>';
    Promise.all([
      fetch('/gallery/gallery.json',{cache:'no-cache'}).then(function(r){return r.json();}).catch(function(){return {items:[]};}),
      api('/gallery-meta', null)
    ]).then(function(res){
      var items=(res[0]&&res[0].items)||[];
      var map=(res[1]&&res[1].ok&&res[1].meta)||{};
      box.innerHTML='';
      items.forEach(function(it){ box.appendChild(metaRow(it, map[it.id]||null)); });
      if(!items.length) box.innerHTML='<div class="m-msg">暂无图片</div>';
    }).catch(function(){ box.innerHTML='<div class="m-msg">加载失败</div>'; });
  }
  function metaRow(it, ov){
    var o = ov || {};
    var el=document.createElement('div'); el.className='m-card';
    var id=document.createElement('div'); id.className='m-id'; id.textContent=it.id; el.appendChild(id);
    function field(label, tag, value, ph){
      var w=document.createElement('div'); w.className='m-field';
      var l=document.createElement('label'); l.textContent=label;
      var inp=document.createElement(tag); inp.value=value||''; if(ph) inp.placeholder=ph;
      if(tag==='textarea') inp.rows=3;
      w.appendChild(l); w.appendChild(inp); el.appendChild(w); return inp;
    }
    var title=field('大标题','input', o.title||it.title||'', '例如：灯海·招手');
    var desc =field('小标题 / 描述','textarea', (o.desc!=null?o.desc:(it.description||'')), '例如：灯会夜色里，狐狸耳朵的少女抬手打招呼。');
    var cat  =field('分类','input', o.category||it.category||'', 'VRChat');
    var tags =field('标签（逗号分隔）','input', (o.tags||it.tags||[]).join(', '), 'vrchat, 灯会, 夜景');
    var date =field('日期','input', o.date||it.date||'', '2026-02-04');
    var acts=document.createElement('div'); acts.className='m-acts';
    var save=document.createElement('button'); save.className='m-btn primary'; save.textContent='保存';
    var reset=document.createElement('button'); reset.className='m-btn'; reset.textContent='恢复默认';
    var msg=document.createElement('span'); msg.className='m-msg';
    save.addEventListener('click', function(){
      save.disabled=true; msg.textContent='保存中…';
      api('/admin/gallery-meta', {
        photo: it.id, title: title.value.trim(), desc: desc.value.trim(),
        category: cat.value.trim(), date: date.value.trim(),
        tags: tags.value.split(/[,，]/).map(function(s){return s.trim();}).filter(Boolean)
      }).then(function(d){
        save.disabled=false;
        if(d && d.ok){ msg.textContent='已保存 ✓'; setTimeout(function(){ if(msg.textContent==='已保存 ✓') msg.textContent=''; }, 1800); }
        else msg.textContent='保存失败：'+((d&&d.err)||'未知');
      }).catch(function(){ save.disabled=false; msg.textContent='网络错误'; });
    });
    reset.addEventListener('click', function(){
      if(!confirm('恢复为 gallery.json 里的默认文案？')) return;
      api('/admin/gallery-meta', {photo: it.id, clear:true}).then(function(d){
        if(d && d.ok){
          msg.textContent='已恢复默认';
          title.value=it.title||''; desc.value=it.description||''; cat.value=it.category||'';
          tags.value=(it.tags||[]).join(', '); date.value=it.date||'';
        } else msg.textContent='恢复失败';
      }).catch(function(){ msg.textContent='网络错误'; });
    });
    acts.appendChild(save); acts.appendChild(reset); acts.appendChild(msg);
    el.appendChild(acts);
    return el;
  }

  $('#aTabs').addEventListener('click',function(e){ var b=e.target.closest('.a-tab'); if(!b)return; filter=b.dataset.f;
    document.querySelectorAll('.a-tab').forEach(function(x){ x.classList.toggle('on',x===b); }); load(); });
  var t=tok(); if(t){ TOKEN=t; api('/admin/comments?filter=all',{}).then(function(d){ if(d&&d.ok){ showPanel(true); loadMeta(); } }); }
})();
