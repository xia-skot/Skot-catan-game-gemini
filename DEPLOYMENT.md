# 完整项目部署说明

这是完整的可构建项目，包含运行源码、全部本地素材、数据库接口、依赖锁文件、Render 配置及外部保活工作流。无需先叠加之前的 v5/v6/v7 增量包。

## 上传到现有项目

1. 解压完整项目包。
2. 将项目内容按原目录结构更新到 GitHub 仓库根目录。根目录必须直接看到 `package.json`、`server.ts`、`src`、`public`，不要多套一层压缩包名称的文件夹。
3. 文件较多，建议通过 GitHub Desktop 一次提交；网页分批上传时先放入新分支，全部上传后再合并到 `main`，避免 Render 在只上传一部分时开始部署。
4. `.github/workflows/render-keep-alive.yml` 是外部保活文件，必须保留目录层级。你已上传的同名文件可保留。
5. Render 使用原服务和原环境变量，构建命令为 `npm ci --include=dev && npm run build`，启动命令为 `npm start`，`NODE_ENV` 为 `production`。`--include=dev` 确保构建工具齐全。
6. 保留原有 MongoDB、JWT、邮件和管理员配置；完整包不包含真实密码、数据库连接串或线上账号。不要把 `.env.example` 的占位值覆盖到现有 Render 环境变量。
7. 等 Render 显示部署成功后再打开网站。先正常刷新，不必清空账号、存档或浏览器全部数据。

## 本轮加载问题

线上检查的 28 张图片和 6 个音频均返回 HTTP 200，内容校验与本地一致。背景音乐本次下载约 13.2 秒，超过程序原先统一的 12 秒截止时间，会造成慢网下完整资源加载失败。

本轮将图片下载期限调整为 30 秒、音频为 60 秒，仍保留失败提示与重试。没有跳过未完成素材，也没有清理账号或存档。实际速度仍受网络影响，13.2 秒是本次检测结果，不能代表每台手机的固定速度。

另外补齐了锁文件缺少的 5 个 Windows x64 构建组件条目，保持现有依赖版本不变。已在全新解压目录完成 `npm ci --include=dev`、类型检查、正式构建和正式启动检查，不依赖旧工作目录的已安装依赖。

原始检查报告为 `DEPLOYMENT-ASSET-CHECK.json`。可运行 `node scripts/check-deployed-assets.mjs` 重新检查部署地址；这会重新下载一遍素材进行校验。

## 本机运行

使用 Node.js 22 LTS 或兼容版本，先运行 `npm ci --include=dev`。

- 免配置演示：`npm run demo`，访问 `http://localhost:5174/demo.html`。
- 正常开发：配置自己的环境变量后运行 `npm run dev`。
- 构建：`npm run build`。
- 正式启动：完成构建并设置 `NODE_ENV=production` 后运行 `npm start`。

`node_modules`、`dist`、本机日志和测试截图未包含在包中，它们会在安装、构建和检查时生成。这不影响项目完整性。
