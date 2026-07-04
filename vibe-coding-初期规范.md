# Vibe Coding 初期规范

> 面向「从 0 到 1 快速开发一个 App / 原型」的初期决策与避坑清单。
> 目标：在确定想法、进入开发阶段时能直接复用，减少返工。
>
> 沉淀来源：「步集 BUJI」App 从纯前端原型 → 前后端分离 → 真机预览的完整迭代过程。

---

## 一、技术栈选择：先判断是否需要后端

拿到需求后，**第一步不是写代码，而是判断要不要后端介入**。可以先问自己 / 用户几个问题：

1. 需不需要联网 / 多设备同步 / 数据持久化？
2. 后续有没有持续的视觉打磨、功能迭代计划？
3. 业务逻辑是单一功能，还是多个功能点交织？
4. 视觉元素是简单还是丰富（丰富时前端交互逻辑会急剧变复杂）？
5. 需不需要热更新（不发版就能改内容 / 配置）？

### ✅ 纯前端即可

- 不需要联网
- 对视觉要求低，无后续 UI / 前端迭代需求
- 功能简单（如记事本），不需要热更新
- 视觉元素少（元素一多，前端逻辑 + 交互逻辑会非常复杂）

### 🔀 需要前后端分离

- **有迭代需求**：前期只想做初步 demo，但后期计划做得更美观完整 → 后端处理业务逻辑，前端专注包装 / 呈现
- **业务逻辑复杂**：功能点多、彼此关联 → 需要后端支撑；单一记录功能则纯前端也够

### 案例：步集 App 的前后端划分

| 功能点 | 归属 | 原因 |
|--------|------|------|
| 任务收集 + 分发成简短文案 | 后端 | 涉及数据 / 生成逻辑，需热更新 |
| 波点相机合成器 | 前端 | 实时 canvas 渲染、依赖摄像头，必须在端上 |
| 成片存储 / 相册数据 | 后端 | 持久化 + 多端一致 |
| 相册地图展示逻辑 | 前端 | 纯交互 / 视觉，数据来自后端 |

> **经验法则**：「实时渲染 / 设备能力」放前端，「数据 / 业务规则 / 需要热更新的内容」放后端。

---

## 二、手机真机预览（最大的坑：HTTPS 自签名证书）

### 为什么一定要真机预览

网页预览（PC 浏览器缩放模拟手机）**始终差一点**：真实触摸手感、相机、传感器、安全区、性能都测不准。搬到真机才能暴露真实问题——但代价是要解决 HTTPS / 证书 / 局域网访问这些环境问题。

### 🔑 证书踩坑的准确总结

真机上相机（`getUserMedia`）需要**安全上下文**，手机用局域网 IP 访问就必须 HTTPS，于是要自签名证书。这里踩了一个坑，分两版：

#### ❌ 第一版（失败）：单张自签名叶证书

用 `openssl req -x509` 直接生成一张自签名证书：

- 它是一张 **叶证书 / 服务器证书（end-entity）**，**不是 CA 证书**
- 即使 SAN 里正确写了 IP，把它装进手机后，**iOS 的「证书信任设置」里根本不显示它**，也就无法开启「完全信任」
- 结果：页面能靠"仍然访问"勉强打开，但**所有 `fetch()` 请求全部 `Load failed`**（浏览器对未受信任证书的 XHR/fetch 校验更严格，无法绕过）

#### ✅ 第二版（正确）：两级证书结构（根 CA + 服务器证书）

- **根 CA 证书**：带 `basicConstraints = critical, CA:TRUE` —— 只有 CA 证书才能出现在 iOS「证书信任设置」并被开启完全信任
- **服务器证书**：用根 CA 签发，带 SAN（访问用的 IP）+ `extendedKeyUsage = serverAuth`
- 服务器（server.js）用 `服务器证书 + 根CA` 的 **fullchain** 作为 cert
- **手机只需安装并完全信任「根 CA」**；之后服务器证书由这个可信根签发，TLS 校验自然通过

> **一句话结论**：手机能直观预览的关键，是 **安装并信任一张「根 CA 证书」（CA:TRUE），再用它签发带正确 IP 的服务器证书**。直接把一张服务器叶证书塞给手机是行不通的。

#### 参考命令（两级证书生成）

```bash
# ca.cnf
# [req] distinguished_name=dn; prompt=no
# [dn] CN = XXX Local CA
# [v3_ca] basicConstraints=critical,CA:TRUE; keyUsage=critical,keyCertSign,cRLSign

# server.cnf
# [req] distinguished_name=dn; prompt=no
# [dn] CN = xxx-local
# [v3_req] basicConstraints=CA:FALSE; keyUsage=critical,digitalSignature,keyEncipherment;
#          extendedKeyUsage=serverAuth; subjectAltName=@alt
# [alt] IP.1=<局域网IP>; IP.2=127.0.0.1; DNS.1=localhost

# 1) 根 CA
openssl req -x509 -newkey rsa:2048 -nodes -keyout ca-key.pem -out ca-cert.pem -days 3650 -config ca.cnf -extensions v3_ca
# 2) 服务器私钥 + CSR
openssl req -newkey rsa:2048 -nodes -keyout key.pem -out server.csr -config server.cnf
# 3) 用根 CA 签发服务器证书（有效期 <825 天）
openssl x509 -req -in server.csr -CA ca-cert.pem -CAkey ca-key.pem -CAcreateserial -out server-cert.pem -days 820 -extfile server.cnf -extensions v3_req
# 4) fullchain 给服务器用
cat server-cert.pem ca-cert.pem > cert.pem
# 5) 根 CA 转 DER，给手机安装
openssl x509 -in ca-cert.pem -outform der -out ca-cert.cer
```

