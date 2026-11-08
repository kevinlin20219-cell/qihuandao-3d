# 奇幻岛 · 3D 重制

第一章「吊桥重新相连」试玩版（Three.js + Rapier，浏览器直接玩）。

- 在线试玩：https://kevinlin20219-cell.github.io/qihuandao-3d/
- `site/`：当前试玩版的发布文件（推到 main 后由 GitHub Actions 自动发布到 Pages）
- `src/`、`index.html`、`tools/`、`tests/`：游戏源码、发布脚本和测试

## 操作

WASD 移动，Shift 跑，空格跳；鼠标转镜头；1 2 3 换人；E 互动，Q 本领，F 派人 / 喊口令，H 提示，Esc 暂停（暂停里可调风力）。

## 本地开发

```
npm install
npm run build
```

推荐用 Chrome / Edge 打开；首次进入要下载约 100 MB 的模型和配音。
