/* ══════════════════════════════════════════════════════════════════════
   테마 동기화 — 모든 앱이 공유하는 라이트/다크 토글
   ──────────────────────────────────────────────────────────────────────
   • localStorage('qa_theme')에 사용자 선택 저장
   • postMessage({ type: 'setTheme', theme: 'dark'|'light' }) 수신 시 적용
   • 기본값은 앱마다 다를 수 있음 → window.QA_THEME_DEFAULT 로 지정
     (ex. 16/17번은 'light', 나머지는 'dark')
   • 이 스크립트는 즉시 실행. data-theme 속성을 <html>에 부여.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('qa_theme', theme); } catch (e) { /* private mode */ }
  }

  var fallback = (window.QA_THEME_DEFAULT === 'light') ? 'light' : 'dark';
  var saved;
  try { saved = localStorage.getItem('qa_theme'); } catch (e) { saved = null; }

  applyTheme(saved || fallback);

  window.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'setTheme' && (e.data.theme === 'dark' || e.data.theme === 'light')) {
      applyTheme(e.data.theme);
    }
  });

  // 다른 코드(앱 내부)가 직접 테마를 바꿀 수 있도록 노출
  window.QA_setTheme = applyTheme;
})();
