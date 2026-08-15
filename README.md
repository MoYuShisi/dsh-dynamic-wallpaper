# dsh-dynamic-wallpaper

DSH (DeepSeek Harness) web-client plugin: 自定义动态壁纸 + 字体美化。

在 DSH 网页界面的 **设置 → 通用** 面板新增两个配置区域（同一个插件）：

- **动态壁纸**：静态图片（支持多图轮换）/ GIF / 视频壁纸，上传本地文件，全屏开关，透明度 / 模糊 / 播放速度。
- **字体**：字号缩放（界面缩放 80%–150%）、主/辅文字颜色、5 色标渐变文字 + 方向（上到下 / 左到右 / 斜向）。

## 功能特性

- 在 **设置 → 通用** 面板新增两个配置区域（同一个插件、注册两个设置行）：
  - **动态壁纸**：类型/上传/轮换/透明度/模糊/速度；
  - **字体**：字号缩放（界面缩放 80%–150%）、主/辅文字颜色、5 色渐变文字（与壁纸开关无关）。
- **类型选择与上传相互独立**：先选类型再上传、或先上传再选类型均可；上传按文件种类自动归位（图片→多图列表，GIF/视频→动图/视频槽）。
- **「确定更换」按钮**（两个区域各自有）：除**开关**外，所有调整先进入草稿，点击后才真正生效并持久化（开关立即生效，不用等确定更换）。
- 静态图片支持**多图上传**：可上传多张，支持**轮换模式**（开关、间隔时间 1–120s、顺序/随机），列表可上移/下移/移除。
- 本地文件上传（jpg / png / webp / gif / mp4），文件仅保存在浏览器本地（小文件内联 data URL，大文件存入 IndexedDB，localStorage 只存配置避免配额溢出），不上传任何服务器。
- 壁纸层固定于页面最底层（`z-index: 0`，`pointer-events: none`）。**开关关闭会清空当前壁纸**（下次开启需重新上传）；**全屏壁纸**开关：开启=侧边栏与对话区都显示壁纸，关闭=壁纸只在对话区显示（侧边栏保持不透明）。
- 全部设置持久化在 `localStorage`（key `dsh.dynamic-wallpaper` 与 `dsh.dynamic-wallpaper.font`），刷新页面 / 重启客户端自动恢复。
- 透明度（0–100）、高斯模糊（0–20px）、播放速度（0.5×–2×，视频生效）。
- 字体：**字号缩放**（界面整体缩放，**设置弹窗保持 100% 不缩放**）、**主文字色 / 辅助文字色**可自定义；**渐变文字**支持**5 个色标**渐变 + 方向（上到下 / 左到右 / 斜向），整页共用同一渐变（`background-attachment: fixed`），仅作用于文字、不破坏气泡与面板背景。

## 兼容性

- **网页端**（浏览器访问 `http://127.0.0.1:3080`）：已实测可用。
- **桌面端（Electron）**：插件只使用标准浏览器 API（DOM / localStorage / IndexedDB / `<video>` / `<img>` / CSS），不碰宿主进程；只要桌面壳走 DSH 官方的客户端插件加载机制（`/plugins/<id>/client.js`）即可运行（未实测，理论可行）。

## 目录结构

```
dsh-dynamic-wallpaper/
├── package.json              # 包清单 + dsh.client 声明（浏览器 bundle 路由）
├── tsconfig.json             # 编辑器/类型检查（可选）
├── tsdown.config.ts          # 基于 DSH clientBundle 预设的双半构建
├── cordis.yml                # 便捷 patch：插入插件行（安装方法二）
├── README.md
└── src/
    ├── index.ts              # 宿主半：空 apply（保证 Loader 行激活）
    └── client/               # 浏览器半（被打包成 /plugins/dsh-dynamic-wallpaper/client.js）
        ├── index.ts          # 客户端 apply：装配 controller + 壁纸层 + 两个设置行
        ├── controller.ts     # 壁纸/字体两组设置状态、localStorage 持久化、文件负载生命周期
        ├── blob-store.ts     # IndexedDB 大文件存储
        ├── wallpaper-layer.ts# 固定底层 DOM 层 + 多图轮换/视频/GIF 渲染 + 字体样式应用
        ├── WallpaperRow.tsx  # 「动态壁纸」设置行（React）
        ├── FontRow.tsx       # 「字体」设置行：字号缩放/文字颜色/渐变（React）
        ├── WallpaperRow.module.css
        └── locales.ts        # zh/en 文案
```

