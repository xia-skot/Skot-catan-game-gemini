# v15：独立入口与分旬跳转部署说明

## 先分清两个包

- `catan-complete-v15.zip`：完整游戏项目。更新游戏仓库时使用，包含 `.github` 等全部必要文件。上传解压后的项目内容，使 `package.json`、`server.ts`、`.github` 位于仓库根目录，不要再套一层文件夹。
- `catan-gateway-v15.zip`：独立入口，部署到 Cloudflare Workers。它不是第四个 Render 游戏站，也不存储游戏数据。

普通玩家打开入口，入口从 Cloudflare KV 读取网址配置，然后在当前窗口执行 `location.replace()` 跳转到当旬游戏站。没有弹窗，没有固定倒计时，没有第二套加载进度。入口只显示与游戏启动画面一致的浅蓝背景，游戏站接着执行原来的资源加载和帆船动画。地址栏会变化，首次连接新域名仍受网络、Render 冷启动影响，不能保证完全没有等待。

## 1. 准备游戏站

1. 三个游戏站部署同一份完整游戏代码，构建命令沿用 `npm ci && npm run build`，启动命令 `npm start`。
2. 三个站使用同一个 `MONGODB_URI`，代码统一连接 `catan_db`。这样账号、公告、战绩和排行榜共享。
3. 每个站都需要完整的现有环境变量。JWT 密钥使用强随机值，不要采用代码默认值；部署时注意更换 JWT 密钥会让旧登录失效。
4. 分别打开三个站，检查注册/登录、进房间以及 `/api/health`。v15 的健康接口应包含 `version: "v15"` 和 `scoringVersion: "rank-points-v15"`。

只有一个站时也能先完成以下设置。保持“按旬切换”关闭，默认网址填写当前站，另外两个站准备好后再启用。

Render 带宽按工作区统计。同一工作区里的三个服务不会变成三份免费带宽；独立工作区的额度分别统计，以各账号实际账单和平台规则为准。
官方依据：https://render.com/docs/outbound-bandwidth

## 2. 创建独立入口（Cloudflare 网页操作）

1. 登录 Cloudflare，在 Workers & Pages 创建一个 Worker，例如 `catan-entry`。先发布默认示例，得到 `https://catan-entry.你的子域.workers.dev`。
2. 打开编辑代码，将入口包里的 `worker.js` 全部放入 Worker 编辑器，保存部署。注意是已经打包的 `worker.js`，不是 `worker.ts`。只需要这个 JavaScript 文件，不需要上传游戏资源。
3. 在 KV 中创建一个命名空间，例如 `catan-routing`。
4. 回到 Worker 的 Bindings，添加 KV Namespace 绑定，变量名必须是 `ROUTING`，选择刚才的命名空间。
5. 在 Worker Settings 的 Variables and Secrets 添加 **Secret**：`GATEWAY_ADMIN_TOKEN`。值使用密码管理器生成的至少 32 个字符的随机字符串，自己保存。不要写进代码、GitHub、网址或公开截图。
6. 添加普通变量 `KEEP_ALIVE`，值填 `true`。
7. 添加 Cron Trigger：`*/5 * * * *`，即每五分钟执行一次。网页粘贴部署不会自动读取压缩包中的 `wrangler.jsonc`，所以必须手动添加绑定、Secret、普通变量和 Cron。
8. 再次部署，打开 `https://你的入口/api/route`。未做管理员设置时，应返回默认游戏站 `https://skot-game01.onrender.com`。

当前玩家入口改为 Render 的 `https://skot-game.onrender.com`。Cloudflare Worker 继续保存分旬配置并执行保活，但玩家无需直接访问 `workers.dev`。部署 `catan-render-entry-v1.zip` 后，在 Worker 增加普通变量 `ENTRY_ORIGIN=https://skot-game.onrender.com`，让定时任务同时唤醒入口；入口的健康检查会继续唤醒当前游戏站。

如果 workers.dev 在玩家所在网络不可达，需要绑定玩家可访问的自定义域名后再使用。应先用实际手机网络测试，不要在未验证时替换所有入口。

## 3. 将游戏管理中心接到独立入口

在每个 Render 游戏站的 Environment 增加：

```text
GATEWAY_URL=https://catan-entry.你的子域.workers.dev
GATEWAY_ADMIN_TOKEN=与Cloudflare中完全相同的随机密钥
```

`GATEWAY_URL` 只填入口根网址，不加 `/api/admin/config` 或其他路径。保存环境变量后重新部署。

随后登录游戏管理员账号，进入：**我的 → 管理中心 → 系统设置 → 入口跳转**。

1. 默认网址填当前可用的游戏站。
2. 填上旬（1—10 日）、中旬（11—20 日）、下旬（21 日—月底）的三个 Render 网址。
3. 勾选“按月上、中、下旬自动切换”，点击“保存入口设置”。
4. 等待约一分钟，再访问入口的 `/api/route`，核对 `origin`。
5. 把独立入口网址发给玩家。之后更改分旬网址，只需要管理员在这里保存，不需要重新部署入口。

