# Render 入口包

此目录只部署入口，不包含游戏资源。默认入口为 `skot-game.onrender.com`，默认游戏站为 `skot-game01.onrender.com`。

## v25 游客身份共享与跨站邀请

请部署完整 v25 包中的本目录，Root Directory 保持 `render-entry`；01/02/03 同时更新至 v25，共用原来的数据库和 JWT_SECRET。Worker 不需要更新。

入口保留同一浏览器的游客设备凭证，帮助 01/02/03 复用游客 ID；退出登录不删除设备凭证。接受跨站邀请时只切换内嵌游戏页，固定入口地址保持不变。导航消息只接受当前游戏页发送，并且目标仅限 skot-game01/02/03.onrender.com。

本版保留原透明启动图，无需重新制作图标或清除网站数据。

## v19 透明启动图标（历史说明）

入口自带透明背景 Logo 的 512x512 PNG，图案周围不再显示白色方块。新图标地址为 `/catan-icon-v19-512.png`，用于区别旧的缓存。启动屏底色仍为 `#e3f0f9`。

将本目录整体覆盖 GitHub 仓库中的 `render-entry`，只需重新部署 `skot-game` 入口，Root Directory 仍为 `render-entry`。不要遗漏新增 PNG 文件，不需要重新部署 01/02/03 或 Cloudflare Worker。

已添加到桌面的图标可能由手机单独缓存。部署后先用浏览器打开固定入口；如桌面入口仍使用旧图，移除旧桌面快捷方式后从固定入口重新添加。不要清除网站数据，以免清掉登录状态。手机系统的最终启动屏需在该手机上复核，本机浏览器测试不能保证系统不会再次压缩图标。

## 将现有 skot-game 服务改成入口

1. 将本目录提交到游戏仓库，或把 `catan-render-entry-v2.zip` 解压到一个新的公开 GitHub 仓库根目录。
2. 若继续使用完整游戏仓库，在 Render 的 `skot-game` 服务设置中把 Root Directory 改为 `render-entry`；若使用入口专用仓库，Root Directory 留空。
3. Build Command 填 `npm install`，Start Command 填 `npm start`。
4. 添加环境变量：
   - `ROUTING_API_URL=https://skot.catan-game.workers.dev/api/route`
   - `FALLBACK_GAME_URL=https://skot-game01.onrender.com`
5. 重新部署后打开 `/api/health`，应返回 `status: "ok"`，再打开首页检查跳转。

玩家不直接访问 Cloudflare。入口由 Render 服务器读取 Cloudflare 路由配置，网络读取失败时使用默认游戏站；如果 Worker 明确返回没有符合带宽要求的站，则显示不可用，不绕过额度检查。游戏通过全屏页面运行，浏览器地址和桌面入口保持为 `https://skot-game.onrender.com`；每次重新打开入口都会重新选择当前游戏站。游戏资源仍由 `01/02/03` 游戏站直接传给浏览器，不经过入口转发。不同手机的桌面安装行为仍需实机验证。

三个游戏站必须使用相同的 `MONGODB_URI` 和相同的强随机 `JWT_SECRET`。入口只同步服务器签发的登录令牌，不保存或传递账号密码；令牌有效期内切换游戏站无需重新登录，退出登录会同步清除入口令牌。

重要：后台入口配置中的默认网址及三个分旬网址都必须填写真正的游戏站，不能填写 `https://skot-game.onrender.com`，否则入口会自动改用 `FALLBACK_GAME_URL` 防止循环。
