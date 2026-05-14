/**
 * SDC 제조이력 일괄 등록 — 2026-05 표 데이터
 *
 * 출처: 출하 Lot 6건 × P/N Type × 합성 Batch × 승화(정제) Batch 매트릭스 표
 *
 * 생성 데이터:
 *   - pn_flow_docs/sdc-mfg-202605          (P 섹션 2 Lot · N 섹션 7 Lot · 총 17 정제 Batch)
 *   - pn_flow_shipments/sdc-ship-AMJ2902 외 5건 (총 6건, 27 components, customer="SDC")
 *
 * 사용법:
 *   1. 포털(QA Manager)에 @ltml.co.kr 계정으로 로그인
 *   2. 사이드바에서 "P/N 공정 Flow 관리" 탭을 한 번 클릭해 firebase SDK 로딩
 *   3. F12 → Console 탭
 *   4. 이 파일 전체 복사 → 콘솔에 붙여넣기 → Enter
 *   5. 출하 일자 prompt 가 뜨면 YYYY-MM-DD 입력 (전부 동일 일자 적용)
 *   6. 로그 확인 후 15번 탭 새로고침 → 새 문서·출하 6건 확인
 *
 * 안전장치:
 *   - 같은 docId/shipId 가 이미 있으면 ABORT (덮어쓰기 없음)
 *   - 모든 정제 Batch qty = null (placeholder 모드)
 *   - 모든 출하 component qty = 0 (placeholder 모드 — 추후 UI 에서 수정)
 *
 * 롤백: Firebase Console RTDB 에서 pn_flow_docs/sdc-mfg-202605 노드와
 *       pn_flow_shipments/sdc-ship-* 6개 노드를 수동 삭제.
 */

