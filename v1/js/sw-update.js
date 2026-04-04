// Auto-update: detecta nova versao do service worker e recarrega automaticamente
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(reg => {
    // Checar update a cada 10 minutos
    setInterval(() => reg.update(), 600000);

    reg.addEventListener('updatefound', () => {
      const newSW = reg.installing;
      if (!newSW) return;

      newSW.addEventListener('statechange', () => {
        if (newSW.state === 'activated' && navigator.serviceWorker.controller) {
          showUpdateToast();
        }
      });
    });
  });

  // Quando o novo SW assume, recarrega a pagina
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

function showUpdateToast() {
  var t = document.createElement('div');
  t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);padding:12px 20px;border-radius:12px;background:#1a5c2a;color:#fff;font-size:13px;font-weight:600;font-family:Inter,sans-serif;z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,0.5);';
  t.textContent = 'Atualizando...';
  document.body.appendChild(t);
}
