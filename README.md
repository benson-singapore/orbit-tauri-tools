# Orbit Reader (Sprint 0)

macOS 桌面阅读器框架：**Tauri 2 + React + Go Sidecar (HTTP) + SQLite**。

## 前置要求

- macOS（Apple Silicon 或 Intel）
- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install)
- [Go](https://go.dev/) 1.22+

## 开发模式（推荐：不必每次 build Go）

日常改 Go 接口时，用 **`go run`** 即可，**不用**每次跑 `build-runtime-macos.sh`。

根目录已提供 **Makefile**，可先执行 `make help` 查看全部命令。

**两个终端（推荐）：**

```bash
make dev-go      # 终端 1，默认端口 17890
make dev-tauri   # 终端 2
```

**单终端一键：**

```bash
make dev         # 后台 Go + 前台 Tauri，Ctrl+C 同时退出
```

自定义端口：`make dev-go ORBIT_PORT=18000` / `make dev-tauri ORBIT_PORT=18000`

等价脚本：

```bash
bash scripts/dev-go.sh
cd app && ORBIT_RUNTIME_URL=http://127.0.0.1:17890 npm run tauri:dev
```

改 Go 代码后：在终端 1 `Ctrl+C` 再执行一次 `dev-go.sh` 即可（仍无需 `go build` 成二进制）。

| 场景 | 是否需要 `build-runtime-macos.sh` |
|------|-----------------------------------|
| 日常开发（`go run` + `ORBIT_RUNTIME_URL`） | **否** |
| `npm run tauri dev`（自动 spawn 已编译的 sidecar） | 仅**首次**或 Go 有变更且要用 sidecar 时 |
| `npm run tauri build` 打安装包 | **是**（`beforeBuildCommand` 会自动执行） |

### 一键集成模式（适合验收 / 不跑 Go 终端）

先编译 sidecar 一次，之后 Tauri 自己拉起 Go，**不必**设 `ORBIT_RUNTIME_URL`：

```bash
bash scripts/build-runtime-macos.sh
cd app && npm run tauri:dev
```

只有 **Go 代码变更** 且仍用此模式时，才需要再执行一次 `build-runtime-macos.sh`。

## 快速开始（首次）

```bash
cd app && npm install
bash scripts/build-runtime-macos.sh   # 仅集成模式 / 打包需要
cd app && npm run tauri:dev
```

顶栏应显示 **Runtime 0.1.0 · DB ready**。

## 环境变量

| 变量 | 作用 |
|------|------|
| `ORBIT_PORT` | Go 监听端口（默认随机；`dev-go.sh` 默认 `17890`） |
| `ORBIT_RUNTIME_URL` | Tauri 不 spawn sidecar，直连该 URL（开发推荐） |
| `ORBIT_PLUGINS_DIR` | RSS 插件 manifest 目录（`dev-go.sh` 默认仓库 `plugins/`） |
| `VITE_ORBIT_RUNTIME_URL` | 仅 `npm run dev` 在浏览器里调试前端时用 |

## 单独调试 Go

```bash
ORBIT_PORT=17890 go run ./runtime/cmd/orbit-runtime
curl http://127.0.0.1:17890/health
curl http://127.0.0.1:17890/v1/status
curl http://127.0.0.1:17890/v1/plugins
curl "http://127.0.0.1:17890/v1/feed?refresh=1"
```

## 目录结构

| 路径 | 说明 |
|------|------|
| `app/` | Tauri + React UI |
| `runtime/` | Go HTTP 服务、SQLite、RSS 插件 Host |
| `plugins/` | 内置 RSS 插件 manifest |
| `docs/方案/rss-plugin.md` | RSS 插件设计与 API 说明 |
| `scripts/build-runtime-macos.sh` | 编译 sidecar（打包 / 集成模式） |
| `scripts/dev-go.sh` | 开发用 `go run` |

## 数据文件

SQLite：`~/Library/Application Support/Orbit Reader/orbit.db`
