# Orbit 官方 WASM 插件

本目录用于开发、编译 Orbit Reader 的官方 WASM 插件。每个插件是独立的 Go module，编译为 `wasip1/wasm` 产物，由主仓库 Go Runtime（wazero）加载运行。

## 前置要求

- Go **1.22+**
- `make`（macOS / Linux）

## 目录结构

```text
orbit-plugins/
  sdk/                 # 插件 SDK（fetch 协议、host HTTP 封装）
  plugins/
    juejin/            # 示例：掘金插件
      manifest.json    # 插件元数据（唯一真相来源）
      main.go
      Makefile
  dist/                # 编译产物（按插件 id 分目录）
    juejin/
      manifest.json
      plugin.wasm
  schemas/             # ABI 与 manifest 说明
  Makefile             # 根构建入口
```

上架单元（同步到主仓库 `plugins/<id>/` 后由 Runtime 扫描）：

```text
plugins/<id>/
  manifest.json
  plugin.wasm
  assets/              # 可选：图标等静态资源
```

## 快速开始

```bash
cd orbit-plugins

# 查看帮助与已发现的插件
make help
make list

# 构建单个插件（推荐）
make build-juejin

# 打包：WASM + manifest（+ assets）
make package-juejin

# 同步到主仓库 plugins/，供 Runtime 加载
make sync-juejin
```

## 构建命令

### 单个插件

两种方式等价：

```bash
make build-juejin
make build PLUGIN=juejin
```

| 命令 | 说明 |
|------|------|
| `make build-<id>` | 编译 WASM → `dist/<id>/plugin.wasm` |
| `make package-<id>` | `build` + 复制 `manifest.json` / `assets/` |
| `make sync-<id>` | `package` + 复制到 `../plugins/<id>/` |
| `make clean-<id>` | 删除 `dist/<id>/` |
| `make test-native-<id>` | 本机 `go run` 调试（不走 WASM） |

### 全部插件

```bash
make build-all
make package-all
make sync-all        # 等价于 make sync
make clean-all
make test-native-all
```

指定多个插件（逗号分隔）：

```bash
make build PLUGIN=juejin,bilibili
```

插件 id 由 `plugins/*/Makefile` 自动发现；新增插件后无需修改根 `Makefile`。

## 开发测试（不必每次安装到系统）

日常开发推荐 **三层测试**，由快到慢，按需选用：

| 层级 | 命令 | 需要 Runtime | 需要安装 | 适用场景 |
|------|------|:------------:|:--------:|----------|
| 1 最快 | `make try-juejin` | 否 | 否 | 改抓取/解析逻辑，秒级反馈 |
| 2 WASM | `make try-wasm-juejin` | 否 | 否 | 验证 wasmimport / WASI 行为 |
| 3 联调 | `make dev-juejin` | 是 | 否* | 走完整 Runtime + SQLite 缓存 |

\* `make dev-go` 已开启 `ORBIT_DEV_AUTO_INSTALL=1`，官方插件从 `orbit-plugins/dist/` **自动注册**，无需在插件市场点安装。

### 层级 1：Native 快速测试（推荐日常用）

不编译 WASM、不启动 App、不写 SQLite：

```bash
make try-juejin
# 或
./scripts/try.sh juejin native
```

指定频道 / 路由：

```bash
CHANNEL=category-frontend ROUTE=/juejin/category/:category PARAMS='{"category":"frontend"}' \
  make try-juejin
```

保存文件后反复跑（简易 watch）：

```bash
./scripts/dev-loop.sh juejin
```

### 层级 2：WASM 本地测试

