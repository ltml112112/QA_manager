/* ══════════════════════════════════════════════════════════════
   CPL 통합 품질 & 이력 관리 시스템
   ══════════════════════════════════════════════════════════════ */

/* ── 테마 동기화 ── */
(function() {
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('qa_theme', theme);
  }
  applyTheme(localStorage.getItem('qa_theme') || 'dark');
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'setTheme') applyTheme(e.data.theme);
  });
})();

/* ── Mermaid 초기화 ── */

/* ── 전역 상태 ── */
const STATE = {
  qualityWb:      null,   // 품질 데이터 워크북 (XLSX)
  flowWb:         null,   // 흐름도 워크북 (XLSX)
  qualityRecords: [],     // 파싱된 품질 레코드 [{stage,batchNo,itemLabel,value,USL,LSL,UCL,LCL}]
  byOutputLot:    {},     // 완제품 → 원료 맵
  byInputLot:     {},     // 원료 → 완제품 맵
  lotMeta:        {},     // Lot → {itemCode, itemName}
  lotStage:       {},     // Lot → 단계 인덱스 (0=완제품/1단계, N=원료/마지막단계)
  stageLabels:    [],     // 흐름도 Excel 헤더 라벨 ["1단계","2단계",...]
  stageTypeLabels:[],     // 실제 공정명 ["완제품","정제1차품","정제원재료",...]
  lotSearchIndex: {},     // Lot → 'lot|itemName|remark' 소문자 캐시 (검색 성능)
  edgeWeightMap:  {},     // '{outLot}→{inLot}' → 투입량(g) (화살표 두께용)
  selectedLot:    null,
  selectedBatch:  null,
  traceDir:       'backward', // 'backward' | 'forward'
  filterStage:    null,       // null=전체, 숫자=해당 stageIdx만 표시
  chartInstances: [],
};

/* ══════════════════════════════════════════════════════════════
   Step 2: 파일 업로드
   ══════════════════════════════════════════════════════════════ */

/* 2-E: 파일 크기 포맷 */
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/* 2-G: 업로드 상태 UI 업데이트
   slot  : 'quality' | 'flow'
   state : 'idle' | 'loading' | 'ok' | 'error'
   info  : null | {name, size} | {message}
*/
function setUploadStatus(slot, state, info) {
  var drop     = document.getElementById('drop-' + slot);
  var iconEl   = document.getElementById('icon-' + slot);
  var hintEl   = document.getElementById('hint-' + slot);
  var statusEl = document.getElementById('status-' + slot);

  drop.classList.remove('drag-over', 'upload-ok', 'upload-error');

  if (state === 'idle') {
    iconEl.textContent    = slot === 'quality' ? '📊' : '🔗';
    hintEl.style.display  = '';
    statusEl.style.display = 'none';

  } else if (state === 'loading') {
    iconEl.textContent    = '⏳';
    hintEl.style.display  = 'none';
    statusEl.style.display = '';
    statusEl.innerHTML    = '<span style="color:var(--text-muted)">파싱 중...</span>';

  } else if (state === 'ok') {
    iconEl.textContent    = '✅';
    hintEl.style.display  = 'none';
    statusEl.style.display = '';
    statusEl.innerHTML    =
      '<span style="color:var(--success);font-weight:600">' + info.name + '</span>' +
      '<span style="color:var(--text-muted);font-size:0.75rem;margin-left:6px">' + info.size + '</span>';
    drop.classList.add('upload-ok');

  } else if (state === 'error') {
    iconEl.textContent    = '❌';
    hintEl.style.display  = 'none';
    statusEl.style.display = '';
    statusEl.innerHTML    = '<span style="color:var(--danger)">' + info.message + '</span>';
    drop.classList.add('upload-error');
  }
}

/* 2-D: 파일 자동판별
   - 첫 15행 전체를 스캔하여 USL/LSL 키워드 발견 → 품질 파일
   - 첫  3행에서 "단계" 키워드 발견 → 흐름도 파일
   - "Batch No." / "BATCH" 도 품질 파일 지표로 사용
   - 슬롯 힌트(drop zone 위치)를 최후 fallback으로 사용
*/
function detectFileType(workbook, slotHint) {
  var ws   = workbook.Sheets[workbook.SheetNames[0]];
  var rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  var scanRows = Math.min(rows.length, 15);
  var fullText = '';
  for (var i = 0; i < scanRows; i++) {
    fullText += rows[i].join('|') + '\n';
  }
  var upper = fullText.toUpperCase();

  // 흐름도: "단계" 는 첫 3행에서만 확인 (품질 파일 공정단계명과 구별)
  var top3 = '';
  for (var j = 0; j < Math.min(rows.length, 3); j++) {
    top3 += rows[j].join('|') + '\n';
  }
  var isFlow    = top3.indexOf('단계') !== -1;
  var isQuality = upper.indexOf('USL') !== -1 || upper.indexOf('LSL') !== -1 ||
                  upper.indexOf('BATCH NO') !== -1 || upper.indexOf('BATCH NO.') !== -1;

  if (isQuality && !isFlow) return 'quality';
  if (isFlow    && !isQuality) return 'flow';
  // 둘 다 해당하거나 둘 다 없을 때 → 슬롯 힌트로 fallback
  if (isQuality) return 'quality';
  if (isFlow)    return 'flow';
  return slotHint || 'unknown';
}

/* 2-F: 파일 읽기 + 단일 파싱 (중복 방지)
   slot: 드롭존 힌트 ('quality' | 'flow') — 자동판별 후 실제 타입 우선
*/
function handleFile(file, slot) {
  setUploadStatus(slot, 'loading', null);

  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var wb       = XLSX.read(e.target.result, { type: 'array', cellStyles: true });
      var detected = detectFileType(wb, slot);
      var fileInfo = { name: file.name, size: formatBytes(file.size) };

      if (detected === 'unknown') {
        setUploadStatus(slot, 'error', { message: '파일 형식을 인식할 수 없습니다 (품질·흐름도 파일만 지원)' });
        return;
      }

      // 드롭존과 실제 타입이 다르면 원래 드롭존을 idle 로 복구
      if (detected !== slot) setUploadStatus(slot, 'idle', null);

      if (detected === 'quality') {
        STATE.qualityWb = wb;
        setUploadStatus('quality', 'ok', fileInfo);
        if (typeof onQualityReady === 'function') onQualityReady();
      } else {
        STATE.flowWb = wb;
        setUploadStatus('flow', 'ok', fileInfo);
        if (typeof onFlowReady === 'function') onFlowReady();
      }
    } catch (err) {
      setUploadStatus(slot, 'error', { message: 'XLSX 파싱 오류: ' + err.message });
    }
  };
  reader.readAsArrayBuffer(file);
}

/* 2-B / 2-C: 드래그앤드롭 + 클릭 업로드 초기화 */
(function initUpload() {
  ['quality', 'flow'].forEach(function(slot) {
    var drop  = document.getElementById('drop-' + slot);
    var input = document.getElementById('input-' + slot);

    // dragover — 테두리 강조
    drop.addEventListener('dragover', function(e) {
      e.preventDefault();
      drop.classList.add('drag-over');
    });
    // dragleave — 복원 (자식 요소로 이동 시 제외)
    drop.addEventListener('dragleave', function(e) {
      if (!drop.contains(e.relatedTarget)) drop.classList.remove('drag-over');
    });
    // drop
    drop.addEventListener('drop', function(e) {
      e.preventDefault();
      var file = e.dataTransfer.files[0];
      if (file) handleFile(file, slot);
    });

    // 클릭 → hidden input 트리거
    drop.addEventListener('click', function() { input.click(); });
    input.addEventListener('change', function() {
      if (input.files[0]) handleFile(input.files[0], slot);
      input.value = ''; // 같은 파일 재선택 가능
    });
  });
})();

/* ══════════════════════════════════════════════════════════════
   Step 3: 품질 데이터 파서
   ══════════════════════════════════════════════════════════════ */

/* 3-A: 워크북 → 2D 배열 변환 */
function getRows(workbook) {
  var ws = workbook.Sheets[workbook.SheetNames[0]];
  return { ws: ws, rows: XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) };
}

/* 3-B: 병합셀 forward-fill
   ws['!merges'] 를 순회해서 병합 범위 첫 셀 값을 빈 셀에 채워 넣음 */
function forwardFillMerges(ws, rows) {
  var merges = ws['!merges'] || [];
  merges.forEach(function(m) {
    var val = '';
    // 기준 셀 값 추출
    if (rows[m.s.r] && rows[m.s.r][m.s.c] !== undefined) val = rows[m.s.r][m.s.c];
    for (var r = m.s.r; r <= m.e.r; r++) {
      for (var c = m.s.c; c <= m.e.c; c++) {
        if (!rows[r]) rows[r] = [];
        if (r === m.s.r && c === m.s.c) continue; // 첫 셀은 이미 있음
        if (rows[r][c] === '' || rows[r][c] === undefined) rows[r][c] = val;
      }
    }
  });
  return rows;
}

/* 3-D: 컬럼 역할 분류
   rowHeader = Row 4 (index 3) — "Batch No." + 측정항목명 + USL/LSL/UCL/LCL 가 모두 같은 행에 존재
   반환: 컬럼 인덱스 → 'batchNo' | 'value' | 'USL' | 'LSL' | 'UCL' | 'LCL' | 'ignore'
*/
function classifyColumns(rowHeader) {
  var roles = {};
  for (var c = 0; c < rowHeader.length; c++) {
    var h = String(rowHeader[c] || '').trim();
    var hU = h.toUpperCase();

    if (hU.indexOf('BATCH') !== -1 || h.indexOf('배치') !== -1) {
      roles[c] = 'batchNo';
    } else if (hU === 'USL') {
      roles[c] = 'USL';
    } else if (hU === 'LSL') {
      roles[c] = 'LSL';
    } else if (hU === 'UCL') {
      roles[c] = 'UCL';
    } else if (hU === 'LCL') {
      roles[c] = 'LCL';
    } else if (hU === '기준' || h === '') {
      roles[c] = 'ignore';
    } else {
      roles[c] = 'value';
    }
  }
  return roles;
}

