# gh-proxy-cf

为 Obtainium 等工具打造的 Cloudflare Workers 版本的 GitHub 加速代理。

## 项目特点

1. **兼容 Obtainium**：完全支持 Obtainium 的 `GHReqPrefix` 配置，可正确代理 `api.github.com` 的请求，解决诸如 `gh-proxy` 等项目遇到 API 就会返回 404 的问题。
2. **突破 GitHub API 速率限制**：因为安全限制，Obtainium 在开启代理时会**自动清除**用户输入的 PAT (Personal Access Token)，从而导致代理请求是匿名的并极易触发公共服务的 60次/小时 速率限制。本项目支持在 Cloudflare 后台配置 `GITHUB_TOKEN` 环境变量，自动为您的所有代理请求带上您的个人 Token，享受 5000次/小时 的高额度。
3. **安全与资源管控**：支持配置 白名单/黑名单 和 文件大小限制，防止您的自建节点被他人滥用或消耗过多 Cloudflare 额度。

## 部署与使用

### 1. 基础部署

推荐使用 Wrangler 进行部署，或者直接在 Cloudflare Workers 后台新建一个 Worker，将 `src/index.ts` 的代码粘贴进去。

```bash
# 如果使用命令行部署：
npm install
npm run deploy
```

### 2. 在 Obtainium 中使用

在 Obtainium 的 GitHub 设置中，找到 `GitHub Release 请求前缀` (GHReqPrefix) 选项，填入您的 Worker 域名，不需要 `https://`，例如：
`your-worker-name.your-subdomain.workers.dev`

### 3. 配置环境变量 (可选但强烈建议)

在 Cloudflare Workers 后台 -> **Settings (设置)** -> **Variables and Secrets (变量和机密)** 中，您可以添加以下变量：

- `GITHUB_TOKEN`: 填入您的 GitHub Personal Access Token (PAT)。强烈建议配置，这可以彻底解决 Obtainium 在使用代理时的速率限制问题。**必须创建为机密而不是变量**
- `SIZE_LIMIT_MB`: 限制允许代理下载的最大文件（单位：MB）。超过此大小的请求将被 302 重定向到原 GitHub 地址。填 `0` 或不填表示不限制。
- `WHITELIST`: 仓库白名单，多个用逗号分隔。例如 `username1/repo1,username2/repo2`。配置后只允许代理这些仓库。
- `BLACKLIST`: 仓库黑名单，多个用逗号分隔。配置后这些仓库将被拒绝访问。

> 注：`WHITELIST` 和 `BLACKLIST` 不能同时为空以达到部分限制的效果；若只需全开，则保留为空即可。

## 相关项目
- [Obtainium](https://https://github.com/ImranR98/Obtainium)
- [HubProxy](https://github.com/sky22333/hubproxy)
- [gh-proxy](https://github.com/hunshcn/gh-proxy)

## 通过捐赠支持我
[![BuyMeACoffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/bobbynona) [![Ko-Fi](https://img.shields.io/badge/Ko--fi-F16061?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/bobbynona) [![USDT(TRC20)/Tether](https://img.shields.io/badge/Tether-168363?style=for-the-badge&logo=tether&logoColor=white)](https://github.com/Lanrenbang/.github/blob/5b06b0b2d0b8e4ce532c1c37c72115dd98d7d849/custom/USDT-TRC20.md) [![Litecoin](https://img.shields.io/badge/Litecoin-A6A9AA?style=for-the-badge&logo=litecoin&logoColor=white)](https://github.com/Lanrenbang/.github/blob/5b06b0b2d0b8e4ce532c1c37c72115dd98d7d849/custom/Litecoin.md)

## 许可
本项目按照 `LICENSE` 文件中的条款进行分发。