## 工作原理（DSH 客户端插件机制）

DSH 的 Web UI 是 Cordis 插件树：宿主 Loader 的每个 entry 若在 `package.json`
里声明了 `dsh.client.platform: 'web'` 并导出 `exports["./client"]` 构建产物，
`dsh-client-modules` 就会把它放进 `window.__DSH_BOOT__` 并在
`/plugins/<id>/client.js` 提供 bundle；浏览器 shell 启动时按该清单加载并执行
客户端 half。本插件因此是「双面」包：

- 宿主半 `lib/index.js`：空 `apply`，只为了让该行成为活跃 entry（否则
  client-modules 不会服务其 bundle），完全不碰宿主。
- 浏览器半 `lib/client.js`：挂壁纸层、注册设置行。它只 import 平台模块表
  里的外部依赖（react、`@deepseek-ai/dsh-client-ui-slots` 等），通过
  `ctx.slots.inject('settings.general.item', …)` 等待并注册进通用设置区。

壁纸分层：插件注入一条全局样式 —— `#dsh-dynamic-wallpaper` 固定于
`z-index: 0`、`pointer-events: none`；`#root` 提升为 `position: relative;
z-index: 1`；启用壁纸时把 `--dsw-alias-bg-base` 置为透明（对话区透出壁纸），
全屏模式下再叠加 `--dsw-specific-sidebar-fill` 透明（侧边栏透出壁纸），而
消息气泡、工具卡片仍保留不透明填充（文字颜色/渐变覆盖通过 body 内联变量
生效）。停用 / 卸载时全部还原。

## 安装

> 前置：DSH 已按 run-from-source 方式就绪（`pnpm install` 过）。下文把 DSH
> 源码检出目录记为 `$REPO`（例如 `C:\deepseek-harness\deepseek-harness`），
> DSH 用户主目录记为 `$DSH_HOME`（默认 `~/.dsh`，Windows 为
> `%USERPROFILE%\.dsh`）。

### 第一步：把插件放进 DSH 检出目录并构建

插件构建需要 DSH 检出的 `node_modules`（tsdown、react、`@deepseek-ai/*`
workspace 包），因此源码目录放在检出树内（与官方 scratch-plugin 教程一致），
只**新增**目录、不改动任何原有文件：

```powershell
# 1. 把本目录复制进检出树（以下以 scratch-plugins 为例）
mkdir $REPO\scratch-plugins
Copy-Item -Recurse dsh-dynamic-wallpaper $REPO\scratch-plugins\

# 2. 在检出根目录执行一次构建，生成 lib/index.js 与 lib/client.js
cd $REPO
pnpm exec tsdown -c scratch-plugins/dsh-dynamic-wallpaper/tsdown.config.ts

# （可选）类型检查
pnpm exec tsc --noEmit -p scratch-plugins/dsh-dynamic-wallpaper/tsconfig.json
```

构建产物：

- `scratch-plugins/dsh-dynamic-wallpaper/lib/index.js`（宿主半）
- `scratch-plugins/dsh-dynamic-wallpaper/lib/client.js`（浏览器半）

> 提示：也可以把插件做成真正的 workspace 包（放 `packages/client/ui-dynamic-wallpaper`
> 并在 `pnpm-workspace.yaml` 已覆盖的 `packages/*/*` 下），随后
> `pnpm install` 一次，再 `pnpm --filter dsh-dynamic-wallpaper bundle`。
> 这样 `pnpm run dev:web` 的热重载（HMR）也能直接重建它。

### 第二步：把插件注册进 web profile（不改动 DSH 源码）

DSH 的「插件安装」机制是 profile：`$DSH_HOME/profiles/web/` 下的
`package.json` 声明 out-of-tree 依赖，`cordis.patch.yml` 是用户 patch 层。
这些文件属于用户配置，不属于 DSH 源码。

1. 加入依赖（把 `<插件绝对路径>` 换成第一步复制后的完整路径）：

```powershell
cd $DSH_HOME\profiles\web
pnpm add dsh-dynamic-wallpaper@file:<插件绝对路径>
```

   或者直接编辑该目录下的 `package.json`：

