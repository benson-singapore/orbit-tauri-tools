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

## 本地调试（不编译 WASM）

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

## 与主仓库联调

1. 同步插件到主仓库：

   ```bash
   make sync-juejin
   ```

2. 启动 Runtime（需指向 `plugins/` 目录）：

   ```bash
   cd ..
   ORBIT_PLUGINS_DIR=$PWD/plugins make dev-go
   ```

3. 在应用插件市场安装，或调用 API：

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