验证编译产物与 host 函数（需 [wasmtime](https://wasmtime.dev/)）：

```bash
brew install wasmtime   # 一次性
make try-wasm-juejin
```

### 层级 3：对接 Dev Runtime（完整链路）

**终端 1** — 启动 Runtime（已自动扫描 `orbit-plugins/dist/`，无需 `make sync`）：

```bash
cd .. && make dev-go
```

**终端 2** — 改代码后：

```bash
make dev-juejin    # package + 刷新 feed + 打印前 3 条
```

开发循环：

1. 编辑 `plugins/juejin/main.go`
2. `make try-juejin` 确认逻辑
3. 需要 UI / 缓存时：`make dev-juejin`，在 App 里刷新即可

WASM 文件更新后 **不必重启 Runtime**（每次 refresh 会重新读取 `plugin.wasm`）。若改了 `manifest.json`，执行：

```bash
curl -X POST http://127.0.0.1:17890/v1/plugins/resync
```

### 什么时候才需要 `make sync`？

| 场景 | 是否需要 sync |
|------|----------------|
| 日常插件逻辑开发 | 否，用 `dist/` + `make dev-go` |
| 验证 Tauri 打包内置插件 | 是，`make sync-juejin` |
| 发布 / CI 产物 | 是，`make sync-all` |

## 本地调试（详细命令）

在插件目录内用 JSON stdin/stdout 快速验证逻辑：

```bash
cd plugins/juejin
make test-native
```

或手动：

```bash
echo '{"action":"fetch","data":{"channelId":"trending","route":"/juejin/trending","params":{}}}' | go run .
```

编译 WASM 后可用 wasmtime 直接跑（不依赖 Orbit Runtime）：

```bash
make build-juejin
echo '{"action":"fetch","data":{"channelId":"trending","route":"/juejin/trending","params":{}}}' \
  | wasmtime dist/juejin/plugin.wasm
```

## 与主仓库联调（完整 App）

日常开发优先用上文 **层级 1–3**，只有要验证 Tauri 打包时才需要 sync：

1. 同步到主仓库 `plugins/`（可选）：

   ```bash
   make sync-juejin
   ```

2. 启动 Runtime：

   ```bash
   cd .. && make dev-go
   ```

3. 打开 App（`make dev-tauri`），官方插件已自动注册；或手动：

   ```bash
   curl -X POST http://127.0.0.1:17890/v1/plugins/juejin/install
   curl -X POST "http://127.0.0.1:17890/v1/feed/refresh?plugin_id=juejin"
   ```

打包 macOS sidecar 时，`scripts/build-runtime-macos.sh` 会先执行 `orbit-plugins` 的 `make sync`，再复制 `plugins/` 到二进制目录。

## 新增插件

1. 复制 `plugins/juejin/` 为模板：

   ```text
   plugins/<your-id>/
     go.mod          # replace 指向 ../../sdk
     main.go         # 实现 sdk.Plugin.Fetch
     manifest.json   # source: wasm, meta.official: true
     Makefile
   ```

2. 在 `main.go` 中实现 `Fetch`，网络请求使用 `plugin-sdk/host`（WASM 下走 host `http_request`，本机调试走 `net/http`）。

3. 构建并同步：

   ```bash
   make sync-<your-id>
   ```

4. 运行 `make list` 确认插件已被发现。

## 插件内 Makefile 约定

每个 `plugins/<id>/Makefile` 建议提供以下 target：

| Target | 作用 |
|--------|------|
| `build` | `GOOS=wasip1 GOARCH=wasm go build -o ../../dist/<id>/plugin.wasm .` |
| `package` | `build` + 复制 `manifest.json`、可选 `assets/` |
| `clean` | 清理 `dist/<id>/` |
| `test-native` | `go run .` + 示例 fetch JSON |

也可在插件目录单独执行：

```bash
cd plugins/juejin && make build
```

## 相关文档

- [schemas/abi-v1.md](schemas/abi-v1.md) — WASM 与 Runtime 的 JSON 协议、host 函数
- [schemas/manifest.wasm.schema.json](schemas/manifest.wasm.schema.json) — `manifest.json` JSON Schema
- [schemas/browser-preview.md](schemas/browser-preview.md) — 浏览器 / hybrid 模式（Phase 3 预留）
- [docs/方案/实施.md](docs/方案/实施.md) — 早期设计示例
