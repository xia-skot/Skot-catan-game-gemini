# Render 入口包

此目录只部署入口，不包含游戏资源。默认入口为 `skot-game.onrender.com`，默认游戏站为 `skot-game01.onrender.com`。

## 将现有 skot-game 服务改成入口

1. 将本目录提交到游戏仓库，或把 `catan-render-entry-v1.zip` 解压到一个新的公开 GitHub 仓库根目录。
2. 若继续使用完整游戏仓库，在 Render 的 `skot-game` 服务设置中把 Root Directory 改为 `render-entry`；若使用入口专用仓库，Root Directory 留空。
3. Build Command 填 `npm install`，Start Command 填 `npm start`。
4. 添加环境变量：
   - `ROUTING_API_URL=https://skot.catan-game.workers.dev/api/route`
   - `FALLBACK_GAME_URL=https://skot-game01.onrender.com`
5. 重新部署后打开 `/api/health`，应返回 `status: "ok"`，再打开首页检查跳转。

玩家不直接访问 Cloudflare。入口由 Render 服务器读取 Cloudflare 路由配置，读取失败时自动跳到默认游戏站。

重要：后台入口配置中的默认网址及三个分旬网址都必须填写真正的游戏站，不能填写 `https://skot-game.onrender.com`，否则入口会自动改用 `FALLBACK_GAME_URL` 防止循环。
