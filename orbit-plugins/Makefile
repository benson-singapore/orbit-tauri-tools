# Official WASM plugins — build all or one plugin at a time.
#
# Build outputs go to dist/<id>/ only (make dev-go scans dist/ for dev).
# Copying into the app repo plugins/ is opt-in — use make sync-<id> when
# you need bundled plugins under ../plugins/ (e.g. Tauri release).
#
# Examples:
#   make build-juejin              # WASM -> dist/juejin/ only
#   make package PLUGIN=juejin     # same as make package-juejin
#   make sync-juejin               # package + copy dist -> ../plugins/juejin
#   make test-native-juejin
#   make build-all                 # every plugin under plugins/

ROOT := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
DIST := $(ROOT)dist
# Target for explicit sync-* only; never written by build/package.
INSTALL_PLUGINS_DIR ?= $(ROOT)../plugins
comma := ,

# Auto-discover plugin ids (plugins/<id>/Makefile)
PLUGINS := $(sort $(patsubst plugins/%/,%,$(dir $(wildcard plugins/*/Makefile))))

# Optional: PLUGIN=juejin  or  PLUGIN=juejin,bilibili
PLUGIN ?=
ifneq ($(strip $(PLUGIN)),)
  SELECTED := $(strip $(subst $(comma), ,$(PLUGIN)))
else
  SELECTED := $(PLUGINS)
endif

.PHONY: help list build build-all package package-all sync sync-all clean clean-all test-native test-native-all

.DEFAULT_GOAL := help

help:
	@echo "Orbit official plugins"
	@echo ""
	@echo "Discovered plugins: $(PLUGINS)"
	@echo ""
	@echo "Build outputs: $(DIST)/<id>/  (dev runtime scans dist/ via make dev-go)"
	@echo ""
	@echo "All plugins:"
	@echo "  make build-all | package-all | clean-all | test-native-all"
	@echo "  make sync-all                  # opt-in: copy dist -> $(INSTALL_PLUGINS_DIR)"
	@echo ""
	@echo "Single plugin:"
	@echo "  make build-juejin              # -> dist/juejin/ only"
	@echo "  make package PLUGIN=juejin     # same as make package-juejin"
	@echo "  make sync-juejin               # opt-in: also copy to $(INSTALL_PLUGINS_DIR)"
	@echo "  make test-native-juejin"
	@echo "  make try-juejin              # same as test-native, via try.sh"
	@echo "  make try-wasm-juejin         # wasmtime (needs: brew install wasmtime)"
	@echo "  make dev-juejin              # package + hit dev runtime feed API"
	@echo "  bash scripts/dev-loop.sh juejin   # watch + re-test on save"
	@echo ""
	@echo "  make list                      # print plugin ids"

list:
	@printf '%s\n' $(PLUGINS)

define assert_plugins
$(if $(SELECTED),,$(error No plugins found. Add plugins/<id>/Makefile))
$(foreach p,$(SELECTED),$(if $(filter $(p),$(PLUGINS)),,$(error Unknown plugin "$(p)". Available: $(PLUGINS))))
endef

# Per-plugin targets (build-juejin, package-juejin, …)
define PLUGIN_RULES
.PHONY: build-$(1) package-$(1) sync-$(1) clean-$(1) test-native-$(1)

build-$(1):
	@echo "→ $(1): build"
	@$(MAKE) -C plugins/$(1) build

package-$(1): build-$(1)
	@echo "→ $(1): package"
	@$(MAKE) -C plugins/$(1) package

sync-$(1): package-$(1)
	@echo "→ installing $(1) to $(INSTALL_PLUGINS_DIR)/$(1)"
	@rm -rf "$(INSTALL_PLUGINS_DIR)/$(1)"
	@mkdir -p "$(INSTALL_PLUGINS_DIR)/$(1)"
	@cp -R "$(DIST)/$(1)/"* "$(INSTALL_PLUGINS_DIR)/$(1)/"
	@echo "installed $(INSTALL_PLUGINS_DIR)/$(1)"

clean-$(1):
	@echo "→ $(1): clean"
	@$(MAKE) -C plugins/$(1) clean

test-native-$(1):
	@echo "→ $(1): test-native"
	@$(MAKE) -C plugins/$(1) test-native

try-$(1):
	@bash scripts/try.sh $(1) native

try-wasm-$(1):
	@bash scripts/try.sh $(1) wasm

dev-$(1):
	@bash scripts/try.sh $(1) runtime
endef

$(foreach p,$(PLUGINS),$(eval $(call PLUGIN_RULES,$(p))))

# Aggregate targets (respect PLUGIN=… when set)
ifneq ($(strip $(PLUGIN)),)
  BUILD_TARGETS := $(foreach p,$(SELECTED),build-$(p))
  PACKAGE_TARGETS := $(foreach p,$(SELECTED),package-$(p))
  SYNC_TARGETS := $(foreach p,$(SELECTED),sync-$(p))
  CLEAN_TARGETS := $(foreach p,$(SELECTED),clean-$(p))
  TEST_TARGETS := $(foreach p,$(SELECTED),test-native-$(p))
else
  BUILD_TARGETS := $(foreach p,$(PLUGINS),build-$(p))
  PACKAGE_TARGETS := $(foreach p,$(PLUGINS),package-$(p))
  SYNC_TARGETS := $(foreach p,$(PLUGINS),sync-$(p))
  CLEAN_TARGETS := $(foreach p,$(PLUGINS),clean-$(p))
  TEST_TARGETS := $(foreach p,$(PLUGINS),test-native-$(p))
endif

build: $(call assert_plugins) build-all
build-all: $(BUILD_TARGETS)

package: $(call assert_plugins) package-all
package-all: $(PACKAGE_TARGETS)

sync: $(call assert_plugins) sync-all
sync-all: $(SYNC_TARGETS)
	@echo "installed -> $(INSTALL_PLUGINS_DIR)"

clean: $(call assert_plugins) clean-all
clean-all: $(CLEAN_TARGETS)

test-native: $(call assert_plugins) test-native-all
test-native-all: $(TEST_TARGETS)