### iOS 证书的硬性要求

1. 必须是 **CA 证书（CA:TRUE）** 才能被「完全信任」
2. 必须有 **SAN** 且包含访问用的 IP（iOS 13+ 忽略 CN，只认 SAN）
3. 服务器证书有效期 **≤ 825 天**（iOS 13+ 强制）
4. 服务器证书需 `extendedKeyUsage = serverAuth`

### iOS 端安装的三步（缺一不可）

1. **下载**：证书要通过 **HTTP 端口**提供下载（此时 HTTPS 还没被信任，鸡生蛋）。用 **DER 格式（.cer）** + 响应头 `Content-Type: application/x-x509-ca-cert`，iOS 才会识别为可安装的描述文件
2. **安装描述文件**：设置 → 通用 → VPN与设备管理 →（已下载的描述文件）→ 安装（**下载 ≠ 安装，这步最容易漏**）
3. **开启完全信任**：设置 → 通用 → 关于本机 → 证书信任设置 → 打开对应根证书开关

---

## 三、从 0 到 1 开发的其他通用坑

以下都是实际踩到、下次新开一个 App 大概率还会遇到的：

### 1. Service Worker 缓存（PWA）

- SW 会缓存 HTML/JS/CSS，**改了代码但手机拿到旧版本**是高频困惑源
- 对策：改动后 **bump `CACHE` 版本号**；或**开发期直接禁用 SW**，上线前再启用

### 2. Service Worker 不能转发 POST

- iOS Safari 的 SW 转发**带 body 的 POST** 会报 `FetchEvent.respondWith ... Load failed`
- 对策：fetch 事件开头 `if (e.request.method !== 'GET') return;`，让非 GET 请求完全绕过 SW

### 3. 图片上传体积（canvas 导出）

- 高 DPR 手机上 `canvas.toDataURL('image/png')` 生成的 base64 可达 **8–15MB**，超 body 上限且传输失败
- 对策：改用 **JPEG + 质量参数**（`toDataURL('image/jpeg', 0.82)`），体积降到几百 KB

### 4. iframe 嵌套的等比缩放

- 设计稿固定尺寸（如 430×932）嵌进 iframe，绝对定位元素会被裁切
- 对策：JS 计算 `scale = min(iframeW/designW, iframeH/designH)`，配合 `transform-origin: top center` 等比缩放

### 5. CSS `!important` 压制 inline style

- CSS `transform: scale(1) !important` 会盖过 JS 的 `element.style.transform`（无 important）
- 对策：JS 用 `element.style.setProperty('transform', value, 'important')`

### 6. 预加载 iframe 的数据刷新

- 容器预加载的 iframe（如相册页）数据只在**首次加载**拉取；产生新数据后滑过去看到的是旧数据
- 对策：操作完成后由容器 `postMessage('refresh')` 通知 iframe 重新拉取

### 7. iframe 相机权限

- iframe 内 `getUserMedia` 需要父级显式 `allow="camera; microphone; geolocation"`，否则被静默拦截

### 8. 数据量边界要在初期就设计

- 同一个展示模块，**0 / 1 / 少量 / 大量** 数据往往需要不同呈现（如相册：1 张单图 / 2–3 张卡片 / ≥4 张地图）
- 初期就把边界情况纳入设计，避免后期改交互伤筋动骨

### 9. 减少"中间步骤"页

- 能靠系统能力一步完成的，别自己加中间页（如相机授权：直接触发系统弹窗，别做"点击开启相机"的自定义中间页）

---

## 附：本次迭代问题速查表

| 现象 | 根因 | 解法 |
|------|------|------|
| 手机 fetch 全部 `Load failed` | 自签名**叶证书** iOS 不认，信任设置里不显示 | 改用**根 CA + 服务器证书**两级结构，手机信任根 CA |
| `FetchEvent.respondWith ... Load failed` | SW 转发带 body 的 POST 失败 | 非 GET 请求不拦截（`method !== 'GET' → return`） |
| 发布网络错误 / body 过大 | PNG 全屏图 base64 8–15MB 超限 | 改 JPEG 0.82 压缩 |
| 相机快门被裁切 | CSS `!important` 压制 JS inline scale | `setProperty(..., 'important')` |
| 页面按钮被 iframe 裁切 | 固定设计稿未等比缩放 | JS `fitShellToIframe` 等比 scale |
| 相册看不到新发布的图 | 预加载 iframe 未刷新 | 发布后 `postMessage('refresh')` 重拉 |
| 改了代码手机没生效 | SW 缓存旧资源 | bump `CACHE` 版本号 |

---

*文档状态：初版（真机预览 + 前后端选型阶段沉淀）。待 UI 稿还原后继续补充，再整理为可复用 Skill。*
