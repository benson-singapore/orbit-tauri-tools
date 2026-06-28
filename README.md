# Orbit

Orbit 是一个面向多内容形态的**本地优先**桌面阅读器，在同一应用中统一浏览文章、漫画、视频、图集与社交短内容。项目基于 **Tauri 2 + React + Go Runtime + SQLite** 构建，当前首发平台为 **macOS**。

本仓库托管 Orbit 的**源代码**与**公开发布**相关内容。安装包与历史版本请前往 [GitHub Releases](https://github.com/benson-singapore/orbit-tauri-tools/releases) 下载。

---

## 目录

- [项目定位](#项目定位)
- [核心特性](#核心特性)
- [系统架构](#系统架构)
- [目录结构](#目录结构)
- [环境要求](#环境要求)
- [快速开始](#快速开始)
- [常用命令](#常用命令)
- [构建与发布](#构建与发布)
- [环境变量](#环境变量)
- [插件系统](#插件系统)
- [数据存储](#数据存储)
- [当前版本](#当前版本)
- [已知问题](#已知问题)

---

## 项目定位

Orbit 希望把分散在不同来源、不同格式的内容，统一到一个本地阅读体验中：

- 用**插件**接入不同内容源（RSS、WASM、`.orbit` 包等）
- 用**统一界面**管理订阅、阅读、播放与历史记录
- 用**本地 Runtime** 提供更稳定的解析、缓存与数据存储能力

应用默认以**安全级**体验模式发布；开发构建可通过环境变量启用**完整级**模式（详见[环境变量](#环境变量)）。

---

## 核心特性

### 插件与内容

| 能力 | 说明 |
|------|------|
| 插件市场 | 浏览、安装、更新官方插件 |
| RSS 导入 | 支持自定义 RSS 订阅源 |
| WASM / `.orbit` | 支持 WASM 插件与 `.orbit` 插件包（含 URL 远程导入） |
| 插件分组 | 侧栏折叠、排序、自定义分组 |
| 体验模式 | 安全级 / 完整级，控制成人向内容展示 |

### 阅读与播放

| 能力 | 说明 |
|------|------|
| 六种浏览布局 | 阅读模式、瀑布流、卡片视图、阅览分屏、联播分屏、视频预览 |
| 文章阅读器 | 字体调节、代码高亮、图片代理加载、图片点击预览 |
| 漫画阅读 | 章节目录（正序/倒序）、连续翻页、页宽调节、章节流预加载 |
| 视频播放 | HLS 播放、YouTube 嵌入、视频墙同播 |
| 社交内容 | 推文列表、短帖详情、社交视频播放 |
| 断点续看 | 视频 / 音频 / 文章 / 漫画播放历史与续看 |
| 多窗口 Dock | 同时挂起多篇文章或视频 |

### 日常使用

- 收藏与已读 / 未读标记
- Feed 搜索、分页加载、频道筛选
- AI 速读概括（需自行配置 LLM 提供商）
- 9 套主题色系与界面缩放
- 系统信息面板：查看应用、Runtime 与数据库状态
- 应用内更新检查（对接官方更新 API）

---

## 系统架构

Orbit 采用三层架构，前端通过本地 HTTP 与 Go Runtime 通信，避免跨域问题并保持 Rust 壳层轻量：

```
┌─────────────────────────────────────────────────────────┐
│                  Tauri 2 桌面壳 (Rust)                   │
│  ┌─────────────────────┐    ┌─────────────────────────┐ │
│  │  React 前端 UI       │    │  Sidecar 进程管理        │ │
│  │  (Vite + Tailwind)   │    │  本地 HTTP 代理 / IPC    │ │
│  └──────────┬──────────┘    └────────────┬────────────┘ │
└─────────────┼─────────────────────────────┼───────────────┘
              │  http://127.0.0.1:<port>    │
┌─────────────▼─────────────────────────────▼───────────────┐
│                   Go Runtime (Sidecar)                     │
│  插件引擎 (WASM/RSS) · SQLite · 图片代理 · 缓存 · 调度   │
└───────────────────────────────────────────────────────────┘
```

**各层职责：**

| 层级 | 路径 | 职责 |
|------|------|------|
| 前端 UI | `app/src/` | 阅读界面、插件管理、主题、播放器等 |
| 桌面壳 | `app/src-tauri/` | 窗口管理、Sidecar 拉起、系统 API |
| 本地 Runtime | `runtime/` | HTTP API、插件执行、数据持久化 |
| 内置插件 | `plugins/` | 打包进应用的官方插件资源 |

开发模式下可将 Go Runtime 与 Tauri 分开启动（`make dev-go` + `make dev-tauri`），便于热重载 Go 代码而无需每次重编 Sidecar。

---

## 目录结构

```
orbit-tauri-tools/
├── app/                    # Tauri + React 桌面应用
│   ├── src/                # 前端源码（组件、hooks、lib）
│   ├── src-tauri/          # Rust 壳、图标、打包配置
│   └── package.json
├── runtime/                # Go Runtime（编译为 orbit-runtime sidecar）
│   ├── cmd/orbit-runtime/  # 入口
│   └── internal/           # server、plugin、store 等
├── plugins/                # 内置插件目录（打包时复制到 sidecar）
├── scripts/                # 开发、构建、签名脚本
│   ├── dev-go.sh           # 启动 Go 开发服务
│   ├── dev-all.sh          # 单终端同时启动 Go + Tauri
│   ├── build-runtime.sh    # 交叉编译 runtime
│   ├── build-macos-app.sh  # macOS 打包与签名
│   └── signing.env.example # 签名配置模板（勿提交真实密钥）
└── Makefile                # 常用命令入口
```

> **说明：** `docs/` 目录为本地开发文档，已加入 `.gitignore`，不会推送到公开仓库。`orbit-plugins/` 为可选的独立插件开发仓库（与主仓库同级放置），开发时用于编译官方 WASM 插件。

---

## 环境要求

| 工具 | 版本建议 | 用途 |
|------|----------|------|
| Node.js | 18+ | 前端构建与 Tauri CLI |
| Rust | stable | Tauri 桌面壳 |
| Go | 1.22+（项目 go.mod 为 1.26） | Runtime sidecar |
| Zig | 可选 | 跨平台交叉编译 runtime（`make build-runtime-all`） |
| ImageMagick | 可选 | 重新生成应用图标（`make icons`） |

**平台支持：**

- **开发 / 发行：** macOS 10.13+
- **构建管线已覆盖：** Windows、Linux（正式发行渠道后续开放）

---

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/benson-singapore/orbit-tauri-tools.git
cd orbit-tauri-tools
```

### 2. 安装依赖

```bash
make install
```

### 3. 启动开发环境

**推荐：两个终端分别启动**

```bash
# 终端 1 — Go Runtime（默认端口 17890）
make dev-go

# 终端 2 — Tauri 桌面应用
make dev-tauri
```

**或单终端一键启动：**

```bash
make dev
```

**仅浏览器调试前端（需先启动 Go）：**

```bash
make dev-web
make open-web   # 打开 http://127.0.0.1:5173
```

### 4. 插件开发（可选）

若需加载官方 WASM 插件进行开发，将 `orbit-plugins` 仓库克隆到与本仓库同级目录，然后 `make dev-go` 会自动扫描 `orbit-plugins/dist`。也可将编译好的插件放入 `plugins/` 目录用于打包测试。

---

## 常用命令

运行 `make help` 查看完整列表。常用命令如下：

| 命令 | 说明 |
|------|------|
| `make install` | 安装前端 npm 依赖 |
| `make dev-go` | 启动 Go Runtime（`go run`） |
| `make dev-tauri` | 启动 Tauri（连接外部 Go） |
| `make dev` | 单终端：后台 Go + 前台 Tauri |
| `make build-runtime` | 编译当前平台 runtime sidecar |
| `make build-runtime-all` | Zig 交叉编译全部平台 runtime |
| `make build-macos` | 打包 macOS 应用（.app + .dmg） |
| `make build-macos-x64` | 在 Apple Silicon 上打 Intel 包 |
| `make bump-version` | 一键同步版本号（修改 Makefile 中版本后执行） |
| `make icons` | 从 `app/src/assets/logo.png` 重新生成图标 |
| `make check-go` | 检查 Go 能否通过编译 |
| `make swagger` | 生成 runtime OpenAPI 文档 |

---

## 构建与发布

### macOS 本地打包

```bash
# 复制签名配置模板并填入证书信息（对外分发时需要）
cp scripts/signing.env.example scripts/signing.env

# 打包（含 sidecar 编译、插件打包、前端构建、签名与 DMG）
make build-macos
```

产物位于 `app/src-tauri/target/release/bundle/`。

### 版本号管理

版本号分布在 `app/package.json`、`app/src-tauri/tauri.conf.json`、`app/src-tauri/Cargo.toml` 等处。使用 `make bump-version`（先在 Makefile 中修改目标版本）可一次性同步。

### 公开发布

面向用户的安装包通过 **GitHub Releases** 分发，不在仓库内直接存放二进制文件。发布说明随 Release 一并发布。

---

## 环境变量

### 开发常用

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `ORBIT_PORT` | `17890` | Go Runtime 监听端口 |
| `ORBIT_RUNTIME_URL` | — | 指定外部 Runtime 地址（Tauri 不自动拉起 sidecar） |
| `ORBIT_PLUGINS_DIR` | 自动探测 | 插件扫描目录（`dev-go.sh` 默认指向 `orbit-plugins/dist`） |
| `ORBIT_DEV_AUTO_INSTALL` | — | 设为 `1` 时开发环境自动注册官方插件 |
| `VITE_ORBIT_RUNTIME_URL` | — | 纯浏览器开发时连接 Go Runtime |
| `VITE_ORBIT_ENABLE_FULL_EXPERIENCE` | 开发默认 `1` | 启用完整级体验模式（`1` / `true`） |

### 构建与签名

| 变量 | 说明 |
|------|------|
| `MACOS_ARCH` | macOS 目标架构：`arm64` / `x86_64` |
| `VITE_ORBIT_ENABLE_FULL_EXPERIENCE` | 打包时设为 `1` 构建完整级版本 |
| `SKIP_ICONS` | 设为 `1` 跳过图标重新生成 |
| `scripts/signing.env` | Apple 代码签名与公证配置（见 `signing.env.example`） |

### Runtime 可选

| 变量 | 说明 |
|------|------|
| `ORBIT_API_URL` | 插件市场 / 更新 API 基址（默认官方 API） |
| `IMGBB_API_KEY` | 图床官方 API Key（可选） |

---

## 插件系统

Orbit 通过插件扩展内容源，支持以下类型：

- **RSS 插件**：标准 RSS/Atom 订阅
- **WASM 插件**：WebAssembly 编写的自定义解析器
- **`.orbit` 包**：打包好的插件分发格式，支持本地安装与 URL 导入

**插件扫描顺序：**

1. `ORBIT_PLUGINS_DIR` 环境变量指定的目录
2. 用户配置目录下的 `plugins/`（`~/Library/Application Support/Orbit Reader/plugins`）
3. Runtime 可执行文件同级的 `plugins/` 目录（发布包内置）

插件可通过应用内**插件市场**安装与更新，也可手动放置到用户插件目录。

---

## 数据存储

Orbit 使用本地 **SQLite** 保存订阅、阅读进度、收藏、插件配置等数据。

| 平台 | 默认数据库路径 |
|------|----------------|
| macOS | `~/Library/Application Support/Orbit Reader/orbit.db` |
| 用户插件 | `~/Library/Application Support/Orbit Reader/plugins/` |

数据完全保存在本机，**不支持云同步**。卸载应用不会自动删除数据，如需清除请手动删除上述目录。

---

## 当前版本

### v1.1.0（稳定版）

在 v1.0.0 基础上，本版本重点补齐社交内容形态、漫画阅读体验、应用内更新检查与多平台构建能力。

| 项目 | 版本 |
|------|------|
| 应用版本 | 1.1.0 |
| Runtime 版本 | 1.0.0 |
| 支持平台 | macOS 10.13+ |

**v1.1.0 主要更新：**

- 插件管理器支持 URL 导入 `.orbit` 包；新增社交插件类型
- 漫画专用页面组件、章节目录正序/倒序、章节流预加载
- 系统信息面板新增软件更新页，对接官方更新 API
- 全面主题变量化；构建系统支持 macOS / Windows / Linux 交叉编译
- 应用图标全面更新

完整更新说明见 [GitHub Releases](https://github.com/benson-singapore/orbit-tauri-tools/releases)。

---

## 已知问题

- 应用内检测到更新后，一键下载安装流程仍在完善中
- 书签数据保存在本地，暂不支持云同步
- Windows / Linux 构建脚本已就绪，正式发行渠道仍以 macOS 为主

---

## 技术栈

| 组件 | 技术 |
|------|------|
| 桌面壳 | Tauri 2、Rust |
| 前端 | React 19、TypeScript、Vite、Tailwind CSS |
| Runtime | Go、SQLite（modernc.org/sqlite） |
| 插件运行时 | WASM（wazero）、RSS 解析（gofeed） |
| 视频 | hls.js、YouTube 嵌入 |

---

## 许可证

请参阅仓库中的 LICENSE 文件（如有）。第三方依赖遵循各自的开源协议。
