# dsh-dynamic-wallpaper

DSH (DeepSeek Harness) 网页端插件：**动态壁纸 + 字体美化**，安装后在网页界面 **设置 → 通用** 里出现两个配置区域：

- **动态壁纸**：静态图片（可多图轮换）/ GIF / 视频壁纸，本地文件上传，全屏开关，透明度 / 模糊 / 播放速度。
- **字体**：字号缩放（80%–150%）、主/辅文字颜色、5 色标渐变文字 + 方向（上到下 / 左到右 / 斜向）。

---

## 快速开始（3 步装好）

> 前置：你已经能运行 DeepSeek Harness（即 `pnpm dsh web` 能跑起来）。

```powershell
# 1. 下载插件（放到任意目录）
git clone https://github.com/MoYuShisi/dsh-dynamic-wallpaper.git

# 2. 把插件放进 DSH 检出目录并构建（$REPO 换成你的 DSH 源码目录，如 C:\deepseek-harness\deepseek-harness）
mkdir $REPO\scratch-plugins
Copy-Item -Recurse dsh-dynamic-wallpaper $REPO\scratch-plugins\
cd $REPO
pnpm exec tsdown -c scratch-plugins/dsh-dynamic-wallpaper/tsdown.config.ts

# 3. 注册到 DSH 的 web profile（$DSH_HOME 默认 %USERPROFILE%\.dsh）
cd $DSH_HOME\profiles\web
pnpm add dsh-dynamic-wallpaper@file:$REPO\scratch-plugins\dsh-dynamic-wallpaper
```

再编辑 `%USERPROFILE%\.dsh\profiles\web\cordis.patch.yml`，把内容改为：

```yaml
- insert:
    - id: dynamic-wallpaper
      name: 'dsh-dynamic-wallpaper'
```

然后启动：

```powershell
cd $REPO
pnpm dsh web
```

打开 http://127.0.0.1:3080 → 左下角齿轮（设置）→ **通用** → **动态壁纸 / 字体**。

---

## 下载插件

| 方式 | 命令 |
|---|---|
| git clone（推荐，更新方便） | `git clone https://github.com/MoYuShisi/dsh-dynamic-wallpaper.git` |
| 下载 ZIP | 打开仓库页面 → 绿色 **Code** 按钮 → **Download ZIP** → 解压 |

> 仓库只含源码，构建产物 `lib/` 不上传，所以安装时必须先构建（见下）。

---

## 安装（详细版）

### 前置要求

- DeepSeek Harness 已按 run-from-source 方式运行过（即 `pnpm install` 已执行）。
- Windows PowerShell 或 macOS/Linux 终端。
- 下文：
  - `$REPO` = 你的 DSH 源码检出目录（例：`C:\deepseek-harness\deepseek-harness`）
  - `$DSH_HOME` = DSH 用户主目录（默认 `%USERPROFILE%\.dsh`，即 `C:\Users\<你的用户名>\.dsh`）

### 第 1 步：把插件放进 DSH 检出目录

插件构建需要 DSH 检出的 `node_modules`（tsdown、react、`@deepseek-ai/*` 包），所以源码目录要放进检出树里（只新增目录，不改动 DSH 任何原有文件）：

```powershell
mkdir $REPO\scratch-plugins
Copy-Item -Recurse dsh-dynamic-wallpaper $REPO\scratch-plugins\
```

### 第 2 步：构建（生成浏览器插件包）

在 DSH 检出根目录执行：

```powershell
cd $REPO
pnpm exec tsdown -c scratch-plugins/dsh-dynamic-wallpaper/tsdown.config.ts
```

成功后会生成：

- `scratch-plugins/dsh-dynamic-wallpaper/lib/index.js`（宿主半）
- `scratch-plugins/dsh-dynamic-wallpaper/lib/client.js`（浏览器半，约 70KB）

（可选）类型检查：`pnpm exec tsc --noEmit -p scratch-plugins/dsh-dynamic-wallpaper/tsconfig.json`

### 第 3 步：注册进 DSH 的 web profile

DSH 的插件靠用户 profile 加载（**不需要改 DSH 源码**）：

**3a. 加入依赖**

```powershell
cd $DSH_HOME\profiles\web
pnpm add dsh-dynamic-wallpaper@file:$REPO\scratch-plugins\dsh-dynamic-wallpaper
```

**3b. 加入加载行**

编辑 `$DSH_HOME\profiles\web\cordis.patch.yml`，写入：

```yaml
- insert:
    - id: dynamic-wallpaper
      name: 'dsh-dynamic-wallpaper'
```

### 第 4 步：启动

```powershell
cd $REPO
pnpm dsh web
```

打开 http://127.0.0.1:3080 → 左下角齿轮 → **通用** → 找到「**动态壁纸**」和「**字体**」两个区域。

---

## 使用说明

### 动态壁纸

