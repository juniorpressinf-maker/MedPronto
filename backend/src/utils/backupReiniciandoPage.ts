/** Pagina estatica — fallback se abrir direto na API durante restore. */
export function backupReiniciandoHtml(port = 3021) {
  const loginUrl = `http://127.0.0.1:${port}/login?restaurado=1`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Restaurando backup — MedPronto</title>
  <style>
    :root { --bg: #c5d4e8; --panel: #fff; --text: #0a0a0a; --muted: #475569; --accent: #1d4ed8; --border: #94a8c4; }
    body { margin: 0; font-family: "Segoe UI", system-ui, sans-serif; background: var(--bg); color: var(--text); }
    main { max-width: 520px; margin: 80px auto; padding: 0 16px; text-align: center; }
    .panel { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 40px 24px; box-shadow: 0 6px 20px rgba(12,22,40,.12); }
    .spinner { width: 56px; height: 56px; margin: 0 auto 20px; border: 4px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin .9s linear infinite; }
    h2 { margin: 0 0 12px; font-size: 1.25rem; }
    .muted { color: var(--muted); margin: 0 0 8px; line-height: 1.5; }
    a { color: var(--accent); }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <main>
    <div class="panel">
      <div class="spinner" aria-hidden="true"></div>
      <h2>Restaurando backup…</h2>
      <p class="muted" data-status>O servidor vai cair e voltar em alguns segundos.</p>
      <p class="muted" style="font-size:.85rem">
        Você será redirecionado automaticamente.
        Se nada acontecer, <a href="${loginUrl}">clique aqui</a>.
      </p>
    </div>
  </main>
  <script>
  (function () {
    const status = document.querySelector('[data-status]');
    const loginUrl = ${JSON.stringify(loginUrl)};
    let attempts = 0;
    const maxAttempts = 180;
    function poll() {
      attempts++;
      fetch('/api/health', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (j && j.ok) {
            if (status) status.textContent = 'Servidor voltou. Redirecionando…';
            setTimeout(function () { window.location.href = loginUrl; }, 400);
            return;
          }
          next();
        })
        .catch(next);
    }
    function next() {
      if (attempts >= maxAttempts) {
        if (status) {
          status.textContent =
            'Demorou mais que o esperado. Se a tela de login já abriu, continue por ela.';
        }
        return;
      }
      setTimeout(poll, 1000);
    }
    setTimeout(poll, 2500);
  })();
  </script>
</body>
</html>`;
}
