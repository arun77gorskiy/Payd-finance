const SW_NAME = 'payd-injector';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.pathname.endsWith('/trading-lab.html') || url.pathname === '/trading-lab.html') {
    e.respondWith((async () => {
      const res = await fetch(e.request);
      let html = await res.text();
      const injection = '<script src="js/CoreAnalysisEngine.js"></script>';
      if (!html.includes('CoreAnalysisEngine.js')) {
        html = html.replace('<script src="js/MarketAnalysisEngine.js"></script>', injection + '\n    <script src="js/MarketAnalysisEngine.js"></script>');
      }
      return new Response(html, { headers: { ...Object.fromEntries(res.headers), 'Content-Type': 'text/html; charset=utf-8' } });
    })());
  }
});
