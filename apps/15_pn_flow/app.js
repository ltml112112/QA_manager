(function() {
'use strict';

/* ── 테마 동기화 ────────────────────────────────── */
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem('qa_theme', t);
}
applyTheme(localStorage.getItem('qa_theme') || 'dark');
window.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'setTheme') applyTheme(e.data.theme);
});

/* ── Firebase 초기화 ────────────────────────────── */
var firebaseConfig = {
  apiKey: "AIzaSyAk9PGqBHxiG9fVwVZZg6ZGBOWaaSAXOBc",
  authDomain: "qa-manager-9c145.firebaseapp.com",
  databaseURL: "https://qa-manager-9c145-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "qa-manager-9c145",
  storageBucket: "qa-manager-9c145.firebasestorage.app",
  messagingSenderId: "1037146076792",
  appId: "1:1037146076792:web:b8ddcdb31d527d2d545f8d"
};
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
var DB = firebase.database().ref('pn_flow_docs');

/* ── 상수 ───────────────────────────────────────── */
var CHIP_MAP = {
  wet: ['Si pass', 'Column', 'DCB', 'CF', 'MC/Hex', 'Act/Hex', 'EA/Hex', 'Tol/Act/Hex', 'DCB/Act/Hex', '결정화', '재결정', '고운'],
  subl: ['충주', '용인', '4,5-zone 수득', '6,7-zone 불순물 제거작업', '6,7-zone 취합', '소자평가 fail'],
  react: ['DMA', 'MeOH/H2O', '고체화'],
  solid: ['MeOH/H2O', '고체화'],
  collect: []
};

/* ── 상태 ───────────────────────────────────────── */
var STATE = { docs: {}, currentId: null, editKey: null, timer: null };

/* ── 헬퍼 함수 ──────────────────────────────────── */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function todayStr() { return new Date().toISOString().slice(0,10); }
function getDoc() { return STATE.docs[STATE.currentId]; }

function findStep(sid) {
  var doc = getDoc(); if(!doc) return;
  for(var s of doc.sections) for(var l of s.lots) for(var st of l.steps) if(st.id===sid) return st;
}
function findLot(lid) {
  var doc = getDoc(); if(!doc) return;
  for(var s of doc.sections) for(var l of s.lots) if(l.id===lid) return l;
}
function findStepLot(sid) {
  var doc = getDoc(); if(!doc) return;
  for(var s of doc.sections) for(var l of s.lots) if(l.steps.some(st=>st.id===sid)) return l;
}
function findLotSec(lid) {
  var doc = getDoc(); if(!doc) return;
  for(var s of doc.sections) if(s.lots.some(l=>l.id===lid)) return s;
}

function stepNum(steps, idx, type) { var n=0; for(var i=0;i<=idx;i++) if(steps[i].type===type) n++; return n; }
function stepLbl(s, n) {
  if(s.type==='wet') return n+'차 Wet 정제';
  if(s.type==='subl') return n+'차 '+(s.location ? s.location+' ' : '')+'승화정제';
  if(s.type==='react') return '반응';
  if(s.type==='solid') return '고체화';
  if(s.type==='collect') return '여액 취합';
  return '';
}

/* ── 팩토리 ────────────────────────────────────── */
function mkDoc(o) { return Object.assign({id:uid(),title:'새 Flow',material:'',author:'',date:todayStr(),sections:[]},o); }
function mkSec(t) { return {id:uid(),type:t||'P',lots:[]}; }
function mkLot(n,s) { return {id:uid(),name:n||'',subName:s||'',steps:[]}; }
function mkStep(t,o) { return Object.assign({id:uid(),type:t||'wet',detail:'',tag:null,location:''},o); }

/* ── Firebase 저장 ─────────────────────────────── */
function save() {
  clearTimeout(STATE.timer);
  STATE.timer = setTimeout(function() {
    var d = getDoc(); if(!d) return;
    DB.child(d.id).set(d);
  }, 1000);
}

function load() {
  DB.once('value', function(snap) {
    STATE.docs = snap.val() || {};
    if(!Object.keys(STATE.docs).length) {
      var doc = buildSeed();
      STATE.docs[doc.id] = doc;
      DB.child(doc.id).set(doc);
    }
    showList();
  });
}