/* 3-E: 공정단계 그룹 경계 파악
   batchNo 컬럼 위치마다 새 그룹 시작.
   rowStage = Row 3 (index 2) — 공정명, rowMat = Row 2 (index 1) — 재료명 (fallback)
   반환: [{stage, batchNoCol, startCol, endCol}]
*/
function buildStageGroups(roles, rowStage, rowMat, totalCols) {
  var groups = [];
  var batchCols = Object.keys(roles).filter(function(c) {
    return roles[c] === 'batchNo';
  }).map(Number).sort(function(a, b) { return a - b; });

  batchCols.forEach(function(bc, idx) {
    var nextBc  = batchCols[idx + 1] !== undefined ? batchCols[idx + 1] : totalCols;
    var stageName = String(rowStage[bc] || rowMat[bc] || ('공정단계 ' + (idx + 1))).trim();
    groups.push({ stage: stageName, batchNoCol: bc, startCol: bc, endCol: nextBc - 1 });
  });
  return groups;
}

/* 3-F: 각 value 컬럼에 인접 기준값 컬럼 연결 (forward scan)
   반환: {valueCols: {colIdx: {USLcol,LSLcol,UCLcol,LCLcol}}, itemLabels: {colIdx: label}}
*/
function buildValueMeta(roles, rowStage, rowHeader) {
  var valueMeta = {};
  var colIndices = Object.keys(roles).map(Number).sort(function(a, b) { return a - b; });

  colIndices.forEach(function(c) {
    if (roles[c] !== 'value') return;
    // 측정항목 라벨: rowStage(공정명, index 2) + rowHeader(항목명, index 3) 조합
    var label = [String(rowStage[c] || '').trim(), String(rowHeader[c] || '').trim()]
      .filter(Boolean).join(' ').trim() || ('col' + c);

    var limitCols = { USLcol: null, LSLcol: null, UCLcol: null, LCLcol: null };
    // 오른쪽으로 forward scan → 첫 번째 USL/LSL/UCL/LCL 컬럼 찾기
    for (var i = c + 1; i < c + 10 && i < colIndices[colIndices.length - 1] + 1; i++) {
      if (roles[i] === 'USL'  && limitCols.USLcol === null)  limitCols.USLcol  = i;
      if (roles[i] === 'LSL'  && limitCols.LSLcol === null)  limitCols.LSLcol  = i;
      if (roles[i] === 'UCL'  && limitCols.UCLcol === null)  limitCols.UCLcol  = i;
      if (roles[i] === 'LCL'  && limitCols.LCLcol === null)  limitCols.LCLcol  = i;
      if (roles[i] === 'batchNo') break; // 다음 그룹 시작 전에 중단
    }
    valueMeta[c] = { label: label, limits: limitCols };
  });
  return valueMeta;
}

/* 3-G: 데이터 행 파싱 → qualityRecords 배열 생성 */
function parseQualityRows(rows, stageGroups, roles, valueMeta) {
  var records = [];

  stageGroups.forEach(function(grp) {
    // 데이터 행: index 4부터 (Row 5+)
    for (var r = 4; r < rows.length; r++) {
      var row = rows[r];
      var batchNo = String(row[grp.batchNoCol] || '').trim();
      if (!batchNo) continue; // Batch No. 없는 행 스킵

      // 그룹 범위 내 value 컬럼 순회
      for (var c = grp.startCol; c <= grp.endCol; c++) {
        if (roles[c] !== 'value') continue;
        var meta  = valueMeta[c];
        if (!meta) continue;

        var rawVal = row[c];
        var value  = rawVal === '' || rawVal === undefined ? null : parseFloat(rawVal);
        if (value === null || isNaN(value)) continue; // 측정값 없는 셀 스킵

        var lim = meta.limits;
        records.push({
          stage:     grp.stage,
          batchNo:   batchNo,
          itemLabel: meta.label,
          value:     value,
          USL: lim.USLcol !== null ? parseFloat(row[lim.USLcol]) : null,
          LSL: lim.LSLcol !== null ? parseFloat(row[lim.LSLcol]) : null,
          UCL: lim.UCLcol !== null ? parseFloat(row[lim.UCLcol]) : null,
          LCL: lim.LCLcol !== null ? parseFloat(row[lim.LCLcol]) : null,
        });
      }
    }
  });
  return records;
}

/* 3-H: 진입점 — onQualityReady() 에서 호출 */
function parseQualityData() {
  var res   = getRows(STATE.qualityWb);
  var rows  = forwardFillMerges(res.ws, res.rows);

  // 실제 엑셀 헤더 구조:
  // idx 0 (Row 1): 비어있음 (기준값 우측 영역은 1~2행 병합)
  // idx 1 (Row 2): 재료명
  // idx 2 (Row 3): 공정명 (stage 그룹명 소스)
  // idx 3 (Row 4): "Batch No." + 측정항목명 + USL/LSL/UCL/LCL (모두 같은 행)
  // idx 4+ (Row 5+): DATA
  var rowMat    = rows[1] || [];   // 재료명 (stage명 fallback용)
  var rowStage  = rows[2] || [];   // 공정명
  var rowHeader = rows[3] || [];   // Batch No. + 측정항목명 + USL/LSL/UCL/LCL

  var totalCols   = rowHeader.length;
  var roles       = classifyColumns(rowHeader);
  var stageGroups = buildStageGroups(roles, rowStage, rowMat, totalCols);
  var valueMeta   = buildValueMeta(roles, rowStage, rowHeader);

  STATE.qualityRecords = parseQualityRows(rows, stageGroups, roles, valueMeta);
  console.log('[품질파서] 레코드 수:', STATE.qualityRecords.length,
              '| 공정단계:', stageGroups.map(function(g){return g.stage;}).join(', '));
}

/* 3-H: 콜백 — Step 2의 handleFile()이 완료 후 호출 */
function onQualityReady() {
  parseQualityData();
  // 흐름도 데이터가 이미 있으면 SPC 차트 추가, 없으면 대기
  if (Object.keys(STATE.byOutputLot).length) {
    if (typeof renderSpcCharts === 'function') renderSpcCharts();
  }
}

/* 두 파일 모두 준비됐을 때만 전체 렌더 시작 */
function tryRenderAll() {
  if (Object.keys(STATE.byOutputLot).length) {
    document.getElementById('empty-state').style.display = 'none';
    if (typeof renderSidebar === 'function') renderSidebar();
  }
  if (STATE.qualityRecords.length && Object.keys(STATE.byOutputLot).length) {
    if (typeof renderSpcCharts === 'function') renderSpcCharts();
  }
}

/* ══════════════════════════════════════════════════════════════
   Step 4: 흐름도 파서
   ══════════════════════════════════════════════════════════════ */

/* 4-A / 4-B: 워크북 로드 + 단계 헤더 컬럼 위치 파악
   행 0: "1단계" ~ "6단계" 헤더 → 각 단계의 시작 컬럼 인덱스 수집
   반환: [{stageLabel, startCol}]
*/
function parseStageHeaders(rows) {
  var stages = [];
  var row0 = rows[0] || [];
  for (var c = 0; c < row0.length; c++) {
    var cell = String(row0[c] || '').trim();
    if (cell.indexOf('단계') !== -1) {
      stages.push({ stageLabel: cell, startCol: c });
    }
  }
  return stages;
}

/* 4-C: 각 단계 내 서브컬럼 구조 파악
   행 1: LOTNUM / 비고 / LOTNUM / 품목코드 / 품목명 / 투입량 등
   단계 시작 컬럼부터 다음 단계 시작 전까지 스캔
   반환: {lotNumCol, itemCodeCol, itemNameCol} (단계별 절대 컬럼 인덱스)
*/
function parseSubCols(rows, stages) {
  var row1 = rows[1] || [];
  var result = [];

  stages.forEach(function(stg, idx) {
    var endCol = idx + 1 < stages.length ? stages[idx + 1].startCol : row1.length;
    var sub = {
      stageLabel:   stg.stageLabel,
      mainLotCol:   null,  // 첫 번째 LOT 컬럼 (주 Lot 번호)
      remarkLotCol: null,  // 두 번째 LOT 컬럼 또는 "비고" 컬럼 (비고 Lot)
      itemCodeCol:  null,
      itemNameCol:  null,
      stageNameCol: null,
      weightCol:    null,  // 투입량 컬럼
    };

    for (var c = stg.startCol; c < endCol; c++) {
      var cell = String(row1[c] || '').trim();
      var upper = cell.toUpperCase();
      var isLot    = upper.indexOf('LOTNUM') !== -1 || upper.indexOf('LOT NO') !== -1 ||
                     upper === 'LOT' || upper === 'LOTNO';
      var isRemark = cell.indexOf('비고') !== -1;

      if (isRemark && !isLot) {
        // "비고" 단독 컬럼
        if (sub.remarkLotCol === null) sub.remarkLotCol = c;
      } else if (isLot) {
        // LOT 컬럼: 첫 번째는 주 Lot, 두 번째(비고 LOTNUM 포함)는 비고
        if (sub.mainLotCol === null) sub.mainLotCol = c;
        else if (sub.remarkLotCol === null) sub.remarkLotCol = c;
      } else if (isRemark) {
        // "비고 LOTNUM" 처럼 둘 다 포함된 경우 → 비고 Lot
        if (sub.remarkLotCol === null) sub.remarkLotCol = c;
      } else if (upper.indexOf('품목코드') !== -1 || upper.indexOf('코드') !== -1) {
        sub.itemCodeCol = c;
      } else if (upper.indexOf('품목명') !== -1 || upper.indexOf('품명') !== -1) {
        sub.itemNameCol = c;
      } else if (cell === '단계') {
        sub.stageNameCol = c;
      } else if (upper.indexOf('투입량') !== -1 || upper.indexOf('투입') !== -1 || upper === '중량' || upper.indexOf('WEIGHT') !== -1) {
        if (sub.weightCol === null) sub.weightCol = c;
      }
    }
    result.push(sub);
  });
  return result;
}

