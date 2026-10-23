#!/bin/zsh
cd "${0:A:h}/../../.." || exit 1
find_node() {
  local wanted="$1" candidate
  for candidate in "/opt/homebrew/opt/node@$wanted/bin/node" "/usr/local/opt/node@$wanted/bin/node" "$(command -v node)"; do
    if [[ -x "$candidate" && "$($candidate -p 'process.versions.node.split(".")[0]')" == "$wanted" ]]; then
      print -r -- "$candidate"; return 0
    fi
  done
  print -u2 "未找到 Node $wanted，请安装后重试。"; return 1
}
node24=$(find_node 24) || exit 1
if [[ ! -d node_modules/tsx || ! -d node_modules/esbuild ]]; then
  node20=$(find_node 20) || exit 1
  PATH="${node20:h}:$PATH" npm ci --no-audit --no-fund || exit 1
fi
export PATH="${node24:h}:$PATH"
command -v dsh >/dev/null || { print -u2 "未找到 DSH，请先安装官方 DSH 后重试。"; exit 1; }
if [[ -n "$1" ]]; then
  "$node24" --import tsx apps/dsh-plugin/scripts/work-evidence-experience.mjs "$1"
  exit $?
fi
while true; do
  print '\nWork Evidence 个人体验\n1 启动 / 继续（打开浏览器）\n2 生成样例变化（先在页面同步一次）\n3 查看状态与样例目录\n4 停止（保留记录）\n5 重置（新建运行，旧记录保留）\n0 退出菜单（不停止服务）'
  read 'choice?请选择：'
  case "$choice" in
    1) action=start;; 2) action=change;; 3) action=status;; 4) action=stop;; 5) action=reset;; 0) exit 0;; *) continue;;
  esac
  "$node24" --import tsx apps/dsh-plugin/scripts/work-evidence-experience.mjs "$action"
done
