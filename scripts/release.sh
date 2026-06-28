#!/usr/bin/env bash
# 发布流程：改版本号 → 提交 → 打 tag → push（触发 GitHub Actions 多平台构建）
#
# 用法:
#   bash scripts/release.sh 1.2.0
#   make release VERSION=1.2.0
#   make release VERSION=1.2.0 RELEASE_YES=1     # 跳过确认
#   make release-dry-run VERSION=1.2.0           # 仅预览，不改动 git
#
# 环境变量:
#   RELEASE_YES=1       跳过交互确认
#   DRY_RUN=1           只执行 bump-version 预览，不 commit / tag / push
#   RELEASE_SKIP_PUSH=1 本地 commit + tag，不 push
#   RELEASE_BRANCH=     指定 push 分支（默认当前分支）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib/build-common.sh"

NEW_VERSION="${1:-${VERSION:-}}"
TAG="v${NEW_VERSION}"
RELEASE_YES="${RELEASE_YES:-0}"
DRY_RUN="${DRY_RUN:-0}"
RELEASE_SKIP_PUSH="${RELEASE_SKIP_PUSH:-0}"
RELEASE_BRANCH="${RELEASE_BRANCH:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)}"

usage() {
  cat <<EOF
用法:
  bash scripts/release.sh <version>
  make release VERSION=<version>

示例:
  make release VERSION=1.2.0
  make release VERSION=1.2.0 RELEASE_YES=1
  make release-dry-run VERSION=1.2.0
EOF
}

confirm() {
  local prompt="$1"
  if [[ "$RELEASE_YES" == "1" ]]; then
    return 0
  fi
  read -r -p "$prompt [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]]
}

require_clean_tree() {
  if ! git diff --quiet || ! git diff --cached --quiet; then
    die "工作区有未提交改动，请先 commit 或 stash 后再发布"
  fi
  if [[ -n "$(git status --porcelain)" ]]; then
    die "工作区不干净，请先处理未跟踪/未提交文件后再发布"
  fi
}

require_git_repo() {
  git rev-parse --git-dir >/dev/null 2>&1 || die "当前目录不是 git 仓库"
}

require_remote() {
  git remote get-url origin >/dev/null 2>&1 || die "未配置 origin 远程，无法 push 触发 CI"
}

tag_exists() {
  git rev-parse "$TAG" >/dev/null 2>&1
}

remote_tag_exists() {
  git ls-remote --tags origin "refs/tags/$TAG" 2>/dev/null | grep -q .
}

main() {
  [[ -n "$NEW_VERSION" ]] || { usage; die "请指定版本号，例如: make release VERSION=1.2.0"; }

  if [[ ! "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$ ]]; then
    die "版本号格式无效: $NEW_VERSION（期望 semver，如 1.2.0）"
  fi

  require_git_repo

  local old_version
  old_version="$(app_version)"

  echo ""
  info "Orbit 发布流程"
  echo "  当前版本: ${old_version:-?}"
  echo "  目标版本: $NEW_VERSION"
  echo "  Git tag:  $TAG"
  echo "  分支:     $RELEASE_BRANCH"
  if [[ "$DRY_RUN" == "1" ]]; then
    warn "DRY_RUN=1：仅同步版本号文件，不 commit / tag / push"
  elif [[ "$RELEASE_SKIP_PUSH" == "1" ]]; then
    warn "RELEASE_SKIP_PUSH=1：将 commit + tag，但不 push"
  else
    echo "  推送后:   GitHub Actions 自动构建 4 平台并发布 Release"
  fi
  echo ""

  if [[ "$NEW_VERSION" == "$old_version" && "$DRY_RUN" != "1" ]]; then
    warn "目标版本与当前版本相同"
    confirm "继续发布 $TAG？" || die "已取消"
  fi

  if [[ "$DRY_RUN" != "1" ]]; then
    require_clean_tree
    if tag_exists; then
      die "本地已存在 tag: $TAG"
    fi
    if remote_tag_exists; then
      die "远程已存在 tag: $TAG"
    fi
    require_remote
  fi

  if [[ "$DRY_RUN" == "1" ]]; then
    info "同步版本号（预览）..."
    bash "$SCRIPT_DIR/bump-version.sh" "$NEW_VERSION"
    echo ""
    ok "预览完成。确认无误后执行:"
    echo "  make release VERSION=$NEW_VERSION"
    exit 0
  fi

  confirm "确认发布 $NEW_VERSION ($TAG)？" || die "已取消"

  info "同步版本号..."
  bash "$SCRIPT_DIR/bump-version.sh" "$NEW_VERSION"

  info "提交版本变更..."
  git add \
    app/package.json \
    app/package-lock.json \
    app/src-tauri/tauri.conf.json \
    app/src-tauri/Cargo.toml \
    app/src-tauri/Cargo.lock
  git commit -m "chore: release $TAG"

  info "创建 tag $TAG..."
  git tag -a "$TAG" -m "Release $TAG"

  if [[ "$RELEASE_SKIP_PUSH" == "1" ]]; then
    echo ""
    ok "本地发布准备完成（未 push）"
    echo "  git push origin $RELEASE_BRANCH"
    echo "  git push origin $TAG"
    exit 0
  fi

  info "推送到 origin..."
  git push origin "$RELEASE_BRANCH"
  git push origin "$TAG"

  echo ""
  ok "已发布 $TAG，GitHub Actions 正在构建多平台安装包"
  echo "  查看进度: https://github.com/$(git remote get-url origin | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')/actions"
  echo "  Release:  https://github.com/$(git remote get-url origin | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')/releases/tag/$TAG"
}

main "$@"