/* 4-D / 4-E / 4-F: 데이터 행 순회 → 양방향 맵 + lotMeta + lotStage + stageTypeLabels 구축
   관계 구축 방식: 인접 단계 쌍끼리만 연결 (star 패턴 제거)
     예) 1단계←2단계←3단계←4단계 → 1↔2, 2↔3, 3↔4 엣지만 생성
   1단계(완제품)가 미기재인 경우에도 2단계부터 체인 형성 가능
*/
function parseFlowRows(rows, subCols) {
  var byOutput        = {};  // 완제품Lot → [원료Lot, ...]
  var byInput         = {};  // 원료Lot  → [완제품Lot, ...]
  var lotMeta         = {};  // Lot → {itemCode, itemName}
  var lotStage        = {};  // Lot → 단계 인덱스 (0=완제품/1단계, N=원료/마지막단계)
  var edgeWeightMap   = {};  // '{outLot}→{inLot}' → 투입량(g)
  var stageTypeLabels = new Array(subCols.length).fill(''); // 실제 공정명 ("완제품","정제1차품" 등)

  for (var r = 2; r < rows.length; r++) {
    var row = rows[r];

    // 각 단계에서 Lot 번호 + 메타 + 공정명 + 투입량 추출
    var stageLots = subCols.map(function(sub, sIdx) {
      var lot       = sub.mainLotCol    !== null ? String(row[sub.mainLotCol]    || '').trim() : '';
      var remark    = sub.remarkLotCol  !== null ? String(row[sub.remarkLotCol]  || '').trim() : '';
      var itemCode  = sub.itemCodeCol   !== null ? String(row[sub.itemCodeCol]   || '').trim() : '';
      var itemName  = sub.itemNameCol   !== null ? String(row[sub.itemNameCol]   || '').trim() : '';
      var stageName = sub.stageNameCol  !== null ? String(row[sub.stageNameCol]  || '').trim() : '';
      var weight    = sub.weightCol     !== null ? parseFloat(String(row[sub.weightCol] || '')) : NaN;
      return { lot: lot, itemCode: itemCode, itemName: itemName, stageName: stageName, remark: remark, stageIdx: sIdx, weight: weight };
    });

    // lotMeta + lotStage 저장, stageTypeLabels 수집
    stageLots.forEach(function(s) {
      if (!s.lot) return;
      if (!lotMeta[s.lot]) {
        lotMeta[s.lot] = { itemCode: s.itemCode, itemName: s.itemName, remark: s.remark };
      } else if (s.remark && !lotMeta[s.lot].remark) {
        lotMeta[s.lot].remark = s.remark;
      }
      if (lotStage[s.lot] === undefined) {
        lotStage[s.lot] = s.stageIdx;
      }
      if (s.stageName && !stageTypeLabels[s.stageIdx]) {
        stageTypeLabels[s.stageIdx] = s.stageName;
      }
    });

    // 관계 구축: 인접한 단계 쌍끼리만 연결 (값 있는 단계 인덱스만 추려서)
    var validIdxs = [];
    stageLots.forEach(function(s, i) { if (s.lot) validIdxs.push(i); });
    if (validIdxs.length < 2) continue;

    for (var vi = 0; vi < validIdxs.length - 1; vi++) {
      var outLot   = stageLots[validIdxs[vi]].lot;       // 더 완제품 방향 (낮은 단계 인덱스)
      var inLot    = stageLots[validIdxs[vi + 1]].lot;   // 더 원료 방향 (높은 단계 인덱스)
      var inWeight = stageLots[validIdxs[vi + 1]].weight; // 원료의 투입량
      if (!byOutput[outLot]) byOutput[outLot] = [];
      if (byOutput[outLot].indexOf(inLot) === -1) byOutput[outLot].push(inLot);
      if (!byInput[inLot]) byInput[inLot] = [];
      if (byInput[inLot].indexOf(outLot) === -1) byInput[inLot].push(outLot);
      // 투입량 저장 — 하위 원료 분기로 같은 엣지가 여러 행에 반복될 수 있으므로 첫 등장값만 사용
      var eKey = outLot + '→' + inLot;
      if (!isNaN(inWeight) && inWeight > 0 && edgeWeightMap[eKey] === undefined) {
        edgeWeightMap[eKey] = inWeight;
      }
    }
  }

  return { byOutput: byOutput, byInput: byInput, lotMeta: lotMeta,
           lotStage: lotStage, stageTypeLabels: stageTypeLabels, edgeWeightMap: edgeWeightMap };
}

/* 4-G: 진입점 */
function parseFlowData() {
  var res  = getRows(STATE.flowWb);
  var rows = res.rows;

  var stages  = parseStageHeaders(rows);
  var subCols = parseSubCols(rows, stages);
  var maps    = parseFlowRows(rows, subCols);

  STATE.byOutputLot      = maps.byOutput;
  STATE.byInputLot       = maps.byInput;
  STATE.lotMeta          = maps.lotMeta;
  STATE.lotStage         = maps.lotStage;
  STATE.edgeWeightMap    = maps.edgeWeightMap;
  STATE.stageLabels      = subCols.map(function(sub) { return sub.stageLabel; });
  STATE.stageTypeLabels  = maps.stageTypeLabels;

  // 검색 인덱스 빌드 — 키 입력마다 toLowerCase 반복 방지
  STATE.lotSearchIndex = {};
  Object.keys(STATE.lotMeta).forEach(function(lot) {
    var m = STATE.lotMeta[lot];
    STATE.lotSearchIndex[lot] = (lot + '|' + (m.itemName || '') + '|' + (m.remark || '')).toLowerCase();
  });

  var lotCount = Object.keys(maps.lotMeta).length;
  var edgeCount = Object.keys(maps.byOutput).reduce(function(s, k) {
    return s + maps.byOutput[k].length;
  }, 0);
  console.log('[흐름도파서] Lot 수:', lotCount, '| 관계 수:', edgeCount,
              '| 단계:', stages.map(function(s){return s.stageLabel;}).join(', '));
}

/* 4-G: 콜백 — Step 2의 handleFile()이 완료 후 호출 */
function onFlowReady() {
  parseFlowData();
  // 흐름도만 있어도 바로 사이드바 + 계보도 렌더링
  document.getElementById('empty-state').style.display = 'none';
  if (typeof renderSidebar === 'function') renderSidebar();
  // 품질 데이터도 이미 있으면 SPC 차트까지
  if (STATE.qualityRecords.length) {
    if (typeof renderSpcCharts === 'function') renderSpcCharts();
  }
}

/* ══════════════════════════════════════════════════════════════
   Step 5: Lot 사이드바 (단계별 그룹)
   ══════════════════════════════════════════════════════════════ */

/* 5-A: 단계 라벨 → stageIdx 정렬 순서 반환 (완제품=0 → 원료=N) */
function getSortedStageIdxs() {
  var idxs = [];
  Object.keys(STATE.lotMeta).forEach(function(lot) {
    var si = STATE.lotStage[lot];
    if (si !== undefined && idxs.indexOf(si) === -1) idxs.push(si);
  });
  idxs.sort(function(a, b) { return a - b; }); // 0=완제품 먼저
  return idxs;
}

/* 5-B: stageIdx → 표시 라벨 */
function getStageLabel(si) {
  return (STATE.stageTypeLabels && STATE.stageTypeLabels[si]) ||
         (STATE.stageLabels     && STATE.stageLabels[si])     ||
         ('단계 ' + (si + 1));
}

/* 5-C: 검색어 기반 Lot 필터 — lq 는 이미 toLowerCase() 된 값 */
function matchLot(lot, lq) {
  if (!lq) return true;
  var cached = STATE.lotSearchIndex[lot];
  return cached !== undefined
    ? cached.indexOf(lq) !== -1
    : lot.toLowerCase().indexOf(lq) !== -1;
}

/* 5-D: 단계 그룹 목록 렌더링 */
function renderLotGroups(query) {
  var listEl  = document.getElementById('lot-list');
  var countEl = document.getElementById('lot-count');
  listEl.innerHTML = '';

  var lq = query ? query.toLowerCase() : ''; // 한 번만 계산해서 matchLot에 전달

  var stageIdxs = getSortedStageIdxs();
  // 단계 필터 적용
  if (STATE.filterStage !== null) {
    stageIdxs = stageIdxs.filter(function(si) { return si === STATE.filterStage; });
  }

  var total = 0;
  var firstGroup = true;

  stageIdxs.forEach(function(si) {
    var lots = Object.keys(STATE.lotMeta)
      .filter(function(l) { return STATE.lotStage[l] === si && matchLot(l, lq); })
      .sort(function(a, b) { return b.localeCompare(a); });
    if (lots.length === 0) return;
    total += lots.length;

    /* 그룹 헤더 */
    var hdr = document.createElement('div');
    hdr.className = 'stage-group-header';

    // 검색 중이거나 필터 단일 단계이거나 첫 그룹이면 펼침, 나머지는 기본 접힘
    var startOpen = firstGroup || !!lq || STATE.filterStage !== null;
    firstGroup = false;

    hdr.innerHTML =
      '<span class="stage-group-label">' + escHtml(getStageLabel(si)) + '</span>' +
      '<span class="stage-group-count">' + lots.length + '</span>' +
      '<span class="stage-group-toggle">' + (startOpen ? '▾' : '▸') + '</span>';

    var body = document.createElement('div');
    body.className = 'stage-group-body' + (startOpen ? '' : ' sg-collapsed');

    hdr.addEventListener('click', function() {
      var collapsed = body.classList.toggle('sg-collapsed');
      hdr.querySelector('.stage-group-toggle').textContent = collapsed ? '▸' : '▾';
    });

    lots.forEach(function(lot) {
      var meta = STATE.lotMeta[lot] || {};
      var item = document.createElement('div');
      item.className = 'lot-item' + (lot === STATE.selectedLot ? ' active' : '');
      item.dataset.lot = lot;
      item.innerHTML =
        '<span>' + escHtml(lot) + '</span>' +
        (meta.remark ? '<span class="lot-remark">' + escHtml(meta.remark) + '</span>' : '');

      item.addEventListener('click', (function(l) { return function() {
        document.querySelectorAll('.lot-item').forEach(function(el) { el.classList.remove('active'); });
        item.classList.add('active');
        STATE.selectedLot = l;
        if (typeof renderGenealogy     === 'function') renderGenealogy(l);
        if (typeof renderTrackingTable === 'function') renderTrackingTable(l);
      }; })(lot));

      body.appendChild(item);
    });

    listEl.appendChild(hdr);
    listEl.appendChild(body);
  });

  if (total === 0) {
    listEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:0.82rem;">검색 결과 없음</div>';
  }
  countEl.textContent = total + '개 Lot';
}

