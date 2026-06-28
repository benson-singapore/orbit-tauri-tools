#!/usr/bin/env bash
# 将已有 tag 移动到当前 HEAD（修复 tag 与版本号不一致）
#
# 用法:
#   make release-retag VERSION=1.1.1
#   make release-retag VERSION=1.1.1 RELEASE_YES=1
#
# 前提: 当前 HEAD 的 tauri.conf.json 版本须与 VERSION 一致
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib/build-common.sh"

RELEASE_YES="${RELEASE_YES:-0}"
RELEASE_SKIP_PUSH="${RELEASE_SKIP_PUSH:-0}"

confirm() {
  local prompt="$1"
  if [[ "$RELEASE_YES" == "1" ]]; then
    return 0
  fi
  if [[ ! -t 0 ]]; then
    die "非交互环境请设置 RELEASE_YES=1"
  fi
  read -r -p "$prompt [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]]
}

main() {
  local version="${1:-${VERSION:-}}"
  local tag="v${version}"
  local head_sha actual_version

  [[ -n "$version" ]] || die "用法: make release-retag VERSION=1.1.1"

  git rev-parse --git-dir >/dev/null 2>&1 || die "当前目录不是 git 仓库"
  git diff --quiet && git diff --cached --quiet || die "工作区不干净，请先 commit 或 stash"
  [[ -z "$(git status --porcelain)" ]] || die "工作区不干净，请先处理未提交文件"

  actual_version="$(app_version)"
  if [[ "$actual_version" != "$version" ]]; then
    die "当前 HEAD 版本为 ${actual_version}，与 ${version} 不一致。请先 make bump-version VERSION=${version} 并提交"
  fi

  head_sha="$(git rev-parse HEAD)"
  echo ""
  info "重新定位 tag ${tag}"
  echo "  目标版本: ${version}"
  echo "  HEAD:     ${head_sha}"
  echo ""

  if git rev-parse "$tag" >/dev/null 2>&1; then
    local tag_sha
    tag_sha="$(git rev-parse "$tag")"
    if [[ "$tag_sha" == "$head_sha" ]]; then
      ok "tag ${tag} 已指向当前 HEAD，无需移动"
    else
      warn "tag ${tag} 当前指向 ${tag_sha}，将移动到 ${head_sha}"
      confirm "删除并重建 ${tag}?" || die "已取消"
      git tag -d "$tag"
    fi
  else
    confirm "创建 tag ${tag}?" || die "已取消"
  fi

  if ! git rev-parse "$tag" >/dev/null 2>&1; then
    git tag -a "$tag" -m "Release ${tag}"
    ok "已创建 tag ${tag}"
  fi

  if [[ "$RELEASE_SKIP_PUSH" == "1" ]]; then
    echo ""
    ok "本地 tag 已就绪（未 push）"
    echo "  git push origin ${tag} --force"
    exit 0
  fi

  confirm "强制推送 ${tag} 到 origin?" || die "已取消"
  git push origin "$tag" --force

  echo ""
  ok "已更新远程 tag ${tag}，GitHub Actions 将重新构建"
}

main "$@"
