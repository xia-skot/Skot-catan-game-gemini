# v31 带宽查询与切换

使用 catan-complete-v31.zip。已有 v30 只需更新 gateway/worker.js；v31 会在月初成功补采后恢复旧的不完整标记。保留 v30 自动模式保存前校验。具体步骤见 DEPLOYMENT.md 的 v31 章节，账单填写和数据库查询位置见 v30 章节。

## 只需做这些

1. 解压完整包，将其中内容更新到原 GitHub 游戏仓库，包括 .github、gateway、render-entry。package.json 在仓库根目录，不要多套一层目录。包内不含真实 API Key。
2. Render 的 skot-game 服务仍关联同一仓库，但 Root Directory 为 render-entry，Build Command 为 npm install，Start Command 为 npm start。入口变量 ROUTING_API_URL=https://skot.catan-game.workers.dev/api/route，FALLBACK_GAME_URL=https://skot-game01.onrender.com。
3. skot-game01、02、03 的 Root Directory 留空，Build Command 为 npm ci && npm run build，Start Command 为 npm start。三个游戏服务都重新部署，保留各自已有环境变量。
4. Cloudflare 的 skot Worker 编辑器内，用完整包 gateway/worker.js 全文替换并部署；不是 worker.ts。不必重建 Worker、KV 或密钥。
5. 保留 ROUTING KV 绑定、GATEWAY_ADMIN_TOKEN Secret、KEEP_ALIVE=true、ENTRY_ORIGIN=https://skot-game.onrender.com 和每五分钟的 Cron。三个 API Key 必须是 Secret，名称与下面表格一致。
6. 每个游戏服务设置 GATEWAY_URL=https://skot.catan-game.workers.dev，GATEWAY_ADMIN_TOKEN 与 Worker 一致；游戏站的 MONGODB_URI 和强随机 JWT_SECRET 三站一致。不要把这些密钥上传 GitHub。
7. 先保持固定默认网址或按旬模式。等下次 Cron 后，在管理中心 → 数据中心 → 网址与流量里点击刷新带宽状态。采集每十五分钟最多一次，首次预计等五至十五分钟，KV 同步还可能延迟。
8. 查询成功后，若提示缺少月初记录，从对应 Render 工作区 Billing 核对本月累计 GB，在相应游戏站的“账单本月总用量”中补录。缺少完整记录不会参与自动分配。新月份自动新建账本。
9. 三站状态正常后，选择“按剩余带宽”，核对实际月额度，保留适当预留量，再保存入口设置。默认估算额度 5 GB、预留 0.7 GB，可按实际情况调整。默认网址必须为游戏站01，不能填 skot-game 入口自身。
10. 关闭 VPN，用手机从 https://skot-game.onrender.com 进入，检查登录、资源加载、游戏交互和桌面入口。不要把 workers.dev 发给普通玩家。

## 已写入的映射

| 游戏站 | Service ID | Cloudflare Secret |
| --- | --- | --- |
| skot-game01.onrender.com | srv-datsn27lk1mc73cr6er0 | RENDER_API_KEY_01 |
| skot-game02.onrender.com | srv-datt010jo6nc73ccabfg | RENDER_API_KEY_02 |
| skot-game03.onrender.com | srv-datsqhp7lnhs73ek8kng | RENDER_API_KEY_03 |

不需要再添加 Service ID 变量。不同账号创建的 Key 必须对应正确站点；服务重新创建导致 ID 改变时，需要更新 gateway/bandwidth.ts 并重新打包 Worker。

## 显示含义与边界

- 用量是 Render metrics 的工作区服务累计估算，不是账单余额 API，也不是实时统计。以 Render Billing 为准。接口按小时统计且存在延迟，预留量不能保证绝不超额。
- Hobby 指标只保留最近七天。本实现每十五分钟抓取最近六天，按时间点去重，按 UTC 自然月保存到 KV；中途接入或采集中断过久需要补录。若实际账期不同，不应把此估算当作账期余额。
- 初次采集前已经删除的服务、数据库等其他用量不保证包含，需核对 Billing。每工作区最多自动查询八个服务，超出会显示错误，不会假装完整。补录后延迟到账的历史样本可能导致保守高估。
- 相同工作区的服务共享额度，不能把三个服务当成三份额度。这里只按用户提供的三个账号权限分别查询，不改变 Render 的限制或服务条款。
- 查询失败、密钥无权、样本超过三小时、状态查询超过一小时、历史缺失或健康检查失败时，不选该站。刷新按钮读取最近一次采集结果，不强制即时调用 Render API。
- 当前站未到阈值时继续使用，达到阈值后按 01、02、03 顺序选择符合条件的站。不打断已打开的游戏，也不搬迁房间，因此旧站仍可能继续产生流量。
- 明确没有合格站时入口返回不可用。Worker 网络完全不可达时，Render 入口仍沿用默认游戏站故障回退；这不是严格的账单限额保护。
- 指定 site 的旧房间链接和直接访问游戏域名不会受自动额度分配限制。自动切换只控制普通入口的新访问。
- 保活只请求健康接口，不加载贴图音频。冷启动、平台限制和网络故障可能造成失败，不保证永不休眠。带宽采集即使 KEEP_ALIVE=false 仍会运行并探测三站。

## 验证与故障

401/403：核对对应账号 API Key 权限；服务编号与网址不匹配：核对服务是否重建；等待采集：查看 Worker Cron 日志与 ROUTING 绑定。不要公开 Key 截图或把 Key 放到浏览器代码。

本地已验证模拟 API 的去重、单位换算、补录、阈值选择、鉴权和不可用回退，以及手机/桌面界面。没有读取你的线上 Secret，线上权限、实际账单和手机网络需部署后核对。

官方接口：https://api-docs.render.com/reference/get-bandwidth

指标保留与延迟：https://render.com/docs/service-metrics

带宽计费口径：https://render.com/docs/outbound-bandwidth