/* 5-E-1: 단계 필터 탭 렌더링 */
function renderStageFilterBar() {
  var barEl = document.getElementById('stage-filter-bar');
  barEl.innerHTML = '';
  barEl.style.display = '';

  var stageIdxs = getSortedStageIdxs();
  if (stageIdxs.length <= 1) { barEl.style.display = 'none'; return; }

  // "전체" 버튼
  var allBtn = document.createElement('button');
  allBtn.className = 'stage-filter-btn' + (STATE.filterStage === null ? ' sf-active' : '');
  allBtn.textContent = '전체';
  allBtn.addEventListener('click', function() {
    STATE.filterStage = null;
    renderStageFilterBar();
    renderLotGroups(document.getElementById('lot-search').value.trim());
  });
  barEl.appendChild(allBtn);

  stageIdxs.forEach(function(si) {
    var label = getStageLabel(si);
    var btn = document.createElement('button');
    btn.className = 'stage-filter-btn' + (STATE.filterStage === si ? ' sf-active' : '');
    btn.textContent = label;
    btn.addEventListener('click', function() {
      STATE.filterStage = (STATE.filterStage === si) ? null : si;
      renderStageFilterBar();
      renderLotGroups(document.getElementById('lot-search').value.trim());
    });
    barEl.appendChild(btn);
  });
}

/* 5-E: 사이드바 전체 초기화 */
function renderSidebar() {
  document.getElementById('sidebar').classList.remove('hidden');
  renderStageFilterBar();
  renderLotGroups('');

  var searchInput = document.getElementById('lot-search');
  searchInput.oninput = function() { renderLotGroups(searchInput.value.trim()); };
}

/* ══════════════════════════════════════════════════════════════
   Step 6: Mermaid 계보도
   ══════════════════════════════════════════════════════════════ */

/* 6-A: BFS 탐색 — 선택 Lot에서 연결된 모든 Lot·엣지 수집
   dir: 'backward' → byOutputLot(완제품→원료), 'forward' → byInputLot(원료→완제품)
   반환: { nodes: Set<lot>, edges: [{from, to}], truncated: bool }
*/
function collectRelatedLots(startLot, dir) {
  var map   = dir === 'backward' ? STATE.byOutputLot : STATE.byInputLot;
  var nodes = new Set([startLot]);
  var edges = [];
  var queue = [startLot];
  var MAX   = 50;

  while (queue.length > 0 && nodes.size < MAX) {
    var cur      = queue.shift();
    var children = map[cur] || [];
    children.forEach(function(child) {
      var from = dir === 'backward' ? cur   : child;
      var to   = dir === 'backward' ? child : cur;
      edges.push({ from: from, to: to });
      if (!nodes.has(child) && nodes.size < MAX) {
        nodes.add(child);
        queue.push(child);
      }
    });
  }
  return { nodes: nodes, edges: edges, truncated: nodes.size >= MAX };
}

/* 6-A2: 전체 체인 수집 — 선택 Lot 기준 양방향(원료↔완제품) 탐색
   ① Backward BFS: byOutputLot만 따라 원료 방향으로만 탐색 (forward 절대 안 함)
   ② Forward BFS:  byInputLot만 따라 완제품 방향으로만 탐색 (backward 절대 안 함)
   → 각 방향 BFS를 완전히 분리하여 교차 오염(cross-contamination) 방지
   edges: { from: 완제품_side, to: 원료_side } 형식 유지
*/
function collectFullChain(startLot) {
  var nodes   = new Set([startLot]);
  var edgeSet = new Set();
  var edges   = [];
  var MAX     = 100;

  function pushEdge(from, to) {
    var k = from + '\u2192' + to;
    if (!edgeSet.has(k)) { edgeSet.add(k); edges.push({ from: from, to: to }); }
  }

  /* ① Backward BFS — byOutputLot (완제품→원료) */
  var bQueue = [startLot];
  while (bQueue.length > 0 && nodes.size < MAX) {
    var cur = bQueue.shift();
    (STATE.byOutputLot[cur] || []).forEach(function(raw) {
      pushEdge(cur, raw);
      if (!nodes.has(raw) && nodes.size < MAX) { nodes.add(raw); bQueue.push(raw); }
    });
  }

  /* ② Forward BFS — byInputLot (원료→완제품) */
  var fQueue = [startLot];
  while (fQueue.length > 0 && nodes.size < MAX) {
    var cur = fQueue.shift();
    (STATE.byInputLot[cur] || []).forEach(function(fin) {
      pushEdge(fin, cur);
      if (!nodes.has(fin) && nodes.size < MAX) { nodes.add(fin); fQueue.push(fin); }
    });
  }

  return { nodes: nodes, edges: edges, truncated: nodes.size >= MAX };
}

/* 6-B: 각 Lot에 컬럼 인덱스 할당
   우선순위 ①: STATE.lotStage (Excel 단계 인덱스 직접 사용)
   우선순위 ②: BFS fallback (lotStage 정보 없는 Lot 대비)
   원료 = 컬럼 0(왼쪽), 완제품 = 컬럼 N(오른쪽)
   stageIdx 0 = 완제품(1단계) → 오른쪽, stageIdx N = 원료 → 왼쪽
*/
function assignLotColumns(nodes, edges) {
  var col = {};
  var maxStageIdx = 0;

  /* ① lotStage 기반 직접 할당 */
  nodes.forEach(function(l) {
    if (STATE.lotStage[l] !== undefined) {
      var si = STATE.lotStage[l];
      col[l] = si; // 일단 stageIdx로 저장 (나중에 반전)
      if (si > maxStageIdx) maxStageIdx = si;
    }
  });

  /* ② BFS fallback: lotStage 없는 노드 처리 */
  var rightOf = {}, leftOf = {};
  edges.forEach(function(e) {
    if (!rightOf[e.to])  rightOf[e.to]  = [];
    if (!leftOf[e.from]) leftOf[e.from] = [];
    rightOf[e.to].push(e.from);
    leftOf[e.from].push(e.to);
  });

  var bfsQueue = [];
  nodes.forEach(function(l) {
    if (col[l] === undefined) {
      if (!leftOf[l] || leftOf[l].length === 0) {
        col[l] = maxStageIdx; // 원료측 fallback
        bfsQueue.push(l);
      }
    }
  });
  if (bfsQueue.length === 0) {
    nodes.forEach(function(l) {
      if (col[l] === undefined) { col[l] = maxStageIdx; bfsQueue.push(l); }
    });
  }
  while (bfsQueue.length) {
    var cur = bfsQueue.shift();
    (rightOf[cur] || []).forEach(function(r) {
      if (col[r] === undefined) {
        col[r] = Math.max(0, col[cur] - 1);
        bfsQueue.push(r);
      }
    });
  }
  nodes.forEach(function(l) { if (col[l] === undefined) col[l] = 0; });

  /* stageIdx → displayCol: 원료(높은 idx)=0, 완제품(낮은 idx)=numCols-1 */
  nodes.forEach(function(l) { col[l] = maxStageIdx - col[l]; });

  return { colMap: col, maxStageIdx: maxStageIdx };
}

/* 6-C: 단계 헤더 라벨 결정
   displayCol 0 = 원료(stageIdx=maxStageIdx), displayCol N = 완제품(stageIdx=0)
   우선순위: stageTypeLabels → stageLabels → 기본값
*/
function getColumnLabel(displayCol, maxStageIdx) {
  var stageIdx = maxStageIdx - displayCol; // displayCol → 원래 stageIdx 역산

  /* 실제 공정명 (완제품/정제1차품 등) */
  var typeLabels = STATE.stageTypeLabels;
  if (typeLabels && typeLabels[stageIdx]) return typeLabels[stageIdx];

  /* Excel 헤더 라벨 (1단계/2단계 등) */
  var hdrLabels = STATE.stageLabels;
  if (hdrLabels && hdrLabels[stageIdx]) return hdrLabels[stageIdx];

  /* 기본값 */
  if (displayCol === 0)           return '원재료';
  if (displayCol === maxStageIdx) return '완제품';
  return (stageIdx + 1) + '단계';
}