分旬使用 Asia/Shanghai 的日历日期，在每月 11 日、21 日和下月 1 日的 00:00 切换。

配置实际存放在 **Cloudflare KV**。游戏管理接口只把通过管理员验证的配置转交给 Worker；入口无需请求休眠中的 Render。管理密钥只保留在 Worker Secret 和游戏服务器环境变量中，不会发送到玩家浏览器。Cloudflare KV 全球同步可能延迟，避免两个管理员同时反复保存。
官方依据：https://developers.cloudflare.com/kv/api/write-key-value-pairs/

## 4. 验证三个目标和旧房间入口

下面的网址可以直接测试已配置的站，无需等到对应日期：

```text
https://你的入口/?site=early
https://你的入口/?site=middle
https://你的入口/?site=late
```

要分享指定旧站的房间，使用：

```text
https://你的入口/?site=early&room=123456
```

把 `early` 改成房间所在的时段站，把 `123456` 改成房间号。房间必须仍在原站存在。没有 `site` 参数的新访问默认去当旬站。

当前房间存在各 Render 服务的进程内存中，不会因 MongoDB 相同而自动跨站同步：

- 正在打开的页面不会在日期切换时跳转，进行中的游戏继续留在原站。
- 从普通入口重新打开，会进入新的当旬站。要回到跨旬旧房间，使用原站网址或带 `site` 的房间链接。
- 请不要在仍有旧房间时把对应时段的网址改成其他站。
- 服务重启可能丢失内存房间。保活无法代替存档，也不能保证 Render 不重启。
- 不同域名的登录状态和本地私信显示设置相互独立。第一次进入另一个游戏站可能需要重新登录；同一个 MongoDB 可使用原账号密码。该版本没有通过网址传递登录令牌，也没有自动迁移本地数据。
- 已安装的 PWA 仍绑定安装时的域名；跨域跳转可能离开原 PWA 窗口。这个入口版本是浏览器跳转方案，不能保证所有手机上都保持原安装 App 的外壳行为。

## 5. 保活如何跟随切换

配置了 Worker Cron 且 `KEEP_ALIVE=true` 后，由 Cloudflare 独立定时请求当旬站的 `/api/health`，玩家关掉浏览器后仍会执行。切换前后六小时覆盖前一个时段的目标，帮助保留最长五小时的旧房间。不会请求整站贴图、音乐或资源文件。

请在 Worker 的日志中确认定时调用成功。冷启动超过 45 秒、网络故障、平台额度或定时任务问题仍可能使某次调用失败；不能承诺永不休眠。可使用 `/api/route` 中的 `healthUrl` 核对当前保活目标。

确认 Worker 定时运行后，在 GitHub Actions 中暂停旧的“网站外部保活”工作流，避免它继续访问固定旧站。未部署 Worker 前，原有 GitHub 保活仍可继续使用。将 `KEEP_ALIVE` 改为 `false` 可关闭 Worker 保活。

## 6. 积分仍不正确时如何核对

月榜每次读取数据库中的完整战绩重新计算，没有另一个等待更新的“积分缓存表”。按截图三局全为第一名、人数分别为 2、3、2，应得 7 分。

1. 更新完整游戏项目并确认 Render 部署成功，而不只是 GitHub 上传成功。
2. 打开游戏站 `/api/health`，确认返回 `version: "v15"`。
3. 打开月榜并刷新，展开“我的本月积分”，查看每个房间的人数、名次、积分。
4. 如果提示“服务器计分版本尚未更新”，说明当前前端连接的后端不含本次版本标记，应检查部署分支、Root Directory、构建/启动命令和部署日志。
5. 如果版本正确但逐局明细与历史战绩不同，需要核对实际服务器记录中的赢家、原始玩家身份、完成时间和重复记录。不能仅凭截图修改数据库或把总分强制设成 7。

本地测试覆盖 2+3+2=7、并列高分、原始 AI/托管真人身份、跨月边界和重复记录。当前开发环境没有线上数据库凭据，未直接修改线上玩家积分。

## 命令行部署入口（可选）

已提供 `worker.js`，无需在入口目录安装游戏依赖。先在 `gateway/wrangler.jsonc` 填入自己的 KV namespace ID，然后运行：

```sh
npx wrangler@4 login
npx wrangler@4 secret put GATEWAY_ADMIN_TOKEN --config gateway/wrangler.jsonc
npx wrangler@4 deploy --config gateway/wrangler.jsonc
```

独立入口包解压后，配置文件在当前目录，则把命令里的路径改成 `wrangler.jsonc`。开发者修改入口源代码后，应先在完整项目目录运行 `npm run build:gateway` 重新生成 `worker.js`。
