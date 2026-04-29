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

/* ── 현재 사용자 & 초기 로드 ─────────────────────── */
var _currentUser = null;
var _loadStarted = false;
firebase.auth().onAuthStateChanged(function(u) {
  _currentUser = u;
  // DB 리스너는 첫 auth 콜백 이후 1회만 붙임
  // — auth 미해결 상태에서 on('value')를 붙이면 PERMISSION_DENIED로 리스너가
  //   취소되거나 빈 스냅샷이 _firstLoad를 소모해 실제 데이터가 늦게 반영됨
  if (!_loadStarted) {
    _loadStarted = true;
    load();
  }
});

/* ── 상수 ───────────────────────────────────────── */
var CHIP_MAP = {
  wet: ['Si pass', 'Column', 'DCB', 'CF', 'MC/Hex', 'Act/Hex', 'EA/Hex', 'Tol/Act/Hex', 'DCB/Act/Hex', '결정화', '재결정', '고운'],
  subl: ['충주', '용인', '4,5-zone 수득', '6,7-zone 불순물 제거작업', '6,7-zone 취합', '소자평가 fail'],
  react: ['DMA', 'MeOH/H2O', '결정화'],
  solid: ['MeOH/H2O', '결정화'],
  collect: []
};

var TYPE_LABEL = { react:'반응', solid:'결정화', wet:'Wet', subl:'승화', collect:'여액' };
var SEC_LABEL  = { P:'P Type', N:'N Type', S:'Single' };

/* ── 상태 ───────────────────────────────────────── */
var STATE = {
  docs: {}, currentId: null, editKey: null, timer: null,
  collapsedSecs: new Set(), collapsedLots: new Set()
};

var _undoStack = [];
var MAX_UNDO = 20;

function pushUndo() {
  var d = getDoc(); if(!d) return;
  _undoStack.push(JSON.stringify(d.sections));
  if (_undoStack.length > MAX_UNDO) _undoStack.shift();
  updateUndoBtn();
}

function updateUndoBtn() {
  var btn = document.getElementById('pf-undo-btn'); if(!btn) return;
  var n = _undoStack.length;
  btn.disabled = n === 0;
  btn.textContent = n > 0 ? '↩ 되돌리기 (' + n + ')' : '↩ 되돌리기';
}

/* ── 상대 시간 ─────────────────────────────────── */
function timeAgo(ts) {
  if (!ts) return '';
  var diff = Date.now() - ts;
  var min = Math.floor(diff / 60000);
  if (min < 1)  return '방금';
  if (min < 60) return min + '분 전';
  var hr = Math.floor(min / 60);
  if (hr < 24)  return hr + '시간 전';
  var d = Math.floor(hr / 24);
  return d < 7 ? d + '일 전' : new Date(ts).toLocaleDateString('ko-KR');
}

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
  if(s.type==='solid') return '결정화';
  if(s.type==='collect') return '여액 취합';
  return '';
}

/* ── 팩토리 ────────────────────────────────────── */
function mkDoc(o) { return Object.assign({id:uid(),title:'새 Flow',material:'',author:'',date:todayStr(),sections:[]},o); }
function mkSec(t) { return {id:uid(),type:t||'P',lots:[]}; }
function mkLot(n,s) { return {id:uid(),name:n||'',subName:s||'',steps:[]}; }
function mkStep(t,o) { return Object.assign({id:uid(),type:t||'wet',detail:'',tag:null,location:'',date:'',operator:''},o); }

/* ── Lot 최종상태 ───────────────────────────────── */
/* 마지막 "비-예정" 스텝의 tag로 판정. 없으면 'progress' */
function lotStatus(lot) {
  var steps = lot.steps || [];
  for (var i = steps.length - 1; i >= 0; i--) {
    var t = steps[i].tag;
    if (t === 'pass') return 'pass';
    if (t === 'fail') return 'fail';
  }
  return 'progress';
}

/* ── 저장 상태 표시 ─────────────────────────────── */
var _connected = true; // .info/connected 구독 전까지 가정
function setSaveStatus(state, msg) {
  var el = document.getElementById('pf-save-status'); if(!el) return;
  el.classList.remove('pf-ss-idle','pf-ss-saving','pf-ss-saved','pf-ss-error','pf-ss-offline');
  el.classList.add('pf-ss-'+state);
  var labels = { idle:'대기', saving:'저장 중...', saved:'저장됨', error:'저장 실패', offline:'오프라인' };
  var txt = el.querySelector('.pf-ss-txt'); if(txt) txt.textContent = labels[state] || state;
  el.title = msg || labels[state] || '';
}

/* ── Firebase 저장 ─────────────────────────────── */
var _pendingSave = false;
function flushSave() {
  if (!_pendingSave) return;
  clearTimeout(STATE.timer);
  _pendingSave = false;
  performSave();
}
function performSave() {
  var d = getDoc(); if(!d) return;
  d.updatedAt = Date.now();
  d.updatedBy = (_currentUser && _currentUser.email) || '';
  if (!_connected) { setSaveStatus('offline', '네트워크 연결을 확인하세요.'); return; }
  setSaveStatus('saving');
  DB.child(d.id).set(d)
    .then(function() {
      setSaveStatus('saved', '저장됨 ' + new Date().toLocaleTimeString());
      renderUpdatedInfo();
    })
    .catch(function(err) {
      console.error('[pn_flow] Firebase set 실패:', err && err.code, err && err.message, err);
      setSaveStatus('error', '저장 실패: ' + (err && (err.code || err.message) || '알 수 없는 오류'));
    });
}
function save() {
  clearTimeout(STATE.timer);
  _pendingSave = true;
  setSaveStatus('saving');
  STATE.timer = setTimeout(function() {
    _pendingSave = false;
    performSave();
  }, 1000);
}
window.addEventListener('beforeunload', flushSave);

var _firstLoad = true;
var SEED_ID  = 'phn295-example'; // 고정 ID — 버전 바꾸면 자동 갱신
var SEED_VER = 5;

