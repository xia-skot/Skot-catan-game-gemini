# 无人访问时的外部保活

这份定时任务由 GitHub 的服务器运行，每 5 分钟访问一次
`https://catan-game02.onrender.com/api/health`。
不要求浏览器打开，不要求有保留房间，也不要求你的电脑开机。
即使 Render 已经休眠，新的外部请求也能触发启动。

## 启用

1. 在 GitHub 的公开仓库中添加 `.github/workflows/render-keep-alive.yml`，保存到默认分支。可以使用游戏的公开仓库，也可以建立单独的公开保活仓库，仅上传这一个文件，无需公开私有游戏源码。
2. 打开仓库的 Actions 页面，按页面提示允许工作流运行。
3. 打开“网站外部保活”，点击“Run workflow”手动运行一次。
4. 确认出现绿色成功标记、日志显示“健康检查成功”。之后会按时间表自动运行。手动成功只验证当前一次访问，定时是否启用还应检查随后有自动运行记录。

当前文件为保护免费额度，仅在公开仓库运行；放进私有仓库会跳过。
公开仓库的标准 GitHub 执行器免费；私有仓库运行会使用 Actions 分钟额度。
仓库级 Actions 设置或组织策略可能需要由仓库管理员启用。

## 范围和成本

- 每 30 天约 8,640 次正常健康请求；失败时最多一次重试，不访问棋盘、图片、声音或数据库状态接口。
- 正常响应正文 `{"status":"ok"}` 为 15 字节，30 天正文约 0.13 MB；HTTP 响应头及其他网络计量另计。若按每次响应总共约 1 KB 粗估，约 8.64 MB/月，不是实际账单测量。
- 任务没有提交代码的步骤，不会因每次保活而重复部署 Render。
- GitHub 定时任务可能延迟或丢失；公开仓库连续 60 天无仓库活动时，定时任务会自动停用，需要重新启用。因而这是免费、尽量减少休眠的方案，不是严格不间断保证。
- Render 自身重启、部署、暂停和额度限制仍会影响网站。活动房间目前保存在进程内存中，外部保活不提供房间恢复。
- 本地准备好文件不等于线上已启用；需要完成上面的上传和运行检查。

说明依据：

- https://render.com/docs/free
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
- https://docs.github.com/en/billing/concepts/product-billing/github-actions
