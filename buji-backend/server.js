// ══════════════════════════════════════════
// 步集 BUJI · 后端入口
//   ① Express Web 服务（HTTP 3000 + HTTPS 3443）
//   ② 同时托管前端静态文件（public/）
//   ③ 挂载 /v1/* API 路由
// ══════════════════════════════════════════

require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const https   = require('https');

const deviceIdMw = require('./middleware/deviceId');
const postsRouter = require('./routes/posts');
const configRouter = require('./routes/config');
const tasksRouter = require('./routes/tasks');
const { UPLOADS_DIR } = require('./services/imageStore');

const app = express();
const PORT = parseInt(process.env.PORT) || 3000;

// ── 基础中间件 ──────────────────────────────────
app.use(cors());                              // 允许跨域（开发期方便）
app.use(express.json({ limit: '10mb' }));     // 图片是 base64，body 可能较大
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 简单请求日志
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${req.method} ${req.url}`);
  next();
});

// ── 证书下载（手机安装信任用；走 HTTP 端口 3000，无需先信任证书）──
//   iOS: Safari 打开 http://<IP>:3000/buji-cert.cer → 下载描述文件 → 安装 → 信任
app.get('/buji-cert.cer', (_req, res) => {
  res.setHeader('Content-Type', 'application/x-x509-ca-cert');
  res.setHeader('Content-Disposition', 'attachment; filename="buji-local.cer"');
  res.sendFile(path.join(__dirname, 'public', 'buji-cert.cer'));
});

// ── 静态资源 ────────────────────────────────────
// ① 用户上传的图片（成片）
app.use('/uploads', express.static(UPLOADS_DIR, {
  maxAge: '7d',   // 允许浏览器缓存
}));

// ② 前端静态文件（把现有 HTML/JS/CSS 放到 public/ 即可）
const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  console.log('[server] 前端静态文件目录:', publicDir);
} else {
  console.warn('[server] ⚠ public/ 目录不存在，前端未托管');
}

// ── API 路由 ────────────────────────────────────
// 健康检查（无需 device id）
app.get('/v1/ping', (_req, res) => {
  res.json({ code: 0, msg: 'pong', data: { time: Date.now() } });
});

// 业务接口（都需要 X-Device-Id）
app.use('/v1/posts',  deviceIdMw, postsRouter);
app.use('/v1/config', deviceIdMw, configRouter);
app.use('/v1/tasks',  deviceIdMw, tasksRouter);

// 404
app.use('/v1/*', (_req, res) => {
  res.status(404).json({ code: 404, msg: 'api not found', data: null });
});

// 首页兜底：默认打开 buji.html
app.get('/', (_req, res) => {
  const bujiPath = path.join(publicDir, 'buji.html');
  if (fs.existsSync(bujiPath)) return res.sendFile(bujiPath);
  res.send('步集 BUJI 后端运行中。请把前端文件放到 public/ 目录。');
});

// 全局错误
app.use((err, _req, res, _next) => {
  console.error('[server] error:', err);
  res.status(500).json({ code: 500, msg: err.message || 'internal error', data: null });
});

// ── 启动 HTTP ──────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[HTTP]  http://localhost:${PORT}`);
});

// ── 启动 HTTPS（摄像头 / 传感器 API 需要安全上下文）──
const HTTPS_PORT = parseInt(process.env.HTTPS_PORT) || 3443;
const certPath = path.join(__dirname, 'cert.pem');
const keyPath  = path.join(__dirname, 'key.pem');

if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  const httpsServer = https.createServer(
    { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) },
    app
  );
  httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
    // 尝试获取本机局域网 IP，方便直接打印
    let localIp = '你的IP';
    try {
      const os = require('os');
      const ifaces = os.networkInterfaces();
      for (const iface of Object.values(ifaces)) {
        for (const info of iface) {
          if (info.family === 'IPv4' && !info.internal) { localIp = info.address; break; }
        }
        if (localIp !== '你的IP') break;
      }
    } catch (_) {}

    console.log('\n════════════════════════════════════════');
    console.log('  步集 BUJI 已启动');
    console.log(`  电脑浏览器:   http://localhost:${PORT}`);
    console.log(`  手机（相机）: https://${localIp}:${HTTPS_PORT}`);
    console.log('  ⚠  首次访问 HTTPS 地址时，Safari 会提示"不受信任"');
    console.log('     点击"显示详细信息" → "仍然访问该网站" 即可');
    console.log(`  高德地图:     ${process.env.AMAP_KEY ? '已配置' : '未配置（任务走静态降级）'}`);
    console.log('════════════════════════════════════════\n');
  });
} else {
  console.log('\n════════════════════════════════════════');
  console.log('  步集 BUJI 已启动（仅 HTTP）');
  console.log(`  http://localhost:${PORT}`);
  console.log('  ⚠  未找到 cert.pem/key.pem，相机功能在手机上不可用');
  console.log('  运行 `node generate-icons.js` 可重新生成图标');
  console.log('════════════════════════════════════════\n');
}
