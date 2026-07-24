# Edge 侧边栏恢复

恢复 Edge 浏览器被取消的侧边栏功能 — 基于 Edge 原生 **Side Panel API** 的浏览器级面板，网页**零遮挡**，集分屏浏览、搜索、计算器、单位换算、实时汇率、快速链接、笔记、时钟于一体的工具箱。

当前版本：**v0.2.2** ｜ [下载最新版](https://github.com/HazardSun/edge-sidebar-restore/releases/latest)

## 目录

- [功能总览](#功能总览)
- [交互方式](#交互方式)
- [工具箱明细](#工具箱明细)
- [安装](#安装)
- [架构设计](#架构设计)
- [文件结构](#文件结构)
- [权限与隐私](#权限与隐私)
- [兼容性](#兼容性)
- [版本历史](#版本历史)

## 功能总览

| 模块 | 说明 |
|---|---|
| 原生侧边栏 | `chrome.sidePanel` 实现，浏览器真正缩小视口，任何网页（fixed 导航、100vw 布局）都不被遮挡 |
| 页面快捷入口 | 网页右缘 4px 悬停细条，滑出展开按钮 + 已收藏网站 favicon，一键打开面板并直达网站 |
| 分屏浏览 | 侧边栏内嵌浏览器视图，顶栏实时显示当前网站名；对禁嵌站点自动剥离 XFO/CSP 响应头 |
| 网站图标 | 真实 favicon + 两级降级（站点 /favicon.ico → Google 服务）+ **本地缓存**，弱网/离线照常显示 |
| 新标签页 | 新标签页直接跳转 Bing 首页（普通网页，快捷入口与面板均可使用） |

## 交互方式

| 操作 | 方式 |
|---|---|
| 打开/关闭侧边栏 | 点击工具栏扩展图标 |
| 打开/关闭侧边栏 | 快捷键 `Ctrl+Shift+Y`（可在 `edge://extensions/shortcuts` 修改） |
| 打开侧边栏 | 网页右缘 4px 细条 → 悬停 → 点击 « 按钮 |
| 直达某个网站 | 悬停细条 → 点击网站 favicon（面板打开后内置浏览器直达） |
| 调整面板宽度 | 拖拽面板左边缘（浏览器原生） |
| 打开/关闭 | 右键扩展图标 → 在侧边栏中打开 |

## 工具箱明细

| 工具 | 说明 |
|---|---|
| 搜索 | Bing / Google 引擎切换；常用网站快捷访问（可增删，与"链接"页和快捷入口实时同步） |
| 计算器 | 基础四则运算、正负号、取余；支持键盘输入（数字、运算符、Enter、Esc） |
| 单位换算 | 长度、重量、温度、面积、体积、速度 6 类 25 个单位 |
| 实时汇率 | 28 种货币；USD 基准一次拉取 + 本地交叉汇率计算，切换币种零网络延迟；双数据源自动回退；本地缓存 30 分钟并显示数据日期 |
| 快速链接 | 可增删的网址收藏，真实 favicon（本地缓存）；三处（链接页/搜索页/快捷入口）实时同步 |
| 笔记 | 自动保存便签（500ms 防抖），带保存状态提示 |
| 时钟 | 实时时间、日期、时段问候语、每日备忘（自动保存） |

### 默认收藏站点

YouTube、Gemini、Bing、GitHub、ChatGPT、Wikipedia、Reddit、X。

> 说明：默认列表已剔除 Gmail / Google Drive——Google 登录体系拒绝在嵌入上下文中登录（Cookie 隔离），任何扩展都无法绕过。Gemini、ChatGPT、X 等登录型应用未登录浏览正常，嵌内登录可能被各自风控拒绝。

## 安装

1. 打开 Edge 浏览器，进入 `edge://extensions/`
2. 开启 **开发者模式**（左上角开关）
3. 点击 **加载解压缩的扩展**，选择本文件夹（或下载 [Releases](https://github.com/HazardSun/edge-sidebar-restore/releases) 中的压缩包解压后加载）
4. 建议将扩展图标固定到工具栏：扩展中心 → 本扩展 → **在工具栏中显示**

## 架构设计

### 为什么是 Side Panel 而不是注入式侧边栏？

v0.0.x 版本采用 Content Script 注入 iframe + `body margin` 让位的方案，但实测（含无头浏览器布局验证）证明：

- `position: fixed` 元素锚定视口，margin/zoom 均无法使其让位
- `zoom` 作用于根元素等效于浏览器缩放，页面会重排填满视口
- 内容脚本无法改变视口大小——只有浏览器 UI 层可以

因此 v0.2.0 起采用 `chrome.sidePanel`：面板由浏览器绘制，视口原生缩小，**从原理上杜绝遮挡**。

### 组件协作

```
┌──────────────┐  点击   ┌────────────────┐  sidePanel.open   ┌──────────────┐
│ 4px 悬停细条  │ ──────> │ background.js  │ ────────────────> │ 原生侧边栏    │
│ (content.js) │ 消息    │ (Service       │                   │ (sidebar.*)  │
└──────────────┘         │  Worker)       │                   └──────────────┘
                         └────────────────┘                          ▲
  工具栏图标 / Ctrl+Shift+Y ─────────────────────────────────────────┘
  （openPanelOnActionClick 行为，无需消息）
```

- **网站直达双通道**：点击细条上的网站图标时，若面板未打开，目标网址写入 `storage.pendingOpenUrl`，面板启动后读取并打开；若面板已打开，Service Worker 广播 `openUrl` 消息直接送达（同址去重防止双通道重复加载）。
- **数据共享**：快捷链接、笔记、汇率缓存、favicon 缓存统一存于 `chrome.storage.local`，面板、快捷入口通过 `storage.onChanged` 实时同步。

### 内嵌浏览与禁嵌头剥离（DNR）

许多站点（GitHub、Reddit、X、Bing 等）通过 `X-Frame-Options` 或 CSP `frame-ancestors` 禁止被 iframe 嵌套。本扩展通过 `declarativeNetRequest`（静态规则集 `rules.json`）**仅对这些站点的子框架请求**剥离禁嵌响应头，使内嵌浏览可用：

- 作用域严格限定在规则列出的 15 个域名 + `sub_frame` 资源类型，不影响正常标签页浏览和其他网站
- 登录型应用（Gmail 等）的嵌内登录限制属于 Cookie 隔离策略，不在响应头层面，无法通过此方式解除

### favicon 加载与缓存策略

```
站点 /favicon.ico（直连，内网也可达）
        │ 失败
        ▼
Google favicon 服务 ──成功──> 写入本地缓存（data URL，7 天有效，300 条 LRU）
        │ 失败
        ▼
首字母方块兜底
```

- 命中缓存时直接使用本地 data URL，**零网络请求**，弱网/离线照常显示；data URL 还不受页面 CSP 图片策略影响
- 内网站点的 `/favicon.ico` 走局域网直连（不受外网质量影响），保持实时加载以便图标更新即时生效
- 缓存建立在扩展页上下文，借 `google.com` host 权限跨域抓取，无需额外权限

## 文件结构

```
edge-sidebar-restore/
├── manifest.json          # 扩展配置（MV3）
├── background.js          # Service Worker：面板行为配置 + 快捷入口消息转发
├── content.js             # 页面快捷入口（4px 悬停细条，仅注入普通网页）
├── rules.json             # DNR 静态规则集：剥离指定站点 sub_frame 的禁嵌响应头
├── sidebar.html           # 侧边栏 UI（6 个工具标签页 + 内置浏览器视图）
├── sidebar.js             # 侧边栏交互逻辑（模块化：搜索/计算器/换算/汇率/链接/笔记/时钟/浏览器）
├── sidebar.css            # 侧边栏样式（深浅色主题跟随系统）
├── newtab.html            # 新标签页（仅跳转）
├── newtab.js              # 跳转至 Bing 首页
├── icons/                 # 扩展图标
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## 权限与隐私

| 权限 | 用途 |
|---|---|
| `storage` | 保存快捷链接、笔记、设置、汇率缓存、favicon 缓存（全部本地） |
| `sidePanel` | 使用原生侧边栏 |
| `declarativeNetRequestWithHostAccess` | 剥离指定站点子框架响应的禁嵌头（XFO/CSP），使内嵌浏览可用 |
| `host_permissions`（15 个域名） | 上述 DNR 规则的作用域 + favicon 抓取：google/youtube/bing/github/reddit/x/twitter/chatgpt 等默认收藏站点 |
| `content_scripts`（`<all_urls>`） | 仅在普通网页注入 4px 快捷入口细条；**不读取、不修改任何网页内容与布局** |

- **无数据收集**：不上传任何信息，所有数据（含 favicon 缓存）仅存于浏览器本地
- 汇率数据源：[fawazahmed0/currency-api](https://github.com/fawazahmed0/exchange-api)（jsDelivr CDN，主）与 [open.er-api.com](https://www.exchangerate-api.com)（备），仅在使用汇率功能时请求，结果本地缓存 30 分钟
- favicon 获取顺序：站点自身 `/favicon.ico` → Google favicon 服务，成功结果本地缓存 7 天

## 兼容性

- Microsoft Edge **114+**（需支持 Side Panel API）
- 深色/浅色主题跟随系统

## 版本历史

### v0.2.2
- favicon 本地缓存：成功获取的网站图标转为 data URL 存入本地（7 天有效、300 条 LRU），弱网/离线照常显示
- favicon 降级链升级为两级：站点 `/favicon.ico` 直连（内网站点可达）→ Google 服务 → 首字母兜底
- 4px 细条图标同步使用缓存，data URL 不受页面 CSP 影响

### v0.2.1
- 内置浏览器顶栏改为显示当前网站名（同源时升级为页面 title），关闭后恢复默认
- 收藏网址图标改用网站真实 favicon，加载失败自动回退首字母
- 新增 DNR 规则集：对 15 个默认收藏站点的子框架请求剥离 XFO/CSP 禁嵌头，YouTube/GitHub/Bing 等可内嵌打开
- 默认收藏移除 Gmail / Google Drive（Google 登录体系拒绝嵌入登录），新增 Gemini、Bing；ChatGPT 更新为 chatgpt.com

### v0.2.0
- 架构迁移至原生 **Side Panel API**，彻底消除网页遮挡（fixed / 100vw 元素均可正确让位）
- 新增页面快捷入口：右缘 4px 悬停细条（展开按钮 + 网站图标直达）
- 新增快捷键 `Ctrl+Shift+Y` 开关侧边栏
- 新标签页改为直接跳转 Bing 首页
- 汇率模块重写：USD 基准 + 本地交叉汇率（切币零延迟）、双数据源回退、30 分钟缓存、数据日期显示
- 移除注入式侧边栏全部代码（不再申请 `<all_urls>` host 权限）
- 修复搜索页与链接页默认快捷链接不一致问题

### v0.0.1
- 初始版本：注入式侧边栏、搜索、计算器、单位换算、汇率、快速链接、笔记、时钟
