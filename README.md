# 卡坦岛完整项目

完整上传、Render 配置和本轮加载修复请查看 [部署说明](DEPLOYMENT.md)。

本机安装依赖：`npm ci --include=dev`。

免配置演示：`npm run demo`，打开 `http://localhost:5174/demo.html`。

正式构建：`npm run build`；正式运行：配置环境变量和 `NODE_ENV=production` 后执行 `npm start`。

线上数据库和邮件配置继续使用 Render 中已有的值；`.env.example` 仅提供示例。

外部保活请查看 [保活说明](EXTERNAL-KEEP-ALIVE.md)。