(async function () {
  const DOC_ID = 'sdc-mfg-202605';
  const TITLE = 'SDC 제조이력 (2026-05)';
  const CUSTOMER = 'SDC';

  if (typeof firebase === 'undefined' || !firebase.database) {
    console.error('❌ firebase.database 사용 불가. 15번 P/N Flow 탭을 한 번 클릭한 뒤 다시 시도하세요.');
    return;
  }
  const user = (firebase.auth().currentUser && firebase.auth().currentUser.email) || '';
  if (!user) { console.error('❌ 로그인 정보 없음. 다시 로그인하세요.'); return; }

  const today = new Date().toISOString().slice(0, 10);
  const shipDate = prompt('출하 일자 (YYYY-MM-DD) — 6건 모두에 공통 적용. 비워두면 빈 값(나중에 UI에서 입력):', today);
  if (shipDate === null) { console.log('취소됨.'); return; }

  // ─── 합성 Batch → 정제(승화) Batch 매핑 ────────────────
  const LOTS_P = [
    { name: 'MC05', refines: ['L25G-305-101'] },
    { name: 'MG14', refines: ['L25G-301-106', 'L26A-301-107', 'L26A-303-108', 'L26D-331-101'] },
  ];
  const LOTS_N = [
    { name: 'MJ15', refines: ['L25J-303-103'] },
    { name: 'NB04', refines: ['L26B-304-105', 'L26B-305-105'] },
    { name: 'MK24', refines: ['L26A-326-102', 'L26A-105-105'] },
    { name: 'NB13', refines: ['L26B-305-110', 'L26C-107-117'] },
    { name: 'NC05', refines: ['L26D-305-102'] },
    { name: 'NC04', refines: ['L26C-202-106', 'L26C-201-106'] },
    { name: 'ND06', refines: ['L26D-305-104', 'L26D-305-105'] },
  ];

  // ─── 출하 Lot 매핑 (Type / 합성 Batch / 승화 Batch) ────
  const SHIPMENTS = [
    { name: 'AMJ2902', comps: [
      ['P', 'MC05', 'L25G-305-101'],
      ['N', 'MJ15', 'L25J-303-103'],
    ]},
    { name: 'AML1904', comps: [
      ['P', 'MC05', 'L25G-305-101'],
      ['N', 'MJ15', 'L25J-303-103'],
    ]},
    { name: 'ANB1901', comps: [
      ['P', 'MG14', 'L25G-301-106'],
      ['N', 'NB04', 'L26B-304-105'],
      ['N', 'NB04', 'L26B-305-105'],
    ]},
    { name: 'ANC1101', comps: [
      ['P', 'MG14', 'L25G-301-106'],
      ['P', 'MG14', 'L26A-301-107'],
      ['N', 'MK24', 'L26A-326-102'],
      ['N', 'NB04', 'L26B-305-105'],
      ['N', 'NB13', 'L26B-305-110'],
    ]},
    { name: 'AND1307', comps: [
      ['P', 'MG14', 'L26A-301-107'],
      ['P', 'MG14', 'L26A-303-108'],
      ['N', 'MJ15', 'L25J-303-103'],
      ['N', 'NC05', 'L26D-305-102'],
      ['N', 'NB13', 'L26B-305-110'],
      ['N', 'NC04', 'L26C-202-106'],
      ['N', 'NC04', 'L26C-201-106'],
    ]},
    { name: 'AND2914', comps: [
      ['P', 'MG14', 'L26A-303-108'],
      ['P', 'MG14', 'L26D-331-101'],
      ['N', 'NB13', 'L26B-305-110'],
      ['N', 'ND06', 'L26D-305-104'],
      ['N', 'ND06', 'L26D-305-105'],
      ['N', 'MK24', 'L26A-326-102'],
      ['N', 'MK24', 'L26A-105-105'],
      ['N', 'NB13', 'L26C-107-117'],
    ]},
  ];

  // ─── ID 헬퍼 ────────────────────────────────────────────
  const secId    = (t)              => `${DOC_ID}-sec${t}`;
  const lotId    = (t, n)           => `${DOC_ID}-lot-${t}-${n}`;
  const refineId = (t, lot, ref)    => `${DOC_ID}-r-${t}-${lot}-${ref}`;
  const shipId   = (n)              => `sdc-ship-${n}`;

  // ─── 문서 객체 ──────────────────────────────────────────
  const buildLots = (type, lots) => lots.map(l => ({
    id: lotId(type, l.name),
    name: l.name,
    subName: '',
    steps: [],
    refines: l.refines.map(rn => ({
      id: refineId(type, l.name, rn),
      name: rn,
      qty: null,
      unit: 'g'
    }))
  }));

  const now = Date.now();
  const doc = {
    id: DOC_ID,
    title: TITLE,
    material: '',
    author: '',
    date: today,
    sections: [
      { id: secId('P'), type: 'P', lots: buildLots('P', LOTS_P) },
      { id: secId('N'), type: 'N', lots: buildLots('N', LOTS_N) },
    ],
    updatedAt: now,
    updatedBy: user,
  };

  // ─── 출하 객체 ──────────────────────────────────────────
  const ships = SHIPMENTS.map(sh => ({
    id: shipId(sh.name),
    shipName: sh.name,
    customer: CUSTOMER,
    date: shipDate,
    note: '',
    components: sh.comps.map(([t, lotName, refName]) => ({
      docId: DOC_ID,
      sectionId: secId(t),
      lotId: lotId(t, lotName),
      refineId: refineId(t, lotName, refName),
      qty: 0,
      unit: 'g',
      refineNameSnapshot: refName,
      lotNameSnapshot: lotName,
      sectionTypeSnapshot: t,
      docTitleSnapshot: TITLE,
      materialSnapshot: '',
    })),
    deleted: false,
    createdAt: now,
    createdBy: user,
    updatedAt: now,
    updatedBy: user,
  }));

  // ─── 충돌 검사 ─────────────────────────────────────────
  const db = firebase.database();
  console.log('🔍 충돌 검사 …');
  const docSnap = await db.ref('pn_flow_docs/' + DOC_ID).once('value');
  if (docSnap.exists()) {
    console.error(`❌ pn_flow_docs/${DOC_ID} 이미 존재. 중단. (재실행하려면 콘솔에서 해당 노드 삭제)`);
    return;
  }
  for (const sh of ships) {
    const s = await db.ref('pn_flow_shipments/' + sh.id).once('value');
    if (s.exists()) {
      console.error(`❌ pn_flow_shipments/${sh.id} 이미 존재. 중단.`);
      return;
    }
  }
  console.log('✓ 충돌 없음');

  // ─── 통계 ───────────────────────────────────────────────
  const totalLots    = doc.sections.reduce((a, s) => a + s.lots.length, 0);
  const totalRefines = doc.sections.reduce((a, s) => a + s.lots.reduce((b, l) => b + l.refines.length, 0), 0);
  const totalComps   = ships.reduce((a, s) => a + s.components.length, 0);

  console.log(`📋 등록 예정: doc 1건 (${totalLots} Lots · ${totalRefines} 정제 Batches), 출하 ${ships.length}건 (${totalComps} components)`);
  if (!confirm(`SDC 제조이력 데이터를 Firebase 에 등록하시겠습니까?\n\n- 문서 1건 (${totalLots} Lots, ${totalRefines} 정제 Batches)\n- 출하 ${ships.length}건 (${totalComps} components)\n- 출하 일자: ${shipDate || '(빈 값)'}\n- 고객: ${CUSTOMER}`)) {
    console.log('취소됨.');
    return;
  }

  // ─── 쓰기 ─────────────────────────────────────────────
  console.log('📝 문서 쓰기 …');
  await db.ref('pn_flow_docs/' + DOC_ID).set(doc);
  console.log(`✓ pn_flow_docs/${DOC_ID}`);

  console.log('📝 출하 Lot 쓰기 …');
  for (const sh of ships) {
    await db.ref('pn_flow_shipments/' + sh.id).set(sh);
    console.log(`✓ pn_flow_shipments/${sh.id} (${sh.components.length} comps)`);
  }

  console.log('🎉 완료! 15번 P/N Flow 탭에서 새 문서를 확인하세요. 출하 일자/수량은 UI 에서 추가 입력하시면 됩니다.');
})();