/* 6-D: 반복 센터링(barycentric) tree layout 계산
   ① 초기: 각 lot = 1 slot, 왼→오른쪽 순으로 stacking
   ② 반복: forward pass(좌→우) + backward pass(우→좌) 로
      각 lot을 인접 컬럼 이웃들의 평균 Y에 맞춤
   ③ 중첩 해소: 같은 컬럼 내 lot들이 겹치면 아래로 밀어냄
   ④ 높이 stretch: 오른쪽 자식이 여럿이면 부모 높이를 자식 범위로 확장
   반환: { y, h, byCol, rightOf, leftOf, totalH, SLOT_H, SLOT_GAP }
*/
function computeLayout(nodes, edges, colMap, maxStageIdx) {
  var numCols  = maxStageIdx + 1;
  var SLOT_H   = 64;
  var SLOT_GAP = 6;
  var STEP     = SLOT_H + SLOT_GAP;

  /* 컬럼별 그룹 + 인접 맵 */
  var byCol = {};
  for (var c = 0; c < numCols; c++) byCol[c] = [];
  nodes.forEach(function(l) { byCol[colMap[l]].push(l); });

  var rightOf = {}, leftOf = {};
  edges.forEach(function(e) {
    var lc = colMap[e.to], rc = colMap[e.from];
    if (lc < rc) {
      if (!rightOf[e.to])  rightOf[e.to]  = [];
      if (!leftOf[e.from]) leftOf[e.from] = [];
      if (rightOf[e.to].indexOf(e.from)  === -1) rightOf[e.to].push(e.from);
      if (leftOf[e.from].indexOf(e.to)   === -1) leftOf[e.from].push(e.to);
    }
  });

  /* ① 초기 순서 결정: 왼쪽 부모 rank 기준 정렬 */
  var rank = {};
  byCol[0].sort();
  byCol[0].forEach(function(l, i) { rank[l] = i; });
  for (var c = 1; c < numCols; c++) {
    byCol[c].sort(function(a, b) {
      function minRank(lot) {
        var ps = (leftOf[lot] || []).filter(function(p) { return rank[p] !== undefined; });
        return ps.length ? Math.min.apply(null, ps.map(function(p) { return rank[p]; })) : 999;
      }
      return minRank(a) - minRank(b) || a.localeCompare(b);
    });
    byCol[c].forEach(function(l, i) { rank[l] = byCol[c - 1].length * 10 + i; });
  }

  /* ① 초기 Y 배치 (1 slot each, 순서대로) */
  var y = {};
  for (var c = 0; c < numCols; c++) {
    byCol[c].forEach(function(l, i) { y[l] = i * STEP; });
  }

  /* ③ 중첩 해소 헬퍼 */
  function resolveOverlaps(colLots) {
    var sorted = colLots.slice().sort(function(a, b) { return y[a] - y[b]; });
    for (var i = 1; i < sorted.length; i++) {
      var minY = y[sorted[i - 1]] + STEP;
      if (y[sorted[i]] < minY) y[sorted[i]] = minY;
    }
  }

  /* ② 반복 센터링 (5 passes) */
  for (var pass = 0; pass < 5; pass++) {
    /* forward: 각 lot을 왼쪽 부모들의 평균 Y에 맞춤 */
    for (var c = 1; c < numCols; c++) {
      byCol[c].forEach(function(l) {
        var ps = (leftOf[l] || []).filter(function(p) { return y[p] !== undefined; });
        if (ps.length) {
          y[l] = ps.reduce(function(s, p) { return s + y[p]; }, 0) / ps.length;
        }
      });
      resolveOverlaps(byCol[c]);
    }
    /* backward: 각 lot을 오른쪽 자식들의 평균 Y에 맞춤 */
    for (var c = numCols - 2; c >= 0; c--) {
      byCol[c].forEach(function(l) {
        var cs = (rightOf[l] || []).filter(function(ch) { return y[ch] !== undefined; });
        if (cs.length) {
          y[l] = cs.reduce(function(s, ch) { return s + y[ch]; }, 0) / cs.length;
        }
      });
      resolveOverlaps(byCol[c]);
    }
  }

  /* Y를 0 이상으로 정규화 */
  var minY = Infinity;
  nodes.forEach(function(l) { if (y[l] < minY) minY = y[l]; });
  if (minY < 0) nodes.forEach(function(l) { y[l] -= minY; });

  /* ④ 각 lot 기본 높이 = SLOT_H, 오른쪽 자식 여럿이면 stretch */
  var h = {};
  nodes.forEach(function(l) { h[l] = SLOT_H; });

  for (var c = 0; c < numCols - 1; c++) {
    byCol[c].forEach(function(l) {
      var cs = (rightOf[l] || []).filter(function(ch) { return colMap[ch] === c + 1; });
      if (cs.length > 1) {
        var topY   = Math.min.apply(null, cs.map(function(ch) { return y[ch]; }));
        var botEnd = Math.max.apply(null, cs.map(function(ch) { return y[ch] + h[ch]; }));
        if (topY < y[l]) y[l] = topY;
        var newH = botEnd - y[l];
        if (newH > h[l]) h[l] = newH;
      }
    });
  }

  /* ④-b: stretch 후 실제 h 기반 중첩 재해소 (push-down) */
  for (var c = 0; c < numCols; c++) {
    var sorted = byCol[c].slice().sort(function(a, b) { return y[a] - y[b]; });
    for (var i = 1; i < sorted.length; i++) {
      var prev = sorted[i - 1], cur = sorted[i];
      var needed = y[prev] + h[prev] + SLOT_GAP;
      if (y[cur] < needed) y[cur] = needed;
    }
  }

  /* ⑤ 최종 압축: 센터링 드리프트로 생긴 과도한 gap 제거 (top→bottom, pull-up) */
  for (var c = 0; c < numCols; c++) {
    var sorted = byCol[c].slice().sort(function(a, b) { return y[a] - y[b]; });
    for (var i = 1; i < sorted.length; i++) {
      var prev = sorted[i - 1], cur = sorted[i];
      var minY = y[prev] + h[prev] + SLOT_GAP;
      if (y[cur] > minY) y[cur] = minY; // 과도하게 벌어진 경우 위로 당김
    }
  }
  /* 압축 후 재정규화 */
  var minYFinal = Infinity;
  nodes.forEach(function(l) { if (y[l] < minYFinal) minYFinal = y[l]; });
  if (minYFinal > 0) nodes.forEach(function(l) { y[l] -= minYFinal; });

  /* 전체 높이 */
  var totalH = 0;
  nodes.forEach(function(l) { var e = y[l] + h[l]; if (e > totalH) totalH = e; });

  return { y: y, h: h, byCol: byCol, rightOf: rightOf, leftOf: leftOf,
           totalH: totalH, SLOT_H: SLOT_H, SLOT_GAP: SLOT_GAP };
}

/* 6-E: SVG 연결선 (layout 데이터 직접 사용 — getBoundingClientRect 불필요) */
function drawGenealogyConnections(inner, edges, colMap, layout, COL_W, COL_GAP, HDR_H) {
  var totalW = COL_W * Object.keys(layout.byCol).length +
               COL_GAP * (Object.keys(layout.byCol).length - 1);
  var totalH = layout.totalH + HDR_H + 8;

  var NS  = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(NS, 'svg');
  svg.classList.add('genealogy-svg');
  svg.setAttribute('width',  totalW);
  svg.setAttribute('height', totalH);
  // pointer-events는 path별로 설정 — SVG 컨테이너 자체는 기본(auto)
  svg.style.cssText = 'position:absolute;top:0;left:0;overflow:visible;';

  /* ── 투입량 비중 사전 계산 ── */
  // 각 outLot별 총 투입량 합산 + 최대 투입 엣지 추적 (표시되는 엣지 기준)
  var totalByOut  = {};
  var maxWByOut   = {};  // outLot → 최대 투입량
  var maxEdgeByOut = {}; // outLot → 최대 투입 inLot
  var edgeCntByOut = {}; // outLot → 투입량 있는 엣지 수
  var seen0 = {};
  edges.forEach(function(e) {
    var lc = colMap[e.to], rc = colMap[e.from];
    if (lc >= rc) return;
    var key = e.to + '→' + e.from;
    if (seen0[key]) return;
    seen0[key] = true;
    var w = STATE.edgeWeightMap[e.from + '→' + e.to];
    if (w > 0) {
      totalByOut[e.from]   = (totalByOut[e.from]   || 0) + w;
      edgeCntByOut[e.from] = (edgeCntByOut[e.from] || 0) + 1;
      if (maxWByOut[e.from] === undefined || w > maxWByOut[e.from]) {
        maxWByOut[e.from]    = w;
        maxEdgeByOut[e.from] = e.to;
      }
    }
  });

  /* ── 두께 티어 (투입 비중별 stroke-width) ── */
  var TIERS = [1.5, 2.5, 4, 5.5, 7];

  /* ── 툴팁 엘리먼트 (body에 1개만 유지) ── */
  var tooltip = document.getElementById('gn-edge-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'gn-edge-tooltip';
    tooltip.style.cssText = [
      'position:fixed',
      'background:var(--surface)',
      'border:1px solid var(--border)',
      'border-radius:6px',
      'padding:6px 11px',
      'font-size:0.78rem',
      'color:var(--text)',
      'pointer-events:none',
      'display:none',
      'z-index:9999',
      'box-shadow:0 3px 10px rgba(0,0,0,0.18)',
      'white-space:nowrap',
      'line-height:1.55',
    ].join(';');
    document.body.appendChild(tooltip);
  }

  /* ── 경로 그리기 ── */
  var seen = {};
  edges.forEach(function(e) {
    var lc = colMap[e.to], rc = colMap[e.from];
    if (lc >= rc) return;
    var key = e.to + '→' + e.from;
    if (seen[key]) return;
    seen[key] = true;

    var yL = layout.y[e.to],   hL = layout.h[e.to];
    var yR = layout.y[e.from], hR = layout.h[e.from];
    if (yL === undefined || yR === undefined) return;

    var x1 = lc * (COL_W + COL_GAP) + COL_W;
    var y1 = HDR_H + 8 + yL + hL / 2;
    var x2 = rc * (COL_W + COL_GAP);
    var y2 = HDR_H + 8 + yR + hR / 2;
    var cx = (x1 + x2) / 2;

    /* 투입량·비중 계산 */
    var edgeKey  = e.from + '→' + e.to;
    var w        = STATE.edgeWeightMap[edgeKey];   // 투입량(g), 없으면 undefined
    var hasW     = w !== undefined && w > 0;
    var tot      = totalByOut[e.from] || 0;
    var ratio    = (hasW && tot > 0) ? w / tot : null;

    /* 두께 티어 선택 */
    var tierIdx = 0;
    if (ratio !== null) {
      if      (ratio > 0.75) tierIdx = 4;
      else if (ratio > 0.50) tierIdx = 3;
      else if (ratio > 0.30) tierIdx = 2;
      else if (ratio > 0.10) tierIdx = 1;
      else                   tierIdx = 0;
    }
    var sw = TIERS[tierIdx];

    /* 최대 투입 엣지 여부 — 경쟁 엣지가 2개 이상일 때만 강조 */
    var isMax = hasW &&
                maxEdgeByOut[e.from] === e.to &&
                (edgeCntByOut[e.from] || 0) >= 2;
    var strokeColor = isMax ? 'var(--accent)' : 'var(--border-hover)';

    /* 시각 경로 */
    var dAttr = 'M ' + x1 + ' ' + y1 +
      ' C ' + cx + ' ' + y1 + ', ' + cx + ' ' + y2 + ', ' + x2 + ' ' + y2;

    var path = document.createElementNS(NS, 'path');
    path.setAttribute('d',              dAttr);
    path.setAttribute('stroke',         strokeColor);
    path.setAttribute('stroke-width',   String(sw));
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('fill',           'none');
    path.setAttribute('pointer-events', 'none');
    svg.appendChild(path);

    /* 투명 히트 영역 (두꺼운 투명 경로 → hover 감지) */
    var hit = document.createElementNS(NS, 'path');
    hit.setAttribute('d',            dAttr);
    hit.setAttribute('stroke',       'transparent');
    hit.setAttribute('stroke-width', '14');
    hit.setAttribute('fill',         'none');
    hit.setAttribute('pointer-events', 'stroke');
    hit.style.cursor = hasW ? 'pointer' : 'default';
    svg.appendChild(hit);

    if (hasW) {
      var pct = ratio !== null ? (ratio * 100).toFixed(1) + '%' : '-';
      var wTxt = w % 1 === 0 ? w + ' g' : w.toFixed(1) + ' g';
      hit.addEventListener('mousemove', function(ev) {
        tooltip.innerHTML =
          '<span style="color:var(--text-muted);font-size:0.72rem">' + escHtml(e.to) + ' → ' + escHtml(e.from) + '</span><br>' +
          '투입량 <strong>' + wTxt + '</strong> &nbsp;|&nbsp; 비중 <strong style="color:var(--accent)">' + pct + '</strong>';
        tooltip.style.display = 'block';
        tooltip.style.left    = (ev.clientX + 14) + 'px';
        tooltip.style.top     = (ev.clientY - 36) + 'px';
      });
      hit.addEventListener('mouseleave', function() {
        tooltip.style.display = 'none';
      });
    }
  });

  /* SVG를 lot 노드보다 먼저 삽입 → 노드가 SVG 위에 렌더됨 */
  inner.insertBefore(svg, inner.firstChild);
}

