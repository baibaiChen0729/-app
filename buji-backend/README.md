# 步集 BUJI · 后端

轻量后端服务，基于 Node.js + Express + SQLite，同时托管前端静态文件。

## 快速开始

```bash
# 1. 安装依赖
cd buji-backend
npm install

# 2. 配置环境变量（可选，不填也能跑）
cp .env.example .env
# 编辑 .env，填入高德 AMAP_KEY（不填则任务生成走静态降级）

# 3. 初始化数据库（首次启动必做）
npm run seed

# 4. 启动服务
npm start
# 或开发模式（文件变化自动重启）
npm run dev
```

启动后：
- 本机浏览器打开 `http://localhost:3000`
- 手机（同WiFi）打开 `http://<电脑IP>:3000`

## 目录结构

```
buji-backend/
├── server.js              Express 入口
├── db/
│   ├── database.js        SQLite 初始化 + 建表
│   └── seed.js            初始化默认数据（形状+任务模板）
├── routes/
│   ├── posts.js           POST/GET/DELETE /v1/posts
│   ├── config.js          GET /v1/config
│   └── tasks.js           GET /v1/tasks/today
├── services/
│   ├── imageStore.js      base64 图片存取
│   └── taskGenerator.js   高德POI + 模板生成任务
├── middleware/
│   └── deviceId.js        X-Device-Id 校验
├── public/                前端静态文件（把现有 HTML 放这里）
└── data/
    ├── buji.db            SQLite 数据文件（自动创建）
    └── uploads/           用户成片（自动创建）
```

## API 一览

所有 `/v1/*` 接口需带请求头 `X-Device-Id: <uuid>`。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/v1/ping` | 健康检查（无需 device id） |
| GET | `/v1/tasks/today?lat=&lng=` | 获取今日任务卡 |
| GET | `/v1/config?version=` | 获取形状配置 |
| POST | `/v1/posts` | 发布成片 `{image, caption, date}` |
| GET | `/v1/posts?page=&limit=` | 获取我的成片列表 |
| DELETE | `/v1/posts/:id` | 删除成片 |

## 前端接入步骤

**目前前端还是硬编码 + localStorage，未接入后端**。接入时改动如下：

### 1. 把前端文件放进 `public/`
```bash
cp ../buji.html ../discover-page.html ../live-template-camera.html \
   ../publish-page.html ../album-map.html public/
cp -r ../assets public/
```

### 2. 每个 HTML 里加设备 ID 初始化 + fetch 封装

```html
<script>
  // 设备 ID（首次生成，持久化到 localStorage）
  const DEVICE_ID = (() => {
    let id = localStorage.getItem('buji_device_id');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('buji_device_id', id);
    }
    return id;
  })();

  // 统一 fetch 封装
  window.api = async function(method, path, body) {
    const res = await fetch(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': DEVICE_ID,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    if (json.code !== 0) throw new Error(json.msg);
    return json.data;
  };
</script>
```

### 3. 替换4处业务调用

| 页面 | 原代码 | 改为 |
|---|---|---|
| discover-page.html | 硬编码 `TASKS` | `api('GET', '/v1/tasks/today?lat=&lng=')` |
| live-template-camera.html | 硬编码形状按钮 | `api('GET', '/v1/config')` 动态渲染 |
| publish-page.html `handleSubmit()` | `localStorage.removeItem` | `api('POST', '/v1/posts', {image, caption, date})` |
| album-map.html | 硬编码 `ITEMS/META` | `api('GET', '/v1/posts')` |

## 部署到手机

**方式一（推荐）：局域网访问 + PWA**

1. 电脑跑 `npm start`
2. 电脑防火墙允许 3000 端口
3. 手机 Safari 打开 `http://<电脑IP>:3000`
4. 「分享 → 添加到主屏幕」→ 手机桌面有图标了

**方式二：部署到云服务器**

1. 买一台便宜的 VPS
2. 装 Node.js 20+
3. `git clone` 项目
4. `npm install && npm run seed && npm start`
5. 用 `pm2` 做守护进程

## 常用命令

```bash
# 重置数据库（会清空所有成片记录！图片文件不删）
rm data/buji.db && npm run seed

# 查看数据库
sqlite3 data/buji.db
> .tables
> SELECT * FROM posts;

# 清理所有图片
rm data/uploads/*
```