```jsonc
{
  "name": "dsh-profile-web",
  "private": true,
  "dependencies": {
    "dsh-dynamic-wallpaper": "file:<插件绝对路径>"
  },
  "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"] } }
}
```

   然后在该目录执行 `pnpm install`（profile 自带 `pnpm-workspace.yaml`，
   hoisted 链接器会把它装进 `profiles/web/node_modules`；缺失的 peer
   （cordis 等）会落到 `$DSH_HOME/profiles/node_modules` 的 healed 回退）。

2. 在 `profiles/web/cordis.patch.yml` 中加入插件行（与 `cordis.yml` 内容相同）：

```yaml
- insert:
    - id: dynamic-wallpaper
      name: 'dsh-dynamic-wallpaper'
```

3. 启动（从检出根目录）：

```powershell
cd $REPO
pnpm dsh web
```

打开 `http://127.0.0.1:3080` → 设置（左下齿轮）→ 通用 → 动态壁纸 / 字体。

### 备选：`--patch` 覆盖（不改 profile 文件）

也可以不动 profile，用启动覆盖层：

```powershell
cd $REPO
pnpm dsh web --patch ./scratch-plugins/dsh-dynamic-wallpaper/cordis.yml
```

注意：`--patch` 只贡献配置行，包仍须能从前一步的 profile 依赖解析到
（`dsh-dynamic-wallpaper` 必须已在 `profiles/web/node_modules` 中）。

> DSH 没有 `plugins.json` 或 `profile.ts` 这类文件 —— 插件清单就是
> profile `package.json` 的 `dependencies` + `cordis.patch.yml` 的 insert 行。

## 测试

1. **构建验证**：第一步的 `pnpm exec tsdown …` 成功后，
   `scratch-plugins/dsh-dynamic-wallpaper/lib/client.js` 存在，且开头包含
   `window.__ModuleLoader__.load({ id: "dsh-dynamic-wallpaper", factory: … })`。

2. **启动验证**：`pnpm dsh web` 终端应正常打印 `dsh web:` URL，无
   `client-modules` 报错。若报
   `client bundles not found; run pnpm run build before launch`，说明
   `lib/client.js` 未构建或 `exports["./client"]` 路径不对，重新执行构建步骤。

3. **浏览器验证**：
   - DevTools → Network 过滤 `plugins/`，应看到
     `/plugins/dsh-dynamic-wallpaper/client.js?rev=…` 200。
   - 设置 → 通用 → 动态壁纸：切换开关、选类型、上传 jpg/png/webp/gif/mp4、
     拖动透明度/模糊/速度滑块，观察壁纸层实时变化。
   - 打开 `localStorage`（Application 面板），确认 `dsh.dynamic-wallpaper` 键
     写入 JSON；大文件可在 IndexedDB → `dsh-dynamic-wallpaper` → `sources`
     看到 blob 记录。
   - 刷新页面：壁纸与全部设置自动恢复（多图轮换按间隔自动切换）。
   - 关闭开关后：`<body>` 的 `data-dsh-wallpaper` 属性消失，壁纸隐藏
     （`data-hidden`），再开启需要重新上传。

4. **分层验证**（DevTools Elements）：
   - `body > div#dsh-dynamic-wallpaper`：`position: fixed; z-index: 0;
     pointer-events: none`。
   - `#root`：`position: relative; z-index: 1`。
   - 在对话区点击、选择文本、拖拽面板均不受影响（层不拦截事件）。

## 已知限制

- GIF 的播放速率无法用 CSS/JS 控制，速度滑块对 GIF 不生效（界面已注明）。
- 视频壁纸播放依赖浏览器自动播放策略：页面加载后第一次交互前可能暂停，
  一旦用户点击过页面即可正常循环播放（`muted` + `playsinline` 已设置）。
- 文件仅存在于浏览器本地：换浏览器/清站点数据后需重新上传。
- 启用壁纸会把 `--dsw-alias-bg-base` 置为透明（应用底层背景透出壁纸）；
  如个别表面观感不佳，可调低透明度或增大模糊。
- 字体缩放使用 CSS `zoom`（Chrome/Edge/Safari 及 Firefox 126+ 支持），
  移动端 Safari 对 `background-attachment: fixed` 支持不完整（渐变文字
  在移动端可能退化为单色）。

## License

[MIT](LICENSE)