/* 6-F: 계보도 렌더링 메인 (절대좌표 tree layout) */
function renderGenealogy(lot) {
  var flowCard  = document.getElementById('flow-card');
  var container = document.getElementById('genealogy-viewer');

  var result = collectFullChain(lot);
  var nodes  = Array.from(result.nodes);
  var edges  = result.edges;

  flowCard.style.display = '';
  container.innerHTML    = '';

  if (result.truncated) {
    var warn = document.createElement('div');
    warn.style.cssText = 'color:var(--warning);font-size:0.8rem;margin-bottom:8px;padding:0 16px;';
    warn.textContent   = '⚠ 노드가 50개를 초과하여 일부만 표시됩니다.';
    container.appendChild(warn);
  }

  if (nodes.length === 0) return;

  /* 컬럼 및 layout 계산 */
  var assigned    = assignLotColumns(nodes, edges);
  var colMap      = assigned.colMap;
  var maxStageIdx = assigned.maxStageIdx;
  var numCols     = maxStageIdx + 1;
  var layout      = computeLayout(nodes, edges, colMap, maxStageIdx);

  var COL_W  = 180;  // 컬럼 너비 (px)
  var COL_GAP = 80;  // 컬럼 간 간격 (SVG 화살표용)
  var HDR_H  = 32;   // 헤더 높이 (px)
  var PAD    = 8;    // 헤더 아래 패딩

  var totalW = numCols * COL_W + (numCols - 1) * COL_GAP;
  var totalH = layout.totalH + HDR_H + PAD;

  /* 스크롤 래퍼 */
  var wrap = document.createElement('div');
  wrap.className = 'genealogy-flow';

  /* 절대좌표 기준 inner */
  var inner = document.createElement('div');
  inner.className = 'genealogy-inner';
  inner.style.cssText = 'width:' + totalW + 'px;height:' + totalH + 'px;';

  /* 각 outLot별 총 투입량 (노드 레이블용) */
  var totalByOut = {};
  edges.forEach(function(e) {
    var w = STATE.edgeWeightMap[e.from + '→' + e.to];
    if (w > 0) totalByOut[e.from] = (totalByOut[e.from] || 0) + w;
  });

  /* 컬럼별 헤더 + lot 노드 */
  for (var c = 0; c < numCols; c++) {
    var colX = c * (COL_W + COL_GAP);

    /* 헤더 */
    var hdr = document.createElement('div');
    hdr.className = 'stage-col-header';
    hdr.style.cssText = 'left:' + colX + 'px;top:0;width:' + COL_W + 'px;';
    hdr.textContent   = getColumnLabel(c, maxStageIdx);
    inner.appendChild(hdr);

    /* Lot 노드들 */
    (layout.byCol[c] || []).forEach(function(l) {
      var meta  = STATE.lotMeta[l] || {};
      var nodeY = HDR_H + PAD + layout.y[l];
      var nodeH = layout.h[l];

      var node = document.createElement('div');
      node.className   = 'lot-node' + (l === lot ? ' gn-selected' : '');
      node.dataset.lot = l;
      node.style.cssText =
        'left:' + colX + 'px;top:' + nodeY + 'px;' +
        'width:' + COL_W + 'px;min-height:' + nodeH + 'px;';
      var tw = totalByOut[l];
      var twHtml = tw > 0
        ? '<span class="lot-node-total">' + (tw % 1 === 0 ? tw : parseFloat(tw.toFixed(1))) + ' g</span>'
        : '';
      node.innerHTML =
        '<div class="lot-node-id"><span>' + escHtml(l) + '</span>' + twHtml + '</div>' +
        (meta.remark ? '<div class="lot-node-remark">' + escHtml(meta.remark) + '</div>' : '');
      node.onclick = (function(lClosed) { return function() {
        STATE.selectedLot = lClosed;
        document.querySelectorAll('.lot-item').forEach(function(el) {
          el.classList.toggle('active', el.dataset.lot === lClosed);
        });
        renderGenealogy(lClosed);
        if (typeof renderTrackingTable === 'function') renderTrackingTable(lClosed);
      }; })(l);
      inner.appendChild(node);
    });
  }

  wrap.appendChild(inner);
  container.appendChild(wrap);

  /* SVG 연결선 */
  drawGenealogyConnections(inner, edges, colMap, layout, COL_W, COL_GAP, HDR_H);

  /* 렌더 후 flow-card로 스크롤 */
  flowCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* 6-G: 숫자 표시 헬퍼 — 소수점 3자리(4자리에서 반올림), 후행 0 제거 */
function fmtVal(v) {
  if (v === null || v === undefined) return '-';
  var n = parseFloat(v);
  if (isNaN(n)) return String(v);
  return parseFloat(n.toFixed(3)).toString();
}

/* 6-F: HTML 이스케이프 헬퍼 */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* 6-G: 계보도 클립보드 복사 (rowspan HTML → Excel 병합 셀로 붙여넣기 가능)
   완제품 → 원료 방향 DFS로 경로 열거 → 같은 컬럼의 연속 동일값을 rowspan 처리
*/
function copyGenealogyToClipboard() {
  var lot = STATE.selectedLot;
  if (!lot) { alert('먼저 Lot을 선택하세요.'); return; }

  var result  = collectFullChain(lot);
  var nodes   = Array.from(result.nodes);
  var edges   = result.edges;
  if (nodes.length === 0) return;

  var assigned    = assignLotColumns(nodes, edges);
  var colMap      = assigned.colMap;
  var maxStageIdx = assigned.maxStageIdx;
  var numCols     = maxStageIdx + 1;

  /* 완제품→원료 인접 맵 */
  var children = {};
  edges.forEach(function(e) {
    if (!children[e.from]) children[e.from] = [];
    if (children[e.from].indexOf(e.to) === -1) children[e.from].push(e.to);
  });

  /* 루트: displayCol 최대 (완제품 쪽) */
  var roots = nodes.filter(function(l) { return colMap[l] === maxStageIdx; });
  if (roots.length === 0) roots = [lot];

  /* DFS 경로 열거 */
  var paths = [];
  function dfs(l, path) {
    var p = path.concat([l]);
    var kids = children[l] || [];
    if (kids.length === 0) { paths.push(p); return; }
    kids.forEach(function(k) { dfs(k, p); });
  }
  roots.forEach(function(r) { dfs(r, []); });
  if (paths.length === 0) paths = [[lot]];

  /* 헤더 (완제품→원료) */
  var headers = [];
  for (var dc = maxStageIdx; dc >= 0; dc--) headers.push(getColumnLabel(dc, maxStageIdx));

  /* 데이터 행 */
  var dataRows = paths.map(function(path) {
    var row = new Array(numCols).fill('');
    path.forEach(function(l) {
      var meta   = STATE.lotMeta[l] || {};
      var colIdx = maxStageIdx - colMap[l];
      row[colIdx] = l + (meta.remark ? ' (' + meta.remark + ')' : '');
    });
    return row;
  });

  /* rowspan 계산: 각 컬럼에서 연속된 동일값을 묶음 */
  var numRows = dataRows.length;
  var rowspan = [];   // rowspan[r][c] = n (n>1이면 병합 시작, 0이면 이 셀 skip)
  for (var r = 0; r < numRows; r++) rowspan[r] = new Array(numCols).fill(1);

  for (var c = 0; c < numCols; c++) {
    var r = 0;
    while (r < numRows) {
      var val = dataRows[r][c];
      if (!val) { r++; continue; }
      var span = 1;
      while (r + span < numRows && dataRows[r + span][c] === val) span++;
      if (span > 1) {
        rowspan[r][c] = span;
        for (var k = 1; k < span; k++) rowspan[r + k][c] = 0; // 0 = skip
      }
      r += span;
    }
  }

  /* HTML 테이블 생성 */
  var html = '<table border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:12px;">';
  html += '<tr>';
  headers.forEach(function(h) {
    html += '<th style="background:#d9e1f2;padding:6px 10px;text-align:center;">' + escHtml(h) + '</th>';
  });
  html += '</tr>';

  for (var r = 0; r < numRows; r++) {
    html += '<tr>';
    for (var c = 0; c < numCols; c++) {
      var rs = rowspan[r][c];
      if (rs === 0) continue; // 위 셀 rowspan에 포함
      var val = dataRows[r][c] || '';
      html += '<td' +
        (rs > 1 ? ' rowspan="' + rs + '"' : '') +
        ' style="padding:5px 10px;vertical-align:middle;">' +
        escHtml(val) + '</td>';
    }
    html += '</tr>';
  }
  html += '</table>';

  /* 클립보드 복사 */
  var btn = document.getElementById('btn-genealogy-copy');
  try {
    navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }) })])
      .then(function() {
        btn.textContent = '✓ 복사됨';
        setTimeout(function() { btn.textContent = '⎘ 계보 복사'; }, 2000);
      });
  } catch(e) {
    /* fallback: execCommand */
    var ta = document.createElement('textarea');
    ta.value = html;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    btn.textContent = '✓ 복사됨';
    setTimeout(function() { btn.textContent = '⎘ 계보 복사'; }, 2000);
  }
}