/* ── Firebase 배열 정규화 ─────────────────────────
   Firebase RTDB는 배열을 {"0":..,"1":..} 객체로 저장.
   읽어올 때 sequential key이면 자동 복원하지만
   삭제·null 항목 등으로 키가 비면 객체로 반환됨.
   모든 sections/lots/steps를 반드시 JS 배열로 보장. */
function normDoc(d) {
  if (!d) return d;
  if (!Array.isArray(d.sections)) d.sections = d.sections ? Object.values(d.sections) : [];
  d.sections.forEach(function(s) {
    if (!Array.isArray(s.lots)) s.lots = s.lots ? Object.values(s.lots) : [];
    s.lots.forEach(function(l) {
      if (!Array.isArray(l.steps)) l.steps = l.steps ? Object.values(l.steps) : [];
    });
  });
  return d;
}

function load() {
  DB.on('value', function(snap) {
    var incoming = snap.val() || {};

    if (_firstLoad) {
      _firstLoad = false;

      // incoming 병합 — 로컬에서 막 생성한 문서(아직 저장 전)나 편집 중인 문서는 보존
      Object.keys(incoming).forEach(function(id) {
        if (id === STATE.currentId && (STATE.editKey || _pendingSave)) return;
        STATE.docs[id] = normDoc(incoming[id]);
      });

      // 고정 ID로 예시 문서 유무·버전 확인 → 없거나 구버전이면 (재)생성
      var ex = STATE.docs[SEED_ID];
      if (!ex || ex._seed !== SEED_VER) {
        var doc = buildSeed();
        doc.id   = SEED_ID;
        doc._seed = SEED_VER;
        STATE.docs[SEED_ID] = doc;
        DB.child(SEED_ID).set(doc);
      }

      render();
      return;
    }

    /* ── 실시간 업데이트 ────────────────────────────── */
    Object.keys(incoming).forEach(function(id) {
      if (id === STATE.currentId && (STATE.editKey || _pendingSave)) return;
      STATE.docs[id] = normDoc(incoming[id]);
    });
    // 다른 세션에서 삭제된 문서 반영
    // — 단, 로컬 편집/저장 대기 중인 문서는 삭제 제외
    //   (아직 Firebase에 없는 신규 문서가 삭제되면 currentId가 null로 리셋되고
    //    이후 save debounce가 터졌을 때 getDoc()이 undefined → save 포기가 됨)
    Object.keys(STATE.docs).forEach(function(id) {
      var isActive = id === STATE.currentId && (STATE.editKey || _pendingSave);
      if (!incoming[id] && !isActive) delete STATE.docs[id];
    });
    // 현재 보던 문서가 삭제됐으면 목록으로
    if (STATE.currentId && !STATE.docs[STATE.currentId]) {
      STATE.currentId = null;
      STATE.editKey = null;
    }

    if (!STATE.currentId) {
      renderList();
    } else if (!STATE.editKey) {
      render();
    }
  });
}

