// ══════════════════════════════════════════════════════════
// 步集 BUJI · 前端 API 工具（所有页面共用）
//
// 提供：
//   window.BUJI_DEVICE_ID  ← 设备唯一ID（首次生成，localStorage持久化）
//   window.api(method, path, body?)  ← fetch 封装，自动带请求头
//
// 使用：
//   <script src="assets/api.js"></script>
//   const posts = await api('GET', '/v1/posts');
//   await api('POST', '/v1/posts', { image, caption, date });
// ══════════════════════════════════════════════════════════

(function () {
  // ── 设备 ID（无账号 App 的唯一身份）─────────────
  const KEY = 'buji_device_id';
  let id = null;
  try { id = localStorage.getItem(KEY); } catch (e) {}
  if (!id) {
    // crypto.randomUUID 兼容性好；不支持时降级到时间戳随机
    id = (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'dev-' + Math.random().toString(36).slice(2, 12) + '-' + Date.now().toString(36);
    try { localStorage.setItem(KEY, id); } catch (e) {}
  }
  window.BUJI_DEVICE_ID = id;

  // ── API 根地址（默认同源，可通过 window.BUJI_API_BASE 覆盖）──
  const BASE = window.BUJI_API_BASE || '';

  // ── 统一 fetch 封装 ──────────────────────────────
  window.api = async function (method, path, body) {
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': id,
      },
    };
    if (body != null) opts.body = JSON.stringify(body);

    let res;
    try {
      res = await fetch(BASE + path, opts);
    } catch (e) {
      throw new Error('网络错误: ' + e.message);
    }
    let json;
    try {
      json = await res.json();
    } catch (e) {
      throw new Error('HTTP ' + res.status + ' 响应非 JSON');
    }
    if (json.code !== 0) {
      throw new Error(json.msg || ('API 错误 code=' + json.code));
    }
    return json.data;
  };
})();
