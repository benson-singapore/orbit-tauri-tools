# Orbit Reader — 常用开发命令
# 用法: make help

ORBIT_PORT        ?= 17890
ORBIT_RUNTIME_URL ?= http://127.0.0.1:$(ORBIT_PORT)
WEB_URL           ?= http://127.0.0.1:5173
MACOS_ARCH        ?=
LINUX_ARCH        ?=
BUNDLES           ?=
VERSION           ?=1.1.1

.DEFAULT_GOAL := help

.PHONY: help install dev dev-go dev-tauri dev-web open-web dev-sidecar \
        build-runtime build-runtime-all \
        build-runtime-macos-arm64 build-runtime-macos-x64 \
        build-runtime-windows build-runtime-linux build-runtime-linux-arm64 \
        build bump-version release release-dry-run release-retag \
        build-macos build-macos-x64 build-macos-arm64-full build-windows build-linux \
        icons check-go swagger swagger-check

help: ## 显示命令列表
	@echo "Orbit Reader — make targets (ORBIT_PORT=$(ORBIT_PORT))"
	@echo ""
	@grep -hE '^[a-zA-Z0-9_.-]+:.*##' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-26s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "打包示例:"
	@echo "  make build-macos              # macOS 本机架构 (.app + .dmg)"
	@echo "  make build-macos-x64          # M 系列 Mac 上打 Intel 包"
	@echo "  make build-macos-arm64-full   # M 系列私有完整级包 (.app + .dmg)"
	@echo "  make build-runtime-all        # 预编译全部平台 runtime (Zig)"
	@echo "  make build-windows            # Windows 安装包 (须在 Windows 运行)"
	@echo "  make build-linux              # Linux 安装包 (须在 Linux 运行)"
	@echo ""
	@echo "发布示例:"
	@echo "  make bump-version VERSION=1.2.0   # 仅同步版本号"
	@echo "  make release-dry-run VERSION=1.2.0 # 预览发布（不改 git）"
	@echo "  make release VERSION=1.2.0        # 改版本号 + commit + tag + push"
	@echo "  make release-retag VERSION=1.1.1  # 将 tag 移到当前 HEAD（修复错误 tag）"
	@echo ""
	@echo "推荐日常开发（两个终端）:"
	@echo "  make dev-go      # 终端 1"
	@echo "  make dev-tauri   # 终端 2"
	@echo "或单终端: make dev"

install: ## 安装 app 前端依赖 (npm install)
	cd app && npm install

dev-go: ## 启动 Go runtime (go run，默认端口 17890)
	ORBIT_PORT=$(ORBIT_PORT) bash scripts/dev-go.sh

dev-tauri: build-runtime ## 启动 Tauri 并连接外部 Go (需先 dev-go)
	cd app && ORBIT_RUNTIME_URL=$(ORBIT_RUNTIME_URL) VITE_ORBIT_ENABLE_FULL_EXPERIENCE=1 npm run tauri:dev

dev-web: ## 启动 Vite 前端开发服务（连接 Go runtime）
	cd app && VITE_ORBIT_RUNTIME_URL=$(ORBIT_RUNTIME_URL) VITE_ORBIT_ENABLE_FULL_EXPERIENCE=1 npm run dev

open-web: ## 在浏览器打开前端页面
	open "$(WEB_URL)"

dev: ## 单终端：后台 Go + Tauri（Ctrl+C 结束两者）
	bash scripts/dev-all.sh

dev-sidecar: build-runtime ## Tauri 自动拉起已编译的 sidecar
	cd app && VITE_ORBIT_ENABLE_FULL_EXPERIENCE=1 npm run tauri:dev

# ── Runtime 交叉编译 ─────────────────────────────────────────────────

build-runtime: ## 编译当前平台 runtime sidecar
	bash scripts/build-runtime.sh

build-runtime-all: ## Zig 交叉编译全部平台 runtime
	bash scripts/build-runtime.sh all

build-runtime-macos-arm64: ## 编译 macOS Apple Silicon runtime
	bash scripts/build-runtime.sh macos-arm64

build-runtime-macos-x64: ## 编译 macOS Intel runtime
	bash scripts/build-runtime.sh macos-x64

build-runtime-windows: ## 编译 Windows runtime (可用 Zig 在 Mac 上交叉编译)
	bash scripts/build-runtime.sh windows

build-runtime-linux: ## 编译 Linux x64 runtime
	bash scripts/build-runtime.sh linux

build-runtime-linux-arm64: ## 编译 Linux ARM64 runtime
	bash scripts/build-runtime.sh linux-arm64

# ── 版本号与发布 ───────────────────────────────────────────────────────

bump-version: ## 同步版本号，用法: make bump-version VERSION=1.2.0
	@test -n "$(VERSION)" || (echo "请指定版本: make bump-version VERSION=1.2.0" && exit 1)
	bash scripts/bump-version.sh $(VERSION)

release-dry-run: ## 预览发布（仅 bump 版本号，不 commit/tag/push）
	@test -n "$(VERSION)" || (echo "请指定版本: make release-dry-run VERSION=1.2.0" && exit 1)
	DRY_RUN=1 bash scripts/release.sh $(VERSION)

release: ## 发布: bump + commit + tag + push，触发 GitHub Actions
	@test -n "$(VERSION)" || (echo "请指定版本: make release VERSION=1.2.0" && exit 1)
	bash scripts/release.sh $(VERSION)

release-retag: ## 将 tag 移到当前 HEAD，修复 tag 与版本不一致  make release-retag VERSION=1.1.1 RELEASE_YES=1
	@test -n "$(VERSION)" || (echo "请指定版本: make release-retag VERSION=1.1.1" && exit 1)
	bash scripts/release-retag.sh $(VERSION)

# ── 应用打包 ─────────────────────────────────────────────────────────

build: build-runtime ## 打当前平台正式安装包 (sidecar + 前端 + tauri build)
	cd app && npm run tauri build

build-macos: ## 打包并签名 macOS 应用（含 sidecar JIT 补签，产出 .app + .dmg）
	bash scripts/build-macos-app.sh

build-macos-x64: ## 在 M 系列 Mac 上打包 Intel 版 macOS 应用
	MACOS_ARCH=x86_64 bash scripts/build-macos-app.sh

build-macos-arm64-full: ## 打包 macOS arm64 私有完整级应用（仅内部使用）
	MACOS_ARCH=arm64 VITE_ORBIT_ENABLE_FULL_EXPERIENCE=1 bash scripts/build-macos-app.sh

build-windows: ## 打包 Windows 应用（须在 Windows 上运行）
	bash scripts/build-windows-app.sh

build-linux: ## 打包 Linux 应用（须在 Linux 上运行）
	bash scripts/build-linux-app.sh

# ── 其他 ─────────────────────────────────────────────────────────────

icons: ## 从 app/src/assets/logo.png 重新生成应用图标
	bash scripts/prepare-app-icon.sh app/src/assets/logo.png app/src-tauri/app-icon.png
	cd app && npx tauri icon src-tauri/app-icon.png -o src-tauri/icons

check-go: ## 检查 Go 能否通过编译（不启动服务）
	cd runtime && go build -o /dev/null ./cmd/orbit-runtime

swagger: ## 生成 runtime OpenAPI 文档 (openapi.json)
	cd runtime && go run ./cmd/gen-openapi > openapi.json

swagger-check: ## 检查 runtime 路由是否都在 OpenAPI 里
	cd runtime && go run ./cmd/gen-openapi --check > /dev/null
