/* ══════════════════════════════════════════════════════════════════════
   QAUtils — 모든 앱이 공유하는 작은 헬퍼 모음
   ──────────────────────────────────────────────────────────────────────
   • 각 앱에 흩어져 있는 esc / genId / 날짜포맷 / 숫자포맷을 통합
   • 기존 앱 코드 호환을 위해 함수 시그니처는 보수적으로 유지
   • 앱 내부에 동명 로컬 함수가 있어도 충돌 없음
     (window.QAUtils 네임스페이스 사용)
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  function pad2(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  function toDateStr(d) {
    if (!d) return '';
    var dt = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dt.getTime())) return '';
    return dt.getFullYear() + '-' + pad2(dt.getMonth() + 1) + '-' + pad2(dt.getDate());
  }

  function fmtAt(ts) {
    if (!ts) return '';
    return toDateStr(new Date(ts));
  }

  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * 숫자 표시 — 소수 N자리(기본 3)에서 반올림 후 후행 0 제거.
   * null/undefined → '-', 숫자 아님 → 원본 문자열 반환.
   */
  function fmtVal(v, dp) {
    if (v === null || v === undefined || v === '') return '-';
    var n = parseFloat(v);
    if (isNaN(n)) return String(v);
    var d = (typeof dp === 'number') ? dp : 3;
    return parseFloat(n.toFixed(d)).toString();
  }

  root.QAUtils = {
    pad2:      pad2,
    toDateStr: toDateStr,
    fmtAt:     fmtAt,
    genId:     genId,
    esc:       esc,
    fmtVal:    fmtVal
  };
})(window);