/* ── 뮤테이터 ───────────────────────────────────── */
window.APP = {
  newDoc: function() {
    var d = mkDoc();
    STATE.docs[d.id] = d;
    STATE.currentId = d.id;
    render();
    save();
  },
  showList: function() {
    closeEdit();
    STATE.currentId = null;
    render();
  },
  openDoc: function(id) {
    STATE.currentId = id;
    render();
  },
  deleteDoc: function(id) {
    if(!confirm('삭제하시겠습니까?')) return;
    delete STATE.docs[id];
    DB.child(id).remove();
    render();
  },
  addSection: function(t) {
    var d = getDoc(); if(!d) return;
    d.sections.push(mkSec(t));
    save();
    render();
  },
  deleteSection: function(sid) {
    var d = getDoc(); if(!d) return;
    d.sections = d.sections.filter(s=>s.id!==sid);
    save();
    render();
  },
  addLot: function(sid) {
    var d = getDoc(); if(!d) return;
    var s = d.sections.find(x=>x.id===sid); if(!s) return;
    s.lots.push(mkLot('새 Lot'));
    save();
    render();
  },
  deleteLot: function(lid) {
    var d = getDoc(); if(!d) return;
    for(var s of d.sections) s.lots = s.lots.filter(l=>l.id!==lid);
    save();
    render();
  },
  addStep: function(lid, type) {
    var l = findLot(lid); if(!l) return;
    var st = mkStep(type);
    l.steps.push(st);
    STATE.editKey = st.id;
    save();
    render();
    setTimeout(function() {
      var ta = document.getElementById('ep-ta-'+st.id);
      if(ta) ta.focus();
    }, 30);
  },
  deleteStep: function(sid) {
    var l = findStepLot(sid); if(!l) return;
    l.steps = l.steps.filter(s=>s.id!==sid);
    if(STATE.editKey===sid) closeEdit();
    save();
    render();
  },
  moveStep: function(sid, dir) {
    var l = findStepLot(sid); if(!l) return;
    var i = l.steps.findIndex(s=>s.id===sid);
    if(i<0||(dir==='up'&&i===0)||(dir==='down'&&i===l.steps.length-1)) return;
    var j = dir==='up'?i-1:i+1;
    var t = l.steps[i]; l.steps[i]=l.steps[j]; l.steps[j]=t;
    save();
    render();
  },
  setSectionType: function(sid, type) {
    var d = getDoc(); if(!d) return;
    var s = d.sections.find(x=>x.id===sid); if(s) s.type=type;
    save();
    render();
  },
  updateLotName: function(lid, val) {
    var l = findLot(lid); if(l) l.name=val;
    save();
  },
  updateLotSub: function(lid, val) {
    var l = findLot(lid); if(l) l.subName=val;
    save();
  },
  onMetaChange: function() {
    var d = getDoc(); if(!d) return;
    d.title = document.getElementById('inp-title').value;
    d.material = document.getElementById('inp-material').value;
    d.author = document.getElementById('inp-author').value;
    d.date = document.getElementById('inp-date').value;
    save();
  },
  setStepField: function(sid, field, val) {
    var st = findStep(sid); if(st) st[field]=val;
    save();
    render();
  },
  setStepType: function(sid, type) {
    var st = findStep(sid); if(st) st.type=type;
    save();
    render();
  },
  onDetailInput: function(sid, val) {
    var st = findStep(sid); if(st) st.detail=val;
    save();
  },
  insertChip: function(sid, chip) {
    var ta = document.getElementById('ep-ta-'+sid); if(!ta) return;
    var s = ta.selectionStart, e = ta.selectionEnd;
    var before = ta.value.slice(0,s), after = ta.value.slice(e);
    var sep = (before && !/[\s_(\/]$/.test(before)) ? ' ' : '';
    ta.value = before + sep + chip + after;
    var pos = s + sep.length + chip.length;
    ta.setSelectionRange(pos, pos);
    ta.focus();
    APP.onDetailInput(sid, ta.value);
  },
  onStepClick: function(sid) {
    if(STATE.editKey===sid) { closeEdit(); return; }
    APP.openEdit(sid);
  },
  openEdit: function(sid) {
    closeEdit();
    STATE.editKey = sid;
    render();
    setTimeout(function() {
      var ta = document.getElementById('ep-ta-'+sid);
      if(ta) ta.focus();
    }, 30);
  },
  closeEdit: function() {
    closeEdit();
  }
};

function closeEdit() {
  STATE.editKey = null;
}

/* ── 렌더링 ────────────────────────────────────── */
function render() {
  if(!STATE.currentId) renderList();
  else renderDoc();
}

function renderList() {
  document.getElementById('v-list').classList.remove('pf-hidden');
  document.getElementById('v-doc').classList.add('pf-hidden');
  var docs = Object.values(STATE.docs).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  var html = docs.map(function(d) {
    var lc = d.sections.reduce((sum,s)=>sum+s.lots.length,0);
    return '<div class="pf-doc-card" onclick="APP.openDoc(\''+d.id+'\')">'+
      '<div class="pf-card-title">'+esc(d.title||'제목 없음')+'</div>'+
      '<div class="pf-card-meta">'+
      (d.material?'<span class="pf-card-chip mat">'+esc(d.material)+'</span>':'')+
      (d.author?'<span class="pf-card-chip">'+esc(d.author)+'</span>':'')+
      (d.date?'<span class="pf-card-chip date">'+esc(d.date)+'</span>':'')+
      '</div><div class="pf-card-stats">'+d.sections.length+'섹션 · '+lc+'Lot</div>'+
      '<button class="pf-card-del" onclick="APP.deleteDoc(\''+d.id+'\');event.stopPropagation()">삭제</button></div>';
  }).join('');
  document.getElementById('doc-grid').innerHTML = html;
  document.getElementById('list-empty').classList.toggle('pf-hidden', !!docs.length);
}

function renderDoc() {
  document.getElementById('v-list').classList.add('pf-hidden');
  document.getElementById('v-doc').classList.remove('pf-hidden');
  var d = getDoc(); if(!d) return;
  document.getElementById('inp-title').value = d.title||'';
  document.getElementById('inp-material').value = d.material||'';
  document.getElementById('inp-author').value = d.author||'';
  document.getElementById('inp-date').value = d.date||'';
  var html = (d.sections||[]).map(renderSec).join('') || '<p class="pf-no-section">섹션을 추가하세요.</p>';
  document.getElementById('doc-body').innerHTML = html;
}

function renderSec(s) {
  var tc = s.type==='N'?'pf-sec-n':'pf-sec-p';
  var lh = (s.lots||[]).map(l=>renderLot(l,s)).join('');
  return '<div class="pf-section" data-sec-id="'+s.id+'">'+
    '<div class="pf-sec-header '+tc+'">'+
    '<span class="pf-sec-type-badge">'+s.type+' Type</span>'+
    '<span class="pf-sec-lot-count">'+s.lots.length+' Lot</span>'+
    '<div class="pf-sec-ctrl">'+
    '<button class="pf-sec-tog'+(s.type==='P'?' active':'')+'" onclick="APP.setSectionType(\''+s.id+'\',\'P\',event)">P</button>'+
    '<button class="pf-sec-tog'+(s.type==='N'?' active':'')+'" onclick="APP.setSectionType(\''+s.id+'\',\'N\',event)">N</button>'+
    '<button class="pf-sec-del" onclick="APP.deleteSection(\''+s.id+'\',event)">✕ 섹션 삭제</button>'+
    '</div></div>'+
    '<div class="pf-lot-row">'+lh+
    '<div class="pf-add-lot-col"><button class="pf-add-lot-btn" onclick="APP.addLot(\''+s.id+'\',event)">+ Lot 추가</button></div>'+
    '</div></div>';
}

function renderLot(l, s) {
  var tc = s.type==='N'?'pf-lot-n':'pf-lot-p';
  var sh = (l.steps||[]).map((st,i)=>renderStep(st,l,i)).join('');
  return '<div class="pf-lot-col" data-lot-id="'+l.id+'">'+
    '<div class="pf-lot-header '+tc+'">'+
    '<input class="pf-lot-name-inp" value="'+esc(l.name)+'" placeholder="Lot 이름" onchange="APP.updateLotName(\''+l.id+'\',this.value)" onclick="event.stopPropagation()">'+
    '<input class="pf-lot-sub-inp" value="'+esc(l.subName||'')+'" placeholder="별칭 (선택)" onchange="APP.updateLotSub(\''+l.id+'\',this.value)" onclick="event.stopPropagation()">'+
    '<button class="pf-lot-del-btn" onclick="APP.deleteLot(\''+l.id+'\',event)">✕</button>'+
    '</div><div class="pf-steps-list">'+sh+'</div>'+
    '<div class="pf-add-step-bar">'+
    '<button class="pf-qadd react" onclick="APP.addStep(\''+l.id+'\',\'react\',event)">+반응</button>'+
    '<button class="pf-qadd solid" onclick="APP.addStep(\''+l.id+'\',\'solid\',event)">+고체화</button>'+
    '<button class="pf-qadd wet" onclick="APP.addStep(\''+l.id+'\',\'wet\',event)">+Wet</button>'+
    '<button class="pf-qadd subl" onclick="APP.addStep(\''+l.id+'\',\'subl\',event)">+승화</button>'+
    '<button class="pf-qadd collect" onclick="APP.addStep(\''+l.id+'\',\'collect\',event)">+여액</button>'+
    '</div></div>';
}

function renderStep(st, l, i) {
  var n = stepNum(l.steps, i, st.type);
  var lbl = stepLbl(st, n);
  var pending = st.tag==='pending'?'pf-pending':'';
  var editing = STATE.editKey===st.id?'pf-step-editing':'';
  var tagHtml = st.tag&&st.tag!=='pending'?'<span class="pf-tag pf-tag-'+st.tag+'">'+st.tag.toUpperCase()+'</span>':'';
  var stepHtml = '<div class="pf-step '+st.type+' '+pending+' '+editing+'" data-step-id="'+st.id+'" onclick="APP.onStepClick(\''+st.id+'\');event.stopPropagation()">'+
    '<div class="pf-step-hd"><span class="pf-step-lbl">'+esc(lbl)+tagHtml+'</span>'+
    '<span class="pf-step-btns">'+
    '<button class="pf-sb" onclick="APP.moveStep(\''+st.id+'\',\'up\');event.stopPropagation()">↑</button>'+
    '<button class="pf-sb" onclick="APP.moveStep(\''+st.id+'\',\'down\');event.stopPropagation()">↓</button>'+
    '<button class="pf-sb pf-sb-del" onclick="APP.deleteStep(\''+st.id+'\');event.stopPropagation()">✕</button>'+
    '</span></div>'+
    (st.detail?'<div class="pf-step-detail">'+esc(st.detail)+'</div>':'')+
    '</div>';
  var epHtml = (STATE.editKey===st.id) ? renderEditPanel(st, l) : '';
  return stepHtml + epHtml;
}

function renderEditPanel(st, l) {
  var chips = (CHIP_MAP[st.type]||[]).map(c=>'<button class="pf-chip" onclick="APP.insertChip(\''+st.id+'\',\''+c.replace(/'/g,"\\'")+'\')" data-chip="'+c+'">'+esc(c)+'</button>').join('');
  var locHtml = st.type==='subl'?
    '<div class="ep-row ep-row-loc"><span class="ep-lbl">위치</span>'+
    '<button class="ep-tog'+(st.location==='충주'?' ep-on':'')+'" onclick="APP.setStepField(\''+st.id+'\',\'location\',\'충주\')">충주</button>'+
    '<button class="ep-tog'+(st.location==='용인'?' ep-on':'')+'" onclick="APP.setStepField(\''+st.id+'\',\'location\',\'용인\')">용인</button>'+
    '<button class="ep-tog'+(!st.location?' ep-on':'')+'" onclick="APP.setStepField(\''+st.id+'\',\'location\',\'\')">미지정</button></div>':'';
  var tagHtml = '<div class="ep-row ep-row-tag"><span class="ep-lbl">결과</span>'+
    '<button class="ep-tog ep-pass'+(st.tag==='pass'?' ep-on':'')+'" onclick="APP.setStepField(\''+st.id+'\',\'tag\',\'pass\')">PASS</button>'+
    '<button class="ep-tog ep-fail'+(st.tag==='fail'?' ep-on':'')+'" onclick="APP.setStepField(\''+st.id+'\',\'tag\',\'fail\')">FAIL</button>'+
    '<button class="ep-tog ep-pend'+(st.tag==='pending'?' ep-on':'')+'" onclick="APP.setStepField(\''+st.id+'\',\'tag\',\'pending\')">예정</button>'+
    '<button class="ep-tog'+(!st.tag?' ep-on':'')+'" onclick="APP.setStepField(\''+st.id+'\',\'tag\',null)">없음</button></div>';
  return '<div class="pf-edit-panel" id="ep-'+st.id+'" onclick="event.stopPropagation()">'+
    '<div class="ep-row ep-row-type"><span class="ep-lbl">유형</span>'+
    ['react','solid','wet','subl','collect'].map(t=>'<button class="ep-type-btn '+t+(st.type===t?' ep-on':'')+'" onclick="APP.setStepType(\''+st.id+'\',\''+t+'\')">'+
    ({react:'반응',solid:'고체화',wet:'Wet',subl:'승화',collect:'여액'}[t])+'</button>').join('')+
    '</div>'+locHtml+tagHtml+
    '<div class="ep-detail-wrap"><textarea class="ep-ta" id="ep-ta-'+st.id+'" placeholder="상세 내용" oninput="APP.onDetailInput(\''+st.id+'\',this.value)" rows="3">'+
    esc(st.detail||'')+'</textarea><div class="ep-chips">'+chips+'</div></div></div>';
}

/* ── 시드 데이터 ────────────────────────────────── */
function buildSeed() {
  function psteps() { return [{type:'react',detail:''},{type:'wet',detail:'(Si pass)'},{type:'wet',detail:'(Si pass2)'},{type:'wet',detail:''},{type:'wet',detail:''}]; }
  var ps = mkSec('P');
  ps.lots = [mkLot('P-MI18-TOL','(L25I-305-108-TOL)'),mkLot('P-ND01-Tol3'),mkLot('P-ND06-Tol3')];
  ps.lots.forEach(l=>l.steps=psteps().map(s=>({...s,id:uid()})));

  var ns = mkSec('N');
  ns.lots = [
    Object.assign(mkLot('L26D-202-109-Si-R'),{steps:[
      {id:uid(),type:'react',detail:'(DMA)후',tag:null,location:''},
      {id:uid(),type:'solid',detail:'MeOH/H2O 고체화',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(Si pass_ DCB, MC/Hex 후 Act/Hex 결정화)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(column_ DCB, MC/Hex 후 Act/Hex 결정화)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(DCB/Act/Hex 재결정)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(Tol/Act/Hex 재결정)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(DCB/Act/Hex 재결정)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(DCB/Act/Hex 재결정)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(DCB/Act/Hex 재결정)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(DCB/Act/Hex) 재결정',tag:null,location:''},
      {id:uid(),type:'subl',detail:'(소자평가 fail)',tag:'fail',location:'충주'},
      {id:uid(),type:'wet',detail:'(DCB/Act/Hex 재결정)',tag:null,location:''},
      {id:uid(),type:'subl',detail:'(6,7-zone 불순물 제거작업)\n(4,5-zone 수득, 소자fail)',tag:'fail',location:'용인'},
      {id:uid(),type:'wet',detail:'(고운 Si pass_DCB, MC/Hex 후 Act/Hex 결졍화)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(Tol/Act/Hex 재결정)',tag:null,location:''},
      {id:uid(),type:'subl',detail:'(pass)',tag:'pass',location:'충주'}
    ]}),
    Object.assign(mkLot('P-ND14-COL-TOLAHX'),{steps:[
      {id:uid(),type:'react',detail:'(DMA)후 MeOH/H2O 고체화',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(Si pass_DCB, CF 후 Act/Hex 결정화)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(Column_DCB, MC/Hex 후 Act/Hex 결정화)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(DCB/Act/Hex 재결정)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(DCB/Act/Hex 재결정)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(DCB/Act/Hex 재결정)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(Tol/Act/Hex 재결정)',tag:null,location:''},
      {id:uid(),type:'subl',detail:'(fail)',tag:'fail',location:''},
      {id:uid(),type:'wet',detail:'',tag:'pending',location:''}
    ]}),
    Object.assign(mkLot('P-67zmix-TOLACHX'),{steps:[
      {id:uid(),type:'react',detail:'(DMA)후',tag:null,location:''},
      {id:uid(),type:'solid',detail:'MeOH/H2O 고체화',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(Si pass_ DCB, MC/Hex 후 Act/Hex 결정화)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(column_ DCB, MC/Hex 후 Act/Hex 결정화)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(DCB/Act/Hex 재결정)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(Tol/Act/Hex 재결정)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(DCB/Act/Hex 재결정)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(DCB/Act/Hex 재결정)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(DCB/Act/Hex 재결정)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(DCB/Act/Hx) 재결정',tag:null,location:''},
      {id:uid(),type:'subl',detail:'(소자평가 fail)',tag:'fail',location:'충주'},
      {id:uid(),type:'wet',detail:'(DCB/Act/Hx 재결정)',tag:null,location:''},
      {id:uid(),type:'subl',detail:'(6,7-zone 불순물 제거작업)\n(4,5-zone 수득, 소자fail)',tag:'fail',location:'용인'},
      {id:uid(),type:'subl',detail:'(6,7-zone 취합 후 추가 승화정제, 4,5-zone 회수)',tag:null,location:'용인'},
      {id:uid(),type:'wet',detail:'(고운 si pass_DCB, MC/Hx 후 Act/Hex 결정화)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(DCB/Act/Hx 재결정)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(Tol/Act/Hx 재결정)',tag:null,location:''},
      {id:uid(),type:'subl',detail:'',tag:null,location:'충주'}
    ]}),
    Object.assign(mkLot('L26B-202-101(4,5,6)'),{steps:[
      {id:uid(),type:'react',detail:'(DMA)후',tag:null,location:''},
      {id:uid(),type:'solid',detail:'MeOH/H2O 고체화',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(Si pass_ DCB, MC/Hex 후 Act/Hex 결정화)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(Column_DCB, MC/Hex 후 EA/Hex 결정화)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(DCB/Act/Hex 재결정)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(DCB/Act/Hex 재결정)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(DCB/Act/Hex 재결정)',tag:null,location:''},
      {id:uid(),type:'subl',detail:'(fail)',tag:'fail',location:''},
      {id:uid(),type:'wet',detail:'(고운 Si pass_DCB, MC/Hex 후 Act/Hex 결정화)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(DCB/Act/Hex 재결정)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(DCB/Act/Hex 재결정)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(DCB/Act/Hex 재결정)',tag:null,location:''},
      {id:uid(),type:'subl',detail:'(pass)',tag:'pass',location:''}
    ]}),
    Object.assign(mkLot('L26C-202-114(4,5,6)'),{steps:[
      {id:uid(),type:'react',detail:'(DMA)후',tag:null,location:''},
      {id:uid(),type:'solid',detail:'MeOH/H2O 고체화',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(Si pass_ DCB, MC/Hex 후 Act/Hex 결정화)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(Column_DCB, MC/Hex 후 EA/Hex 결정화)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(DCB/Act/Hex 재결정)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(DCB/Act/Hex 재결정)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(DCB/Act/Hex 재결정)',tag:null,location:''},
      {id:uid(),type:'subl',detail:'(fail)',tag:'fail',location:''},
      {id:uid(),type:'wet',detail:'(고운 Si pass_DCB, MC/Hex 후 Act/Hex 결정화)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'L26B-202-101 7,8,9차 재결정 여액 취합 후 Si pass 후 Act/Hex 결정화',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(DCB/Act/Hex 재결정)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(TolAct/Hex 재결정)',tag:null,location:''},
      {id:uid(),type:'subl',detail:'(pass)',tag:'pass',location:''}
    ]}),
    Object.assign(mkLot('P-ND02-COL-BOTTOM'),{steps:[
      {id:uid(),type:'collect',detail:'본품 재결정 여액 취합',tag:null,location:''},
      {id:uid(),type:'subl',detail:'(6,7-zone 불순물 제거작업)',tag:null,location:'용인'},
      {id:uid(),type:'subl',detail:'(6,7-zone 불순물 제거작업)',tag:null,location:'용인'},
      {id:uid(),type:'wet',detail:'(Column_DCB, MC/Hx 후 Act/Hx 결정화)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(DCB/Act/Hex 재결정)',tag:null,location:''},
      {id:uid(),type:'subl',detail:'',tag:null,location:'용인'}
    ]}),
    Object.assign(mkLot('P-ND08-TOLACHX3'),{steps:[
      {id:uid(),type:'react',detail:'(DMA)후 MeOH/H2O 고체화',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(Si pass_DCB, MC/Hx 후 Act/Hx 결정화)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(Column_DCB, MC/Hex 후 Act/Hx 결정화)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(Tol/Act/Hx 재결정)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(Tol/Act/Hex 재결정)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(Tol/Act/Hex 재결정)',tag:null,location:''},
      {id:uid(),type:'subl',detail:'(6,7-zone 불순물 제거작업)\n(4,5-zone 수득, 소자 fail)',tag:'fail',location:'용인'},
      {id:uid(),type:'wet',detail:'(column_DCB, MC/Hx 후 Act/Hx 결정화)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(DCB/Act/Hx 재결정)',tag:null,location:''},
      {id:uid(),type:'wet',detail:'(Tol/Act/Hx 재결정)',tag:null,location:''},
      {id:uid(),type:'subl',detail:'(pass)',tag:'pass',location:'용인'}
    ]})
  ];
  return mkDoc({title:'P/N Type 재료 공정 Flow 정리',material:'LT-PHM295',author:'백지홍',date:'2026-04-21',sections:[ps,ns]});
}

/* ── 초기화 ────────────────────────────────────── */
load();

})();