1. 打开「启用动态壁纸」开关（**立即生效**；关闭开关会清空壁纸，下次开启需重新上传）
2. 选类型：静态图片 / GIF 动图 / 视频
3. 上传文件（jpg / png / webp / gif / mp4；图片进入多图列表，GIF/视频进入对应类型槽）
4. 静态图片：可传多张 → 打开「轮换模式」→ 设间隔（1–120s）→ 选顺序/随机
5. 全屏壁纸开关：开=侧边栏和对话区都显示；关=只在对话区显示
6. 调透明度 / 模糊 / 播放速度
7. 点「**确定更换**」生效（开关除外）

### 字体

1. 字号缩放：80%–150% 滑块（整体缩放界面，设置弹窗保持 100%）
2. 主/辅文字颜色（留空=跟随主题）
3. 渐变文字开关 + 方向 + 5 个色标颜色
4. 点「**确定更换**」生效

---

## 卸载

```powershell
cd $DSH_HOME\profiles\web
pnpm remove dsh-dynamic-wallpaper
```

并把 `cordis.patch.yml` 里的 `dynamic-wallpaper` insert 段删掉（或恢复为 `[]`），删除 `$REPO\scratch-plugins\dsh-dynamic-wallpaper` 目录即可。

---

## 常见问题（FAQ）

**Q: 启动时报 `client bundles not found; run pnpm run build before launch`**
A: `lib/client.js` 没构建成功。回到第 2 步重新执行 tsdown 命令。

**Q: 浏览器 Network 里看不到 `/plugins/dsh-dynamic-wallpaper/client.js`**
A: 说明插件行没被加载。检查 profile 的 `package.json` 依赖和 `cordis.patch.yml` 是否都配好，然后重启 `pnpm dsh web`。

**Q: 设置 → 通用 里没有「动态壁纸 / 字体」**
A: 同上，插件未加载。看启动终端有无报错；也可在 DevTools Console 里看有无报错。

**Q: 上传了视频/图片但没反应**
A: 看设置面板有没有红色提示：类型不匹配请切类型；"无法解码"请换文件（视频建议 H.264 编码）。改完记得点「确定更换」。

**Q: 换浏览器后壁纸没了**
A: 文件只存在浏览器本地（localStorage + IndexedDB），换浏览器/清站点数据需要重新上传。

---

## 兼容性

- **网页端**（浏览器访问 `http://127.0.0.1:3080`）：已实测可用。
- **桌面端（Electron）**：插件只用标准浏览器 API（DOM / localStorage / IndexedDB / `<video>` / `<img>` / CSS），不碰宿主进程；只要桌面壳走 DSH 官方客户端插件加载机制（`/plugins/<id>/client.js`）即可运行（未实测，理论可行）。

---

## 目录结构

```
dsh-dynamic-wallpaper/
├── package.json              # 包清单 + dsh.client 声明（浏览器 bundle 路由）
├── tsconfig.json             # 编辑器/类型检查（可选）
├── tsdown.config.ts          # 基于 DSH clientBundle 预设的双半构建
├── cordis.yml                # 便捷 patch：插入插件行
├── README.md
└── src/
    ├── index.ts              # 宿主半：空 apply（保证 Loader 行激活）
    └── client/               # 浏览器半（被打包成 /plugins/dsh-dynamic-wallpaper/client.js）
        ├── index.ts          # 客户端 apply：装配 controller + 壁纸层 + 两个设置行
        ├── controller.ts     # 壁纸/字体两组设置状态、localStorage 持久化、文件负载生命周期
        ├── blob-store.ts     # IndexedDB 大文件存储
        ├── wallpaper-layer.ts# 固定底层 DOM 层 + 多图轮换/视频/GIF 渲染 + 字体样式应用
        ├── WallpaperRow.tsx  # 「动态壁纸」设置行（React）
        ├── FontRow.tsx       # 「字体」设置行（React）
        ├── WallpaperRow.module.css
        └── locales.ts        # zh/en 文案
```

## 工作原理（DSH 客户端插件机制）

DSH 的 Web UI 是 Cordis 插件树：宿主 Loader 的 entry 若在 `package.json` 声明了 `dsh.client.platform: 'web'` 并导出 `exports["./client"]` 构建产物，`dsh-client-modules` 会把它放入 `window.__DSH_BOOT__` 并在 `/plugins/<id>/client.js` 提供 bundle；浏览器 shell 启动时加载并执行客户端 half。本插件是「双面」包：

- 宿主半 `lib/index.js`：空 `apply`，只为了让该行成为活跃 entry（否则 client-modules 不会服务其 bundle）。
- 浏览器半 `lib/client.js`：挂壁纸层、注册两个设置行；只 import 平台模块表里的外部依赖（react、`@deepseek-ai/dsh-client-ui-slots` 等），通过 `ctx.slots.inject('settings.general.item', …)` 注册进通用设置区。

## License

[MIT](LICENSE)