/* ══════════════════════════════════════════════════════════════
   Step 7: SPC 차트
   ══════════════════════════════════════════════════════════════ */

/* 7-A: qualityRecords → 공정단계별 그룹화
   반환: { stage: { itemLabel: [record, ...] } }
*/
function groupByStageAndItem() {
  var groups = {};
  STATE.qualityRecords.forEach(function(rec) {
    if (!groups[rec.stage]) groups[rec.stage] = {};
    if (!groups[rec.stage][rec.itemLabel]) groups[rec.stage][rec.itemLabel] = [];
    groups[rec.stage][rec.itemLabel].push(rec);
  });
  return groups;
}

/* 7-C: 이탈 여부 판별 (USL/LSL 기준) */
function isOutOfSpec(rec) {
  if (rec.USL !== null && !isNaN(rec.USL) && rec.value > rec.USL) return true;
  if (rec.LSL !== null && !isNaN(rec.LSL) && rec.value < rec.LSL) return true;
  return false;
}

/* 7-D / 7-E: annotation 플러그인용 관리선 config 생성
   UCL/LCL → 빨간 점선, USL/LSL → 주황 실선
   records 배열에서 첫 번째 유효한 기준값 사용
*/
function buildAnnotations(records) {
  var ann = {};
  var limitKeys = ['UCL', 'LCL', 'USL', 'LSL'];
  limitKeys.forEach(function(key) {
    var val = null;
    for (var i = 0; i < records.length; i++) {
      var v = records[i][key];
      if (v !== null && !isNaN(v)) { val = v; break; }
    }
    if (val === null) return;

    var isCtrl = key === 'UCL' || key === 'LCL'; // 관리한계 vs 규격한계
    ann[key] = {
      type:        'line',
      yMin:        val,
      yMax:        val,
      borderColor: isCtrl ? '#ef4444' : '#f59e0b',
      borderWidth: 1.5,
      borderDash:  isCtrl ? [6, 3] : [],
      label: {
        display:    true,
        content:    key + ' ' + val,
        position:   'end',
        font:       { size: 10 },
        color:      isCtrl ? '#ef4444' : '#f59e0b',
        backgroundColor: 'transparent',
        padding:    2,
      },
    };
  });
  return ann;
}

/* 7-F: 포인트 색상 배열 생성 (이탈 → 빨강, 정상 → 기본색) */
function buildPointColors(records, defaultColor) {
  return records.map(function(rec) {
    return isOutOfSpec(rec) ? '#ef4444' : defaultColor;
  });
}

/* 7-B / 7-G: 측정항목 1개당 차트 1개 생성
   canvasId: 고유 ID, records: 해당 항목 레코드 배열
*/
function createSpcChart(canvasId, itemLabel, records) {
  var canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  var labels  = records.map(function(r) { return r.batchNo; });
  var values  = records.map(function(r) { return r.value; });
  var ptColors = buildPointColors(records, '#4a9eff');
  var anns    = buildAnnotations(records);

  var chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label:                itemLabel,
        data:                 values,
        borderColor:          '#4a9eff',
        borderWidth:          2,
        tension:              0.3,
        pointRadius:          5,
        pointHoverRadius:     7,
        pointBackgroundColor: ptColors,
        pointBorderColor:     ptColors,
        fill:                 false,
      }],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        annotation: { annotations: anns },
        tooltip: {
          callbacks: {
            afterLabel: function(ctx) {
              var rec = records[ctx.dataIndex];
              var lines = [];
              if (rec.USL !== null && !isNaN(rec.USL)) lines.push('USL: ' + rec.USL);
              if (rec.LSL !== null && !isNaN(rec.LSL)) lines.push('LSL: ' + rec.LSL);
              if (isOutOfSpec(rec)) lines.push('⚠ 규격 이탈');
              return lines;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { font: { size: 10 }, maxRotation: 45 },
          grid:  { color: 'rgba(128,128,128,0.15)' },
        },
        y: {
          ticks: { font: { size: 10 } },
          grid:  { color: 'rgba(128,128,128,0.15)' },
        },
      },
      // 7-H: 클릭 이벤트 → Step 8 Deep-Dive 연결
      onClick: function(event, elements) {
        if (!elements.length) return;
        var idx    = elements[0].index;
        var batchNo = records[idx].batchNo;
        handleChartClick(batchNo);
      },
    },
  });
  return chart;
}

/* 7-G: 공정단계별 섹션 카드 렌더링 */
function renderSpcCharts() {
  // 7-G: 이전 차트 인스턴스 destroy (메모리 누수 방지)
  STATE.chartInstances.forEach(function(c) { try { c.destroy(); } catch(e) {} });
  STATE.chartInstances = [];

  var container = document.getElementById('spc-container');
  container.innerHTML = '';

  var groups    = groupByStageAndItem();
  var stageList = Object.keys(groups);

  if (stageList.length === 0) return;

  // 전체 펼치기/접기 버튼 바 표시
  var ctrlBar = document.getElementById('spc-ctrl-bar');
  if (ctrlBar) ctrlBar.style.display = 'flex';

  stageList.forEach(function(stage) {
    // 섹션 래퍼
    var section = document.createElement('div');
    section.className = 'spc-section';

    // 헤더 (클릭 시 fold/unfold)
    var title = document.createElement('div');
    title.className = 'spc-section-title';

    var titleText = document.createElement('span');
    titleText.textContent = stage;
    title.appendChild(titleText);

    var foldIcon = document.createElement('span');
    foldIcon.className = 'spc-fold-icon';
    foldIcon.textContent = '▶ 펼치기';
    title.appendChild(foldIcon);

    section.appendChild(title);

    // 바디 (초기 접힘)
    var body = document.createElement('div');
    body.className = 'spc-section-body spc-collapsed';

    var grid = document.createElement('div');
    grid.className = 'charts-grid';

    var items = Object.keys(groups[stage]);
    items.forEach(function(itemLabel) {
      var records  = groups[stage][itemLabel];
      var canvasId = 'chart-' + (stage + '-' + itemLabel).replace(/[^a-zA-Z0-9가-힣]/g, '_');

      var box = document.createElement('div');
      box.className = 'chart-box';
      box.innerHTML =
        '<div class="chart-title">' + itemLabel + '</div>' +
        '<canvas id="' + canvasId + '"></canvas>';
      grid.appendChild(box);
    });

    body.appendChild(grid);
    section.appendChild(body);
    container.appendChild(section);

    // fold/unfold 토글 — 펼칠 때 차트 생성 (lazy)
    // _buildCharts: 처음 펼칠 때 한 번만 호출; 이후 null로 교체
    body._buildCharts = function() {
      items.forEach(function(itemLabel) {
        var records  = groups[stage][itemLabel];
        var canvasId = 'chart-' + (stage + '-' + itemLabel).replace(/[^a-zA-Z0-9가-힣]/g, '_');
        setTimeout(function() {
          var chart = createSpcChart(canvasId, itemLabel, records);
          if (chart) STATE.chartInstances.push(chart);
        }, 0);
      });
      body._buildCharts = null; // 재호출 방지
    };

    title.addEventListener('click', function() {
      var collapsed = body.classList.toggle('spc-collapsed');
      foldIcon.textContent = collapsed ? '▶ 펼치기' : '▼ 접기';
      if (!collapsed && body._buildCharts) body._buildCharts();
    });
  });
}

/* 7-H: 전체 펼치기 / 전체 접기 */
function spcExpandAll() {
  document.querySelectorAll('#spc-container .spc-section-body').forEach(function(body) {
    body.classList.remove('spc-collapsed');
    var icon = body.closest('.spc-section').querySelector('.spc-fold-icon');
    if (icon) icon.textContent = '▼ 접기';
    if (body._buildCharts) body._buildCharts();
  });
}

function spcCollapseAll() {
  document.querySelectorAll('#spc-container .spc-section-body').forEach(function(body) {
    body.classList.add('spc-collapsed');
    var icon = body.closest('.spc-section').querySelector('.spc-fold-icon');
    if (icon) icon.textContent = '▶ 펼치기';
  });
}

/* ══════════════════════════════════════════════════════════════
   Step 8: Batch Deep-Dive
   ══════════════════════════════════════════════════════════════ */

