# Edge 侧边栏恢复

> 用原生 Side Panel API 找回 Edge 侧边栏：网页零遮挡，侧栏内完成分屏浏览、搜索、实时汇率、单位换算、快捷链接、笔记与时钟。

[![Version](https://img.shields.io/badge/version-v0.2.3-0078d4)](https://github.com/HazardSun/edge-sidebar-restore/releases/latest)
[![Edge](https://img.shields.io/badge/Microsoft%20Edge-114%2B-0f6cbd)](https://www.microsoft.com/edge)
[![Manifest](https://img.shields.io/badge/Manifest-V3-2ea44f)](manifest.json)

## 为什么使用它

旧版 Edge 侧边栏取消后，普通网页注入式方案只能覆盖页面，无法真正改变浏览器视口。本项目使用 Chromium 原生 `chrome.sidePanel`：打开侧栏时网页可用宽度由浏览器自动调整，`position: fixed`、`100vw` 等布局也不会被遮住。

- 原生侧栏，不覆盖网页内容
- 网页右缘 4px 悬停入口，随时展开
- 收藏网站可直接在侧栏打开
- 网站 favicon 首次成功获取后永久保存在本地
- 汇率每分钟自动刷新，离线时继续使用最近缓存
- 无账号、无遥测、无数据上传

## 功能

| 模块 | 功能 |
| --- | --- |
| 分屏浏览 | 在侧栏内打开网页，支持后退、前进、刷新和转到普通标签页 |
| 快捷入口 | 网页右缘 4px 细条，悬停后显示侧栏按钮和收藏网站图标 |
| 搜索 | Bing / Google 切换，搜索结果直接在侧栏打开 |
| 快速链接 | 收藏可增删，并在搜索页、链接页和网页快捷入口之间实时同步 |
| 网站图标 | 读取网页 `link rel="icon"` 与浏览器 favicon，自动降级并永久缓存 |
| 实时汇率 | 28 种货币，以 Coinbase 当前汇率为主源，每分钟刷新，双备用源自动回退 |
| 单位换算 | 49 个单位，覆盖长度、重量、温度、面积、体积和速度 |
| 计算器 | 四则运算、正负号、取余和键盘输入 |
| 笔记 | 500ms 防抖自动保存，显示保存状态 |
| 时钟 | 实时时间、日期、问候语和今日备忘 |
| 新标签页 | 将新标签页跳转到 Bing 普通网页，使快捷入口保持可用 |

### 中美英单位换算

重量、面积和体积中的同名单位会明确标注制度，避免把美制与英制数值混用。

- 中国市制：市斤、两、钱、亩、分、平方市尺
- 美制：短吨、液量加仑、液量夸脱、液量品脱、杯、液量盎司
- 英制：英石、长吨、加仑、夸脱、品脱、液量盎司
- 通用：公吨、千克、克、毫克、公顷、平方米、平方英尺、英亩、升、毫升等

## 安装

### 从 Release 安装

1. 打开 [Releases](https://github.com/HazardSun/edge-sidebar-restore/releases/latest)，下载 `edge-sidebar-restore-v0.2.3.zip`。
2. 解压 ZIP。
3. 在 Edge 地址栏打开 `edge://extensions/`。
4. 开启左侧的“开发人员模式”。
5. 点击“加载解压缩的扩展”，选择解压后的目录。
6. 建议在扩展菜单中将“Edge 侧边栏恢复”固定到工具栏。

### 从源码安装

```bash
git clone https://github.com/HazardSun/edge-sidebar-restore.git
```

然后在 `edge://extensions/` 中选择仓库根目录作为解压缩扩展加载。

## 使用

| 操作 | 方法 |
| --- | --- |
| 打开或关闭侧栏 | 点击工具栏扩展图标 |
| 快捷键打开 | `Ctrl+Shift+Y`，可在 `edge://extensions/shortcuts` 修改 |
| 从网页打开 | 悬停网页右缘 4px 细条，点击 `«` |
| 直达收藏网站 | 展开右缘细条，点击网站图标 |
| 调整侧栏宽度 | 拖动 Edge 原生侧栏的左边缘 |
| 在标签页打开当前网站 | 点击侧栏浏览器工具栏中的外部打开按钮 |

## 网站图标策略

```text
网页声明的 link rel="icon"
          ↓
Chromium Favicon API（自动排除默认占位图）
          ↓
站点 /favicon.ico
          ↓
Google favicon 服务
          ↓
网站名称首字母
```

图标成功获取后会转换为 data URL，永久保存在 `chrome.storage.local`。此后直接读取本地数据，不再按 7 天过期；只有缓存格式升级或用户清除扩展数据时才会重建。动态修改 favicon 的网页也会被自动识别。

## 汇率策略

- 主数据源：[Coinbase Exchange Rates](https://docs.cdp.coinbase.com/coinbase-app/track-apis/exchange-rates)
- 备用数据源：fawazahmed0 currency-api、ExchangeRate-API
- 侧栏可见时每 60 秒刷新一次
- 恢复联网或重新显示侧栏时立即刷新
- 以 USD 为桥在本地计算交叉汇率，切换币种无需再次请求网络
- 请求失败时继续显示最近一次成功缓存的结果

> 汇率仅供日常参考，不构成交易、结算或投资依据。

## 架构

```text
网页右缘快捷入口 (content.js)
              │ runtime message
              ▼
Service Worker (background.js) ── chrome.sidePanel.open
              │
              ▼
原生侧栏 (sidebar.html / sidebar.js / sidebar.css)
              │
              ├── chrome.storage.local：链接、笔记、汇率、favicon
              └── iframe + DNR：侧栏分屏浏览
```

- `content.js` 只注入右缘快捷入口，并读取当前页面公开的 favicon 声明。
- `background.js` 负责 Side Panel 行为及快捷入口消息转发。
- `sidebar.js` 包含搜索、计算器、换算、汇率、链接、笔记、时钟与浏览器逻辑。
- `rules.json` 仅对指定域名的 `sub_frame` 请求移除 XFO/CSP 禁嵌响应头。

## 项目结构

```text
edge-sidebar-restore/
├── manifest.json
├── background.js
├── content.js
├── rules.json
├── sidebar.html
├── sidebar.js
├── sidebar.css
├── newtab.html
├── newtab.js
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## 权限与隐私

| 权限 | 用途 |
| --- | --- |
| `storage` | 在浏览器本地保存收藏、笔记、汇率和 favicon 缓存 |
| `sidePanel` | 使用 Edge / Chromium 原生侧栏 |
| `favicon` | 读取浏览器保存的网站图标 |
| `declarativeNetRequestWithHostAccess` | 为指定站点的侧栏子框架移除禁嵌响应头 |
| `content_scripts` / `<all_urls>` | 在普通网页注入 4px 快捷入口并读取 favicon 声明 |

本扩展不收集、不统计、不上传浏览记录、笔记、收藏或其他个人数据。所有用户数据都保存在浏览器本地。网络请求仅用于用户打开的网站、favicon 获取和汇率刷新。

## 兼容性与限制

- Microsoft Edge 114+，需要 Manifest V3 与 Side Panel API。
- 深色和浅色主题跟随系统设置。
- 部分网站即使移除 XFO/CSP，仍会因第三方 Cookie、登录风控或页面自身逻辑拒绝在 iframe 中登录。
- Gmail、Google Drive 等 Google 登录应用不适合作为嵌入式登录页面，因此未加入默认收藏。
- 网站若没有公开 favicon，最终会显示名称首字母。

## v0.2.3 更新内容

- 使用网页声明与 Chromium Favicon API 获取真实网站图标，拒绝默认占位图。
- favicon 首次成功后永久缓存，并迁移旧版 7 天缓存。
- 汇率主源改为 Coinbase 当前汇率，每分钟自动刷新，保留双数据源回退。
- 单位换算扩展到 49 个单位，补充常见中国市制、美制和英制重量、面积、体积单位。
- 修复快捷入口网址传递竞态、收藏同步、计算器快捷键干扰输入框、模零错误和小数精度问题。
- 加强收藏 URL 校验与转义。

完整历史请查看 [Releases](https://github.com/HazardSun/edge-sidebar-restore/releases)。

## 反馈

如遇到无法嵌入的网站、图标错误或换算问题，请提交 [Issue](https://github.com/HazardSun/edge-sidebar-restore/issues)，并附上 Edge 版本、目标网址和复现步骤。
