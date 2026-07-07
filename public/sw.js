// ══════════════════════════════════════════════════════════
//  步集 BUJI — Service Worker
//  策略：静态壳资源 network-first（开发期改动立即生效，缓存仅离线兜底）；
//        GET API network-only；POST/PUT/DELETE 完全不拦截。
// ══════════════════════════════════════════════════════════

const CACHE = 'buji-v23';

// 安装时预缓存所有前端壳资源
const PRECACHE = [
  '/',
  '/buji.html',
  '/discover-page.html',
  '/live-template-camera.html',
  '/publish-page.html',
  '/album-map.html',
  '/assets/api.js',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  // 清理旧版本 cache
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // ★ 非 GET 请求（POST/PUT/DELETE 等）：SW 完全不拦截，让浏览器直接走网络。
  //   原因：iOS Safari SW context 转发带 body 的 POST 请求时会触发
  //   "FetchEvent.respondWith received an error: TypeError: Load failed"，
  //   导致发布接口（/v1/posts）调用失败。不调用 e.respondWith() 即可绕过。
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // GET API 请求 + 已上传图片：走网络（不缓存动态数据）
  if (url.pathname.startsWith('/v1/') || url.pathname.startsWith('/uploads/')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // GET 静态资源：network-first（每次取最新，改动立即生效），网络失败才用缓存兜底
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }).catch(() => caches.match(e.request).then(c => c || caches.match('/')))
  );
});
