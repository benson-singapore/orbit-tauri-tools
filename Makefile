# Orbit Reader — 常用开发命令
# 用法: make help

ORBIT_PORT        ?= 17890
ORBIT_RUNTIME_URL ?= http://127.0.0.1:$(ORBIT_PORT)
WEB_URL           ?= http://127.0.0.1:5173

.DEFAULT_GOAL := help

.PHONY: help install dev dev-go dev-tauri dev-web open-web dev-sidecar \
        build-runtime build check-go swagger swagger-check

help: ## 显示命令列表
	@echo "Orbit Reader — make targets (ORBIT_PORT=$(ORBIT_PORT))"
	@echo ""
	@grep -hE '^[a-zA-Z0-9_.-]+:.*##' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "推荐日常开发（两个终端）:"
	@echo "  make dev-go      # 终端 1"
	@echo "  make dev-tauri   # 终端 2"
	@echo "或单终端: make dev"

install: ## 安装 app 前端依赖 (npm install)
	cd app && npm install

dev-go: ## 启动 Go runtime (go run，默认端口 17890)
	ORBIT_PORT=$(ORBIT_PORT) bash scripts/dev-go.sh

dev-tauri: ## 启动 Tauri 并连接外部 Go (需先 dev-go)
	cd app && ORBIT_RUNTIME_URL=$(ORBIT_RUNTIME_URL) npm run tauri:dev

dev-web: ## 启动 Vite 前端开发服务（连接 Go runtime）
	cd app && VITE_ORBIT_RUNTIME_URL=$(ORBIT_RUNTIME_URL) npm run dev

open-web: ## 在浏览器打开前端页面
	open "$(WEB_URL)"

dev: ## 单终端：后台 Go + Tauri（Ctrl+C 结束两者）
	bash scripts/dev-all.sh

dev-sidecar: ## Tauri 自动拉起已编译的 sidecar（需先 make build-runtime）
	cd app && npm run tauri:dev

build-runtime: ## 编译 macOS sidecar 到 app/src-tauri/binaries/
	bash scripts/build-runtime-macos.sh

build: build-runtime ## 打正式安装包 (sidecar + 前端 + tauri build)
	cd app && npm run tauri build

check-go: ## 检查 Go 能否通过编译（不启动服务）
	cd runtime && go build -o /dev/null ./cmd/orbit-runtime

swagger: ## 生成 runtime OpenAPI 文档 (openapi.json)
	cd runtime && go run ./cmd/gen-openapi > openapi.json

swagger-check: ## 检查 runtime 路由是否都在 OpenAPI 里
	cd runtime && go run ./cmd/gen-openapi --check > /dev/null