/* ── 뮤테이터 ───────────────────────────────────── */
window.APP = {
  onSearchInput: function() { renderList(); },
  initSortable: function() {
    if (typeof Sortable === 'undefined') return;
    var docBody = document.getElementById('doc-body');
    if (docBody) {
      Sortable.create(docBody, { animation: 150, handle: '.pf-sec-header', onEnd: function(evt) { APP.moveSecDrag(evt.oldIndex, evt.newIndex); } });
    }
    document.querySelectorAll('.pf-lot-row').forEach(function(row) {
      Sortable.create(row, { animation: 150, group: 'lots', handle: '.pf-lot-header', filter: '.pf-add-lot-col', onEnd: function(evt) {
        var fromSecId = evt.from.closest('.pf-section').dataset.secId;
        var toSecId = evt.to.closest('.pf-section').dataset.secId;
        APP.moveLotDrag(evt.item.dataset.lotId, fromSecId, toSecId, evt.oldIndex, evt.newIndex);
      }});
    });
    document.querySelectorAll('.pf-steps-list').forEach(function(list) {
      Sortable.create(list, { animation: 150, onEnd: function(evt) {
        var lotId = evt.from.closest('.pf-lot-col').dataset.lotId;
        APP.moveStepDrag(evt.item.dataset.stepId, lotId, lotId, evt.oldIndex, evt.newIndex);
      }});
    });
  },
  undo: function() {
    if (!_undoStack.length) return;
    var d = getDoc(); if(!d) return;
    d.sections = normDoc({sections: JSON.parse(_undoStack.pop())}).sections;
    updateUndoBtn();
    save(); render();
    setSaveStatus('saved', '실행 취소됨');
  },
  moveSecDrag: function(oldIdx, newIdx) {
    var d = getDoc(); if(!d) return;
    if (oldIdx === newIdx) return;
    pushUndo();
    var el = d.sections.splice(oldIdx, 1)[0];
    d.sections.splice(newIdx, 0, el);
    save(); render();
  },
  moveLotDrag: function(lotId, fromSecId, toSecId, oldIdx, newIdx) {
    var d = getDoc(); if(!d) return;
    var fS = d.sections.find(function(s){return s.id===fromSecId;});
    var tS = d.sections.find(function(s){return s.id===toSecId;});
    if(!fS || !tS) return;
    if (fromSecId === toSecId && oldIdx === newIdx) return;
    pushUndo();
    var l = fS.lots.splice(oldIdx, 1)[0];
    tS.lots.splice(newIdx, 0, l);
    save(); render();
  },
  moveStepDrag: function(stepId, fromLotId, toLotId, oldIdx, newIdx) {
    var d = getDoc(); if(!d) return;
    var fL, tL;
    d.sections.forEach(function(s) { s.lots.forEach(function(l) {
      if(l.id===fromLotId) fL = l;
      if(l.id===toLotId) tL = l;
    });});
    if(!fL || !tL) return;
    if (fromLotId === toLotId && oldIdx === newIdx) return;
    pushUndo();
    var st = fL.steps.splice(oldIdx, 1)[0];
    tL.steps.splice(newIdx, 0, st);
    save(); render();
  },
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
    _undoStack = [];
    updateUndoBtn();
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
  toggleSec: function(sid, ev) {
    if(ev) ev.stopPropagation();
    if(STATE.collapsedSecs.has(sid)) STATE.collapsedSecs.delete(sid);
    else STATE.collapsedSecs.add(sid);
    render();
  },
  toggleLot: function(lid, ev) {
    if(ev) ev.stopPropagation();
    if(STATE.collapsedLots.has(lid)) STATE.collapsedLots.delete(lid);
    else STATE.collapsedLots.add(lid);
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
  cloneLot: function(lid, ev) {
    if(ev) ev.stopPropagation();
    var d = getDoc(); if(!d) return;
    var src = findLot(lid); var sec = findLotSec(lid);
    if(!src || !sec) return;
    var copy = {
      id: uid(),
      name: (src.name || '') + ' (복제)',
      subName: src.subName || '',
      steps: (src.steps || []).map(function(st) {
        return Object.assign({}, st, { id: uid() });
      })
    };
    var idx = sec.lots.findIndex(l=>l.id===lid);
    sec.lots.splice(idx+1, 0, copy);
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
  // updateLotSub removed
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
    // date/operator는 드로어 내부 입력이라 full render 불필요
    if (field === 'tag' || field === 'type' || field === 'location') render();
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
    var prev = STATE.editKey;
    STATE.editKey = sid;
    // 스텝 카드 선택 표시 갱신 (editing class) + 드로어 열기
    if (prev !== sid) renderDoc();
    renderDrawer();
  },
  closeEdit: function() {
    closeEdit();
    renderDoc();
    renderDrawer();
  },
  exportXlsx: function() {
    var d = getDoc(); if(!d) { alert('문서가 선택되지 않았습니다.'); return; }
    if (typeof XLSX === 'undefined') { alert('XLSX 라이브러리를 불러오지 못했습니다.'); return; }

    /* ── Step type 색상 ─────────────────────────────── */
    var FILL = { react:'DBE7FF', solid:'E4F1FA', wet:'E0F5E6', subl:'EFE4FB', collect:'FFF6DB' };
    var FONT = { react:'1D4ED8', solid:'1A6A9F', wet:'166534', subl:'5B21B6', collect:'92400E' };

    var wb = XLSX.utils.book_new();

    /* ── Sheet 1: 문서정보 ───────────────────────────── */
    var meta = [
      ['제목',     d.title || ''],
      ['소재코드', d.material || ''],
      ['작성자',   d.author || ''],
      ['작성일',   d.date || ''],
      ['최근 수정', d.updatedAt ? new Date(d.updatedAt).toISOString().slice(0,16).replace('T',' ') : ''],
      ['수정자',   d.updatedBy || '']
    ];
    var wsMeta = XLSX.utils.aoa_to_sheet(meta);
    wsMeta['!cols'] = [{wch:14},{wch:60}];
    XLSX.utils.book_append_sheet(wb, wsMeta, '문서정보');

    /* ── Sheet 2: 공정도 (Lot별 열 레이아웃) ─────────── */
    var ws = {};
    var merges = [];
    var rowHeights = [];

    var sections = d.sections || [];
    var maxLots = 1;
    sections.forEach(function(s) { maxLots = Math.max(maxLots, (s.lots||[]).length); });

    function sc(r, c, v, s) {
      var addr = XLSX.utils.encode_cell({r:r, c:c});
      ws[addr] = { v: v, t: (typeof v === 'number') ? 'n' : 's', s: s || {} };
    }

    var curRow = 0;

    /* 문서 제목 행 */
    var titleVal = (d.title || 'P/N 공정 Flow') + (d.material ? '  (' + d.material + ')' : '');
    sc(curRow, 0, titleVal, {
      font: { bold:true, sz:13, color:{rgb:'111827'} },
      fill: { fgColor:{rgb:'F3F4F6'} },
      alignment: { horizontal:'center', vertical:'center' }
    });
    for (var fc = 1; fc < maxLots; fc++) sc(curRow, fc, '', { fill:{fgColor:{rgb:'F3F4F6'}} });
    if (maxLots > 1) merges.push({s:{r:curRow,c:0}, e:{r:curRow,c:maxLots-1}});
    rowHeights[curRow] = {hpt:22};
    curRow++;

    /* 각 섹션 블록 */
    sections.forEach(function(s) {
      var lots = s.lots || [];
      var lotCount = lots.length;
      if (!lotCount) return;

      var maxSteps = 0;
      lots.forEach(function(l) { maxSteps = Math.max(maxSteps, (l.steps||[]).length); });

      /* 섹션 헤더 */
      var secBg = s.type === 'P' ? '1D4ED8' : s.type === 'N' ? '6D28D9' : '047857';
      var secLbl = SEC_LABEL[s.type] + ' 섹션  (' + lotCount + '개 Lot' + (maxSteps ? ', 최대 ' + maxSteps + ' 공정' : '') + ')';
      sc(curRow, 0, secLbl, {
        font: { bold:true, sz:11, color:{rgb:'FFFFFF'} },
        fill: { fgColor:{rgb:secBg} },
        alignment: { horizontal:'center', vertical:'center' }
      });
      for (var fc2 = 1; fc2 < lotCount; fc2++) sc(curRow, fc2, '', { fill:{fgColor:{rgb:secBg}} });
      if (lotCount > 1) merges.push({s:{r:curRow,c:0}, e:{r:curRow,c:lotCount-1}});
      rowHeights[curRow] = {hpt:18};
      curRow++;

      /* Lot 이름 행 */
      var nameBg = s.type === 'P' ? 'DBEAFE' : s.type === 'N' ? 'EDE9FE' : 'D1FAE5';
      lots.forEach(function(l, ci) {
        var stKey = lotStatus(l);
        var stLbl = {pass:' [PASS]', fail:' [FAIL]', progress:' [진행 중]'}[stKey] || '';
        var nameStr = (l.name || '(이름 없음)') + stLbl + (l.subName ? '\n(' + l.subName + ')' : '');
        sc(curRow, ci, nameStr, {
          font: { bold:true, sz:10, color:{rgb:'1E293B'} },
          fill: { fgColor:{rgb:nameBg} },
          alignment: { horizontal:'center', vertical:'center', wrapText:true }
        });
      });
      rowHeights[curRow] = {hpt: lots.some(function(l){return l.subName;}) ? 30 : 18};
      curRow++;

      /* 공정 행 */
      if (maxSteps > 0) {
        for (var si = 0; si < maxSteps; si++) {
          var rowH = 15;
          lots.forEach(function(l, ci) {
            var steps = l.steps || [];
            var st = steps[si];
            if (!st) {
              sc(curRow, ci, '', { fill:{fgColor:{rgb:'F9FAFB'}} });
              return;
            }
            var n = stepNum(steps, si, st.type);
            var lbl = stepLbl(st, n);
            var tagStr = st.tag === 'pass' ? ' ✓' : st.tag === 'fail' ? ' ✗' : st.tag === 'pending' ? ' ⋯' : '';
            var parts = [lbl + tagStr];
            if (st.location) parts.push('위치: ' + st.location);
            if (st.detail)   parts.push(st.detail);
            var dateParts = [st.date || '', st.operator || ''].filter(Boolean);
            if (dateParts.length) parts.push(dateParts.join(' · '));
            var cellVal = parts.join('\n');
            if (cellVal.split('\n').length > rowH / 15) rowH = cellVal.split('\n').length * 15;
            var fill = FILL[st.type] || 'F3F4F6';
            var fontClr = st.tag === 'fail' ? 'DC2626' : (FONT[st.type] || '374151');
            sc(curRow, ci, cellVal, {
              font: { sz:9, color:{rgb:fontClr}, bold: st.tag === 'fail' },
              fill: { fgColor:{rgb:fill} },
              alignment: { wrapText:true, vertical:'top' }
            });
          });
          rowHeights[curRow] = {hpt: Math.max(rowH, 28)};
          curRow++;
        }
      }

      /* 구분 빈 행 */
      curRow++;
    });

    /* 시트 범위 & 설정 */
    ws['!ref'] = XLSX.utils.encode_range({s:{r:0,c:0}, e:{r:curRow-1, c:maxLots-1}});
    ws['!merges'] = merges;
    var cols = [];
    for (var ci2 = 0; ci2 < maxLots; ci2++) cols.push({wch:30});
    ws['!cols'] = cols;
    ws['!rows'] = rowHeights;

    XLSX.utils.book_append_sheet(wb, ws, '공정도');

    var fname = (d.material || d.title || 'PN_Flow').replace(/[\\/:*?"<>|]/g,'_') + '_' + (d.date || todayStr()) + '.xlsx';
    XLSX.writeFile(wb, fname);
  }
};

function closeEdit() {
  STATE.editKey = null;
}

/* ── 키보드 단축키 ───────────────────────────────── */
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && STATE.editKey) { closeEdit(); renderDoc(); renderDrawer(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && STATE.currentId && !STATE.editKey) {
    e.preventDefault();
    APP.undo();
  }
});

/* ── 렌더링 ────────────────────────────────────── */
function render() {
  if(!STATE.currentId) renderList();
  else { renderDoc(); renderDrawer(); }
}

function renderList() {
  document.getElementById('v-list').classList.remove('pf-hidden');
  document.getElementById('v-doc').classList.add('pf-hidden');
  var keyword = (document.getElementById('list-search') ? document.getElementById('list-search').value : '').toLowerCase();
  var docs = Object.values(STATE.docs).sort(function(a,b){
    return (b.date||'').localeCompare(a.date||'');
  }).filter(function(d) {
    if(!keyword) return true;
    var t = (d.title||'').toLowerCase();
    var m = (d.material||'').toLowerCase();
    var a = (d.author||'').toLowerCase();
    return t.indexOf(keyword) !== -1 || m.indexOf(keyword) !== -1 || a.indexOf(keyword) !== -1;
  });
  var html = docs.map(function(d) {
    var secs = Array.isArray(d.sections) ? d.sections : Object.values(d.sections||{});
    var lc = secs.reduce(function(sum,s){
      var lots = Array.isArray(s.lots) ? s.lots : Object.values(s.lots||{});
      return sum + lots.length;
    }, 0);
    var updInfo = d.updatedAt
      ? '<span class="pf-card-upd"> · '+timeAgo(d.updatedAt)+(d.updatedBy?' · '+esc(d.updatedBy.split('@')[0]):'')+'</span>'
      : '';
    return '<div class="pf-doc-card" onclick="APP.openDoc(\''+d.id+'\')">'+
      '<div class="pf-card-title">'+esc(d.title||'제목 없음')+'</div>'+
      '<div class="pf-card-meta">'+
      (d.material?'<span class="pf-card-chip mat">'+esc(d.material)+'</span>':'')+
      (d.author?'<span class="pf-card-chip">'+esc(d.author)+'</span>':'')+
      (d.date?'<span class="pf-card-chip date">'+esc(d.date)+'</span>':'')+
      '</div><div class="pf-card-stats">'+secs.length+'섹션 · '+lc+' Lot'+updInfo+'</div>'+
      '<button class="pf-card-del" onclick="APP.deleteDoc(\''+d.id+'\');event.stopPropagation()">삭제</button></div>';
  }).join('');
  document.getElementById('doc-grid').innerHTML = html || '';
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
  renderSummary();
  var secs = d.sections||[];
  var html = secs.length === 0 ? renderEmptyDoc() : secs.map(renderSec).join('');
  document.getElementById('doc-body').innerHTML = html;
  renderUpdatedInfo();
  APP.initSortable();
}

/* ── 요약 스트립 ───────────────────────────────── */
function renderSummary() {
  var d = getDoc(); if(!d) return;
  var counts = { P:0, N:0, S:0, lots:0, pass:0, fail:0, progress:0 };
  (d.sections||[]).forEach(function(s) {
    if (s.type === 'P' || s.type === 'N' || s.type === 'S') counts[s.type] += (s.lots||[]).length;
    (s.lots||[]).forEach(function(l) {
      counts.lots++;
      counts[lotStatus(l)]++;
    });
  });
  var el = document.getElementById('doc-summary');
  if (!el) return;
  el.innerHTML =
    '<span class="pf-sum-chip pf-sum-p">P Type <b>'+counts.P+'</b></span>'+
    '<span class="pf-sum-chip pf-sum-n">N Type <b>'+counts.N+'</b></span>'+
    '<span class="pf-sum-chip pf-sum-s">Single <b>'+counts.S+'</b></span>'+
    '<span class="pf-sum-sep"></span>'+
    '<span class="pf-sum-chip">전체 Lot <b>'+counts.lots+'</b></span>'+
    '<span class="pf-sum-chip pf-sum-pass">PASS <b>'+counts.pass+'</b></span>'+
    '<span class="pf-sum-chip pf-sum-fail">FAIL <b>'+counts.fail+'</b></span>'+
    '<span class="pf-sum-chip pf-sum-prog">진행 중 <b>'+counts.progress+'</b></span>';
}

/* ── 변경 이력 표시 ─────────────────────────────── */
function renderUpdatedInfo() {
  var d = getDoc(); var el = document.getElementById('pf-updated-info');
  if (!el) return;
  if (!d || !d.updatedAt) { el.textContent = ''; return; }
  var dt = new Date(d.updatedAt);
  var y = dt.getFullYear(), m = String(dt.getMonth()+1).padStart(2,'0'), day = String(dt.getDate()).padStart(2,'0');
  var hh = String(dt.getHours()).padStart(2,'0'), mm = String(dt.getMinutes()).padStart(2,'0');
  var by = d.updatedBy ? ' · '+d.updatedBy : '';
  el.textContent = '최근 수정 '+y+'-'+m+'-'+day+' '+hh+':'+mm+by;
}

function renderSec(s) {
  var tc = s.type==='N'?'pf-sec-n':(s.type==='S'?'pf-sec-s':'pf-sec-p');
  var isCollapsed = STATE.collapsedSecs.has(s.id);
  var d = getDoc();
  var secIdx = d ? d.sections.indexOf(s) : -1;
  var canUp   = secIdx > 0;
  var canDown = d ? secIdx < d.sections.length - 1 : false;
  var bodyHtml = isCollapsed
    ? (function() {
        var counts = {pass:0,fail:0,progress:0};
        (s.lots||[]).forEach(function(l){ counts[lotStatus(l)]++; });
        return '<div class="pf-sec-collapsed-bar '+tc+'">'
          +'<span>'+s.lots.length+' Lot</span>'
          +'<span>✅ PASS '+counts.pass+'</span>'
          +'<span>❌ FAIL '+counts.fail+'</span>'
          +'<span>🔄 진행 중 '+counts.progress+'</span>'
          +'<button class="pf-sec-collapse" onclick="APP.toggleSec(\''+s.id+'\',event)">▶ 펼치기</button>'
          +'</div>';
      })()
    : '<div class="pf-lot-row">'+
      (s.lots||[]).map(l=>renderLot(l,s)).join('')+
      '<div class="pf-add-lot-col"><button class="pf-add-lot-btn" onclick="APP.addLot(\''+s.id+'\',event)">+ Lot 추가</button></div>'+
      '</div>';
  return '<div class="pf-section" data-sec-id="'+s.id+'">'+
    '<div class="pf-sec-header '+tc+'">'+
    '<button class="pf-sec-collapse" onclick="APP.toggleSec(\''+s.id+'\',event)">'+(isCollapsed?'▶':'▼')+'</button>'+
    '<span class="pf-sec-type-badge">'+SEC_LABEL[s.type]+'</span>'+
    '<span class="pf-sec-lot-count">'+s.lots.length+' Lot</span>'+
    '<div class="pf-sec-ctrl">'+
    '<button class="pf-sec-tog'+(s.type==='P'?' active':'')+'" onclick="APP.setSectionType(\''+s.id+'\',\'P\',event)">P</button>'+
    '<button class="pf-sec-tog'+(s.type==='N'?' active':'')+'" onclick="APP.setSectionType(\''+s.id+'\',\'N\',event)">N</button>'+
    '<button class="pf-sec-tog'+(s.type==='S'?' active':'')+'" onclick="APP.setSectionType(\''+s.id+'\',\'S\',event)">S</button>'+
    '<button class="pf-sec-del" onclick="APP.deleteSection(\''+s.id+'\',event)">✕ 섹션 삭제</button>'+
    '</div></div>'+
    bodyHtml+'</div>';
}

function renderLot(l, s) {
  var tc = s.type==='N'?'pf-lot-n':(s.type==='S'?'pf-lot-s':'pf-lot-p');
  var status = lotStatus(l);
  var statusLbl = {pass:'PASS', fail:'FAIL', progress:'진행 중'}[status];
  var isCollapsed = STATE.collapsedLots.has(l.id);
  var lastStep = (l.steps||[]).filter(st=>st.tag&&st.tag!=='pending').slice(-1)[0];
  var lastInfo = lastStep
    ? (stepLbl(lastStep, stepNum(l.steps, l.steps.indexOf(lastStep), lastStep.type))
       + (lastStep.date?' · '+lastStep.date:'')
       + (lastStep.operator?' · '+lastStep.operator:''))
    : (l.steps&&l.steps.length ? l.steps.length+'스텝' : '스텝 없음');
  var bodyHtml = isCollapsed
    ? '<div class="pf-lot-collapsed-body">'+
        '<span>총 '+(l.steps||[]).length+'스텝</span>'+
        (lastInfo?'<span>마지막: '+esc(lastInfo)+'</span>':'')+
        '<button class="pf-add-lot-btn" style="margin-top:4px" onclick="APP.toggleLot(\''+l.id+'\',event)">▶ 펼치기</button>'+
      '</div>'
    : '<div class="pf-steps-list">'+
        (l.steps||[]).map((st,i)=>renderStep(st,l,i)).join('')+
      '</div>'+
      '<div class="pf-add-step-bar">'+
      '<button class="pf-qadd react" onclick="APP.addStep(\''+l.id+'\',\'react\',event)">+반응</button>'+
      '<button class="pf-qadd solid" onclick="APP.addStep(\''+l.id+'\',\'solid\',event)">+결정화</button>'+
      '<button class="pf-qadd wet" onclick="APP.addStep(\''+l.id+'\',\'wet\',event)">+Wet</button>'+
      '<button class="pf-qadd subl" onclick="APP.addStep(\''+l.id+'\',\'subl\',event)">+승화</button>'+
      '<button class="pf-qadd collect" onclick="APP.addStep(\''+l.id+'\',\'collect\',event)">+여액</button>'+
      '</div>';
  return '<div class="pf-lot-col pf-lot-st-'+status+'" data-lot-id="'+l.id+'">'+
    '<div class="pf-lot-header '+tc+'">'+
    '<div class="pf-lot-head-top">'+
      '<span class="pf-lot-status pf-st-'+status+'">'+statusLbl+'</span>'+
      '<button class="pf-lot-collapse-btn" title="접기/펼치기" onclick="APP.toggleLot(\''+l.id+'\',event)">'+(isCollapsed?'▶':'▼')+'</button>'+
      '<button class="pf-lot-ctl-btn" title="Lot 복제" onclick="APP.cloneLot(\''+l.id+'\',event)">⎘</button>'+
      '<button class="pf-lot-ctl-btn pf-lot-del-btn" title="Lot 삭제" onclick="APP.deleteLot(\''+l.id+'\',event)">✕</button>'+
    '</div>'+
    '<input class="pf-lot-name-inp" value="'+esc(l.name)+'" placeholder="Lot 이름" oninput="APP.updateLotName(\''+l.id+'\',this.value)" onclick="event.stopPropagation()">'+
    '</div>'+bodyHtml+'</div>';
}

function renderStep(st, l, i) {
  var n = stepNum(l.steps, i, st.type);
  var lbl = stepLbl(st, n);
  var pending = st.tag==='pending'?'pf-pending':'';
  var editing = STATE.editKey===st.id?'pf-step-editing':'';
  var tagHtml = st.tag&&st.tag!=='pending'?'<span class="pf-tag pf-tag-'+st.tag+'">'+st.tag.toUpperCase()+'</span>':'';
  var metaParts = [];
  if (st.date)     metaParts.push('<span class="pf-step-date">📅 '+esc(st.date)+'</span>');
  if (st.operator) metaParts.push('<span class="pf-step-op">👤 '+esc(st.operator)+'</span>');
  var metaHtml = metaParts.length ? '<div class="pf-step-meta">'+metaParts.join('')+'</div>' : '';
  var stepHtml = '<div class="pf-step '+st.type+' '+pending+' '+editing+'" data-step-id="'+st.id+'" onclick="APP.onStepClick(\''+st.id+'\');event.stopPropagation()">'+
    '<div class="pf-step-hd"><span class="pf-step-lbl">'+esc(lbl)+tagHtml+'</span>'+
    '<span class="pf-step-btns">'+
    '<button class="pf-sb pf-sb-del" onclick="APP.deleteStep(\''+st.id+'\');event.stopPropagation()">✕</button>'+
    '</span></div>'+
    (st.detail?'<div class="pf-step-detail">'+esc(st.detail)+'</div>':'')+
    metaHtml+
    '</div>';
  return stepHtml;
}

/* 드로어 안에 렌더되는 편집 내용 (래퍼 없이 내용만) */
function renderEditPanelInner(st) {
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
  var metaHtml = '<div class="ep-row ep-row-meta">'+
    '<span class="ep-lbl">진행</span>'+
    '<input type="date" class="ep-inp ep-inp-date" value="'+esc(st.date||'')+'" oninput="APP.setStepField(\''+st.id+'\',\'date\',this.value)">'+
    '<input type="text" class="ep-inp ep-inp-op" placeholder="담당자" value="'+esc(st.operator||'')+'" oninput="APP.setStepField(\''+st.id+'\',\'operator\',this.value)">'+
    '</div>';
  return '<div class="ep-row ep-row-type"><span class="ep-lbl">유형</span>'+
    ['react','solid','wet','subl','collect'].map(t=>'<button class="ep-type-btn '+t+(st.type===t?' ep-on':'')+'" onclick="APP.setStepType(\''+st.id+'\',\''+t+'\')">'+
    ({react:'반응',solid:'결정화',wet:'Wet',subl:'승화',collect:'여액'}[t])+'</button>').join('')+
    '</div>'+locHtml+tagHtml+metaHtml+
    '<div class="ep-detail-wrap"><textarea class="ep-ta" id="ep-ta-'+st.id+'" placeholder="상세 내용" oninput="APP.onDetailInput(\''+st.id+'\',this.value)" rows="6">'+
    esc(st.detail||'')+'</textarea><div class="ep-chips">'+chips+'</div></div>';
}

/* ── 드로어 렌더 ─────────────────────────────────── */
function renderDrawer() {
  var drawer = document.getElementById('pf-drawer');
  var body   = document.getElementById('pf-drawer-body');
  var lbl    = document.getElementById('pf-drawer-lbl');
  if (!drawer || !body) return;
  if (!STATE.editKey) { drawer.classList.remove('pf-drawer-open'); return; }
  var st = findStep(STATE.editKey);
  var l  = findStepLot(STATE.editKey);
  if (!st || !l) { drawer.classList.remove('pf-drawer-open'); return; }
  drawer.classList.add('pf-drawer-open');
  var i = l.steps.findIndex(s=>s.id===STATE.editKey);
  var n = stepNum(l.steps, i, st.type);
  if (lbl) lbl.textContent = stepLbl(st,n) + '  ·  ' + (l.name||'');
  // 커서 보존
  var ta = document.getElementById('ep-ta-'+st.id);
  var hadFocus = ta && document.activeElement === ta;
  var sel = ta ? [ta.selectionStart, ta.selectionEnd] : [0,0];
  body.innerHTML = renderEditPanelInner(st);
  var newTa = document.getElementById('ep-ta-'+st.id);
  if (newTa) {
    if (hadFocus) { newTa.focus(); try { newTa.setSelectionRange(sel[0],sel[1]); } catch(e){} }
    else newTa.focus();
  }
}

/* ── 빈 문서 CTA ─────────────────────────────────── */
function renderEmptyDoc() {
  return '<div class="pf-empty-doc">'+
    '<div class="pf-empty-doc-title">첫 섹션을 추가해 시작하세요</div>'+
    '<div class="pf-empty-doc-sub">소재의 Type에 맞는 섹션을 선택하세요</div>'+
    '<div class="pf-empty-doc-btns">'+
    '<button class="pf-empty-btn pf-empty-p" onclick="APP.addSection(\'P\')">'+
    '<span class="pf-empty-btn-type">P</span><span>P Type 섹션</span></button>'+
    '<button class="pf-empty-btn pf-empty-n" onclick="APP.addSection(\'N\')">'+
    '<span class="pf-empty-btn-type">N</span><span>N Type 섹션</span></button>'+
    '<button class="pf-empty-btn pf-empty-s" onclick="APP.addSection(\'S\')">'+
    '<span class="pf-empty-btn-type">S</span><span>Single 섹션</span></button>'+
    '</div></div>';
}

/* ── 시드 데이터 ────────────────────────────────── */
function S(type,detail,tag,location){ return {id:uid(),type:type,detail:detail||'',tag:tag||null,location:location||''}; }

function buildSeed() {
  var ps = mkSec('P');
  ps.lots = [
    Object.assign(mkLot('P-MI18-TOL (1,704g)', '(L25I-305-108-TOL)'), {steps:[
      S('react','(Xylene) 후 농축/결정화(ACT)'),
      S('wet',  '(Si pass, DCB, MC/Hex)'),
      S('solid','농축/결정화(ACT)'),
      S('wet',  '(H2O slurry)'),
      S('wet',  '(재결정, DCB/MC)'),
      S('wet',  '(Slurry, Toluene)'),
      S('subl', '후 재처리'),
      S('wet',  '재결정(DCB/MC)'),
      S('wet',  '슬러리(Toluene)')
    ]}),
    Object.assign(mkLot('P-ND01-Tol3 (538g)'), {steps:[
      S('react','(Xylene) 후 농축/결정화(ACT)'),
      S('wet',  '(Si pass, DCB, MC/Hex)'),
      S('solid','농축/결정화(ACT)'),
      S('wet',  '(Si pass, DCB, MC/Hex, 고운실리카)'),
      S('solid','농축/결정화(ACT)'),
      S('wet',  '(Slurry, Toluene)'),
      S('wet',  '(재결정, DCB/MC)'),
      S('wet',  '(Slurry, Toluene)'),
      S('wet',  '(Slurry, Toluene)')
    ]}),
    Object.assign(mkLot('P-ND06-Tol3 (815g)'), {steps:[
      S('react','(Xylene) 후 농축/결정화(ACT)'),
      S('wet',  '(Si pass, DCB, MC/Hex)'),
      S('solid','농축/결정화(ACT)'),
      S('wet',  '(Si pass, DCB, MC/Hex, 고운실리카)'),
      S('solid','농축/결정화(ACT)'),
      S('wet',  '(Slurry, Toluene)'),
      S('wet',  '(재결정, DCB/MC)'),
      S('wet',  '(Slurry, Toluene)'),
      S('wet',  '(Slurry, Toluene)')
    ]})
  ];

  var ns = mkSec('N');
  ns.lots = [
    Object.assign(mkLot('L26D-202-109-Si-R'), {steps:[
      S('react','(DMA)후'),
      S('solid','MeOH/H2O  결정화'),
      S('wet','(Si pass_ DCB, MC/Hex 후 Act/Hex 결정화)'),
      S('wet','(column_ DCB, MC/Hex 후 Act/Hex 결정화)'),
      S('wet','(DCB/Act/Hex 재결정)'),
      S('wet','(Tol/Act/Hex 재결정)'),
      S('wet','(DCB/Act/Hex  재결정)'),
      S('wet','(DCB/Act/Hex 재결정)'),
      S('wet','(DCB/Act/Hex  재결정)'),
      S('wet','(DCB/Act/Hex) 재결정'),
      S('subl','(소자평가 fail)','fail','충주'),
      S('wet','(DCB/Act/Hex 재결정)'),
      S('subl','(6,7-zone 불순물 제거작업)\n(4,5-zone 수득, 소자fail)','fail','용인'),
      S('wet','(고운 Si pass_DCB, MC/Hex 후 Act/Hex 결졍화)'),
      S('wet','(Tol/Act/Hex 재결정)'),
      S('subl','(pass)','pass','충주')
    ]}),
    Object.assign(mkLot('P-ND14-COL-TOLAHX'), {steps:[
      S('react','(DMA)후 MeOH/H2O  결정화'),
      S('wet','(Si pass_DCB, CF 후 Act/Hex 결정화)'),
      S('wet','(Column_DCB, MC/Hex 후 Act/Hex 결정화)'),
      S('wet','(DCB/Act/Hex 재결정)'),
      S('wet','(DCB/Act/Hex 재결정)'),
      S('wet','(DCB/Act/Hex 재결정)'),
      S('wet','(Tol/Act/Hex 재결정)'),
      S('subl','(fail)','fail',''),
      S('wet','','pending','')
    ]}),
    Object.assign(mkLot('P-67zmix-TOLACHX'), {steps:[
      S('react','(DMA)후'),
      S('solid','MeOH/H2O  결정화'),
      S('wet','(Si pass_ DCB, MC/Hex 후 Act/Hex 결정화)'),
      S('wet','(column_ DCB, MC/Hex 후 Act/Hex 결정화)'),
      S('wet','(DCB/Act/Hex 재결정)'),
      S('wet','(Tol/Act/Hex 재결정)'),
      S('wet','(DCB/Act/Hex  재결정)'),
      S('wet','(DCB/Act/Hex 재결정)'),
      S('wet','(DCB/Act/Hex  재결정)'),
      S('wet','(DCB/Act/Hx) 재결정'),
      S('subl','(소자평가 fail)','fail','충주'),
      S('wet','(DCB/Act/Hx 재결정)'),
      S('subl','(6,7-zone 불순물 제거작업)\n(4,5-zone 수득, 소자fail)','fail','용인'),
      S('subl','(6,7-zone 취합 후 추가 승화정제, 4,5-zone 회수)','','용인'),
      S('wet','(고운 si pass_DCB, MC/Hx 후 Act/Hex 결정화)'),
      S('wet','(DCB/Act/Hx 재결정)'),
      S('wet','(Tol/Act/Hx 재결정)'),
      S('subl','','','충주')
    ]}),
    Object.assign(mkLot('L26B-202-101(4,5,6)'), {steps:[
      S('react','(DMA)후'),
      S('solid','MeOH/H2O  결정화'),
      S('wet','(Si pass_ DCB, MC/Hex 후 Act/Hex 결정화)'),
      S('wet','(Column_DCB, MC/Hex 후 EA/Hex 결정화)'),
      S('wet','(DCB/Act/Hex 재결정)'),
      S('wet','(DCB/Act/Hex 재결정)'),
      S('wet','(DCB/Act/Hex 재결정)'),
      S('subl','(fail)','fail',''),
      S('wet','(고운 Si pass_DCB, MC/Hex 후 Act/Hex 결정화)'),
      S('wet','(DCB/Act/Hex 재결정)'),
      S('wet','(DCB/Act/Hex 재결정)'),
      S('wet','(DCB/Act/Hex 재결정)'),
      S('subl','(pass)','pass','')
    ]}),
    Object.assign(mkLot('L26C-202-114(4,5,6)'), {steps:[
      S('react','(DMA)후'),
      S('solid','MeOH/H2O  결정화'),
      S('wet','(Si pass_ DCB, MC/Hex 후 Act/Hex 결정화)'),
      S('wet','(Column_DCB, MC/Hex 후 EA/Hex 결정화)'),
      S('wet','(DCB/Act/Hex 재결정)'),
      S('wet','(DCB/Act/Hex 재결정)'),
      S('wet','(DCB/Act/Hex 재결정)'),
      S('subl','(fail)','fail',''),
      S('wet','(고운 Si pass_DCB, MC/Hex 후 Act/Hex 결정화)'),
      S('wet','L26B-202-101 7,8,9차 재결정 여액 취합 후  Si pass 후 Act/Hex 결정화'),
      S('wet','(DCB/Act/Hex 재결정)'),
      S('wet','(TolAct/Hex 재결정)'),
      S('subl','(pass)','pass','')
    ]}),
    Object.assign(mkLot('P-ND02-COL-BOTTOM'), {steps:[
      S('collect','본품 재결정 여액 취합'),
      S('subl','(6,7-zone  불순물 제거작업)','','용인'),
      S('subl','(6,7-zone  불순물 제거작업)','','용인'),
      S('wet','(Colimn_DCB, MC/Hx  후 Act/Hx 결정화)'),
      S('wet','(DCB/Act/Hex 재결정)'),
      S('subl','','','용인')
    ]}),
    Object.assign(mkLot('P-ND08-TOLACHX3'), {steps:[
      S('react','(DMA)후 MeOH/H2O  결정화'),
      S('wet','(Si pass_DCB, MC/Hx 후 Act/Hx 결정화)'),
      S('wet','(Column_DCB, MC/Hex 후 Act/Hx 결정화)'),
      S('wet','(Tol/Act/Hx 재결정)'),
      S('wet','(Tol/Act/Hex 재결정)'),
      S('wet','(Tol/Act/Hex 재결정)'),
      S('subl','(6,7-zone  불순물 제거작업)\n(4,5-zone 수득, 소자 fail)','fail','용인'),
      S('wet','(column_DCB, MC/Hx 후 Act/Hx 결정화)'),
      S('wet','(DCB/Act/Hx 재결정)'),
      S('wet','(Tol/Act/Hx 재결정)'),
      S('subl','(pass)','pass','용인')
    ]})
  ];

  return mkDoc({
    title: 'P/N Type 재료 공정 Flow 정리',
    material: 'LT-PHM295',
    author: '백지홍',
    date: '2026-04-21',
    sections: [ps, ns]
  });
}

/* ── 연결 상태 구독 ─────────────────────────────── */
firebase.database().ref('.info/connected').on('value', function(snap) {
  _connected = snap.val() === true;
  if (!_connected) {
    setSaveStatus('offline', '네트워크 연결을 확인하세요.');
  } else {
    // 연결 복구 시 현재 상태가 error/offline이면 대기로 전환
    var el = document.getElementById('pf-save-status');
    if (el && (el.classList.contains('pf-ss-offline') || el.classList.contains('pf-ss-error'))) {
      setSaveStatus('idle');
    }
    // 오프라인 중에 쌓인 pending 저장 flush
    if (_pendingSave) flushSave();
  }
});

})();