/* 8-C: 모든 SPC 차트에서 해당 BatchNo 포인트 하이라이트
   해당 배치 → 빨간 테두리 + 큰 원, 나머지 → 원래 크기
*/
function highlightBatch(batchNo) {
  STATE.chartInstances.forEach(function(chart) {
    var ds     = chart.data.datasets[0];
    var labels = chart.data.labels;
    var newRadius = [];
    var newBorder = [];
    var newBg     = [];

    labels.forEach(function(label, i) {
      var isTarget = String(label) === String(batchNo);
      // 원래 포인트 색(이탈 여부에 따라)
      var origColor = Array.isArray(ds.pointBackgroundColor)
        ? ds.pointBackgroundColor[i]
        : (ds.pointBackgroundColor || '#4a9eff');

      newRadius.push(isTarget ? 10 : 5);
      newBorder.push(isTarget ? '#ef4444' : origColor);
      newBg.push(origColor);
    });

    ds.pointRadius      = newRadius;
    ds.pointBorderColor = newBorder;
    ds.pointBorderWidth = labels.map(function(l, i) {
      return String(l) === String(batchNo) ? 3 : 1;
    });
    ds.pointBackgroundColor = newBg;
    chart.update('none'); // 애니메이션 없이 즉시 갱신
  });
}

/* 8-C: 하이라이트 초기화 */
function clearHighlight() {
  STATE.chartInstances.forEach(function(chart) {
    var ds = chart.data.datasets[0];
    // pointBackgroundColor 는 원래 이탈 색상으로 복원
    // → 차트를 재빌드하지 않고 radius/border만 초기화
    ds.pointRadius      = 5;
    ds.pointBorderWidth = 1;
    // borderColor 는 pointBackgroundColor 와 동일하게
    ds.pointBorderColor = ds.pointBackgroundColor;
    chart.update('none');
  });
}

/* 8-B: 딥다이브 패널 렌더링
   batchNo 에 해당하는 전 공정 레코드를 공정단계별 테이블로 표시
*/
function renderDeepDive(batchNo) {
  var card    = document.getElementById('deep-dive-card');
  var content = document.getElementById('deep-dive-content');

  var recs = STATE.qualityRecords.filter(function(r) {
    return String(r.batchNo) === String(batchNo);
  });

  if (recs.length === 0) {
    card.classList.remove('visible');
    return;
  }

  // 공정단계별 그룹화
  var byStage = {};
  recs.forEach(function(r) {
    if (!byStage[r.stage]) byStage[r.stage] = [];
    byStage[r.stage].push(r);
  });

  var ngCount   = recs.filter(isOutOfSpec).length;
  var totalCount = recs.length;

  var html = '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;">' +
    '<span style="font-weight:700;font-size:1rem;">Batch: ' + batchNo + '</span>' +
    '<span class="badge-' + (ngCount > 0 ? 'danger' : 'success') + '">' +
      '이탈 ' + ngCount + ' / 전체 ' + totalCount +
    '</span>' +
    '<button id="deep-dive-close" class="btn btn-sm btn-secondary" style="margin-left:auto;">✕ 닫기</button>' +
  '</div>';

  Object.keys(byStage).forEach(function(stage) {
    html += '<div style="margin-bottom:16px;">';
    html += '<div class="chart-title" style="margin-bottom:6px;">' + stage + '</div>';
    html += '<div class="trace-table-wrap"><table class="data-table"><thead><tr>' +
      '<th>측정항목</th><th>측정값</th><th>USL</th><th>LSL</th><th>UCL</th><th>LCL</th><th>판정</th>' +
      '</tr></thead><tbody>';

    byStage[stage].forEach(function(r) {
      var ng  = isOutOfSpec(r);
      var cls = ng ? ' class="cell-exceed"' : '';
      html +=
        '<tr>' +
        '<td>' + r.itemLabel + '</td>' +
        '<td' + cls + '>' + fmtVal(r.value) + '</td>' +
        '<td>' + fmtVal(r.USL) + '</td>' +
        '<td>' + fmtVal(r.LSL) + '</td>' +
        '<td>' + fmtVal(r.UCL) + '</td>' +
        '<td>' + fmtVal(r.LCL) + '</td>' +
        '<td' + cls + '>' + (ng ? 'NG' : 'OK') + '</td>' +
        '</tr>';
    });

    html += '</tbody></table></div></div>';
  });

  content.innerHTML = html;
  card.classList.add('visible');

  // 8-D: 닫기 버튼
  document.getElementById('deep-dive-close').addEventListener('click', function() {
    card.classList.remove('visible');
    STATE.selectedBatch = null;
    clearHighlight();
  });
}

/* 8-A: 차트 클릭 진입점 (Step 7의 onClick에서 호출) */
function handleChartClick(batchNo) {
  STATE.selectedBatch = batchNo;
  highlightBatch(batchNo);
  renderDeepDive(batchNo);
  // 딥다이브 카드로 스크롤
  document.getElementById('deep-dive-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ══════════════════════════════════════════════════════════════
   Step 9: 추적 테이블
   ══════════════════════════════════════════════════════════════ */

/* 9-A: 선택 Lot + BFS 연관 Lot 목록 확정
   collectRelatedLots 재활용, 자기 자신 포함
*/
function getTraceLots(selectedLot) {
  var result = collectRelatedLots(selectedLot, STATE.traceDir);
  var lots   = Array.from(result.nodes); // Set → Array
  // 선택 Lot을 맨 앞으로
  lots = [selectedLot].concat(lots.filter(function(l) { return l !== selectedLot; }));
  return lots;
}

/* 9-B: 대상 Lot 목록으로 품질 레코드 조회
   batchNo 값 직접 비교 (row.includes() 사용 안 함)
*/
function getRecordsForLots(lots) {
  var lotSet = new Set(lots.map(String));
  return STATE.qualityRecords.filter(function(r) {
    return lotSet.has(String(r.batchNo));
  });
}

/* 9-C / 9-D / 9-E: 추적 테이블 렌더링 */
function renderTrackingTable(selectedLot) {
  var card      = document.getElementById('trace-card');
  var container = document.getElementById('trace-result');

  var lots    = getTraceLots(selectedLot);
  var records = getRecordsForLots(lots);

  if (records.length === 0) {
    card.style.display = 'none';
    return;
  }

  // 9-E: 요약 뱃지
  var ngCount    = records.filter(isOutOfSpec).length;
  var totalCount = records.length;
  var ngRate     = totalCount > 0 ? (ngCount / totalCount * 100).toFixed(1) : '0.0';

  var summaryHtml =
    '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;align-items:center;">' +
    '<span style="font-weight:600;">선택 Lot: <span style="color:var(--accent)">' + selectedLot + '</span></span>' +
    '<span class="badge-primary">연관 Lot ' + lots.length + '개</span>' +
    '<span class="badge-' + (ngCount > 0 ? 'danger' : 'success') + '">이탈 ' + ngCount + ' / ' + totalCount + '건</span>' +
    '<span class="badge-' + (parseFloat(ngRate) > 5 ? 'warning' : 'success') + '">이탈율 ' + ngRate + '%</span>' +
    '</div>';

  // 9-C: 테이블 (Lot별 그룹 헤더 → 공정단계·측정항목·값·기준값·판정)
  // Lot → 공정단계 → 레코드 순으로 그룹화
  var byLot = {};
  lots.forEach(function(lot) { byLot[lot] = {}; });
  records.forEach(function(r) {
    var lot = String(r.batchNo);
    if (!byLot[lot]) byLot[lot] = {};
    if (!byLot[lot][r.stage]) byLot[lot][r.stage] = [];
    byLot[lot][r.stage].push(r);
  });

  var tableHtml =
    '<table class="data-table">' +
    '<thead><tr>' +
    '<th>Lot (Batch No.)</th><th>공정단계</th><th>측정항목</th>' +
    '<th>측정값</th><th>USL</th><th>LSL</th><th>UCL</th><th>LCL</th><th>판정</th>' +
    '</tr></thead><tbody>';

  lots.forEach(function(lot) {
    var stageMap = byLot[lot];
    if (!stageMap || Object.keys(stageMap).length === 0) return;

    var stages   = Object.keys(stageMap);
    var lotRowspan = stages.reduce(function(s, st) { return s + stageMap[st].length; }, 0);
    var lotPrinted = false;

    stages.forEach(function(stage) {
      var recs = stageMap[stage];
      var stagePrinted = false;

      recs.forEach(function(r) {
        var ng  = isOutOfSpec(r);
        var cls = ng ? ' class="cell-exceed"' : '';

        tableHtml += '<tr>';

        // Lot 셀 — rowspan
        if (!lotPrinted) {
          var isSelected = lot === selectedLot;
          tableHtml +=
            '<td rowspan="' + lotRowspan + '" style="font-weight:600;vertical-align:middle;' +
            (isSelected ? 'color:var(--accent);' : '') + '">' + lot + '</td>';
          lotPrinted = true;
        }

        // 공정단계 셀 — rowspan
        if (!stagePrinted) {
          tableHtml +=
            '<td rowspan="' + recs.length + '" style="vertical-align:middle;font-size:0.8rem;color:var(--text-muted);">' +
            stage + '</td>';
          stagePrinted = true;
        }

        tableHtml +=
          '<td>' + r.itemLabel + '</td>' +
          '<td' + cls + '>' + fmtVal(r.value) + '</td>' +
          '<td>' + (r.USL !== null && !isNaN(r.USL) ? fmtVal(r.USL) : '-') + '</td>' +
          '<td>' + (r.LSL !== null && !isNaN(r.LSL) ? fmtVal(r.LSL) : '-') + '</td>' +
          '<td>' + (r.UCL !== null && !isNaN(r.UCL) ? fmtVal(r.UCL) : '-') + '</td>' +
          '<td>' + (r.LCL !== null && !isNaN(r.LCL) ? fmtVal(r.LCL) : '-') + '</td>' +
          '<td' + cls + '>' + (ng ? 'NG' : 'OK') + '</td>' +
          '</tr>';
      });
    });
  });

  tableHtml += '</tbody></table>';

  container.innerHTML = summaryHtml + '<div class="trace-table-wrap">' + tableHtml + '</div>';
  card.style.display  = '';
}

