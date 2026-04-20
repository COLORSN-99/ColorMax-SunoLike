#!/usr/bin/env bash
set -e
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
npm_install() {
  local flags="$1"
  log_info "执行 npm install $flags ..."
  npm install $flags 2>&1 | tee /tmp/npm-install.log
  return ${PIPESTATUS[0]}
}
handle_error() {
  local log=/tmp/npm-install.log
  local retry_count=0
  local max_retry=3
  while [ $retry_count -lt $max_retry ]; do
    retry_count=$((retry_count + 1))
    if grep -qi "ECONNRESET\|ENOTFOUND\|ESERVFAIL\|ETIMEDOUT" "$log"; then
      log_warn "网络异常，切换镜像重试 ($retry_count/$max_retry)..."
      npm config set registry https://registry.npmmirror.com
      npm_install "" && return 0
    elif grep -qi "UNABLE_TO_VERIFY_LEAF_SIGNATURE\|certificate" "$log"; then
      log_warn "SSL 证书异常，关闭严格验证重试..."
      npm config set strict-ssl false
      npm_install "" && return 0
    elif grep -qi "ERESOLVE\|peer dep" "$log"; then
      log_warn "依赖冲突，使用 --legacy-peer-deps 重试..."
      npm_install "--legacy-peer-deps" && return 0
    elif grep -qi "ELIFECYCLE" "$log"; then
      log_warn "生命周期脚本异常，忽略脚本重试..."
      npm_install "--ignore-scripts" && return 0
    elif grep -qi "EACCES\|permission denied" "$log"; then
      log_warn "权限不足，尝试修复 npm 全局目录权限..."
      mkdir -p ~/.npm-global
      npm config set prefix ~/.npm-global
      npm_install "" && return 0
    fi
  done
  log_error "重试 $max_retry 次后仍然失败，请手动排查："
  echo "  1. cat $log"
  echo "  2. npm doctor"
  echo "  3. rm -rf node_modules package-lock.json && npm install"
  return 1
}
npm_install "" || handle_error