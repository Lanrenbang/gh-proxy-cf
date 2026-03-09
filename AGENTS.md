# Cloudflare Workers

STOP. Your knowledge of Cloudflare Workers APIs and limits may be outdated. Always retrieve current documentation before any Workers, KV, R2, D1, Durable Objects, Queues, Vectorize, AI, or Agents SDK task.

## Docs

- https://developers.cloudflare.com/workers/
- MCP: `https://docs.mcp.cloudflare.com/mcp`

For all limits and quotas, retrieve from the product's `/platform/limits/` page. eg. `/workers/platform/limits`

## Commands

| Command | Purpose |
|---------|---------|
| `bunx wrangler dev` | Local development |
| `bunx wrangler deploy` | Deploy to Cloudflare |
| `bunx wrangler types` | Generate TypeScript types |

Run `wrangler types` after changing bindings in wrangler.jsonc.

## Node.js Compatibility

https://developers.cloudflare.com/workers/runtime-apis/nodejs/

## Errors

- **Error 1102** (CPU/Memory exceeded): Retrieve limits from `/workers/platform/limits/`
- **All errors**: https://developers.cloudflare.com/workers/observability/errors/

## Product Docs

Retrieve API references and limits from:
`/kv/` · `/r2/` · `/d1/` · `/durable-objects/` · `/queues/` · `/vectorize/` · `/workers-ai/` · `/agents/`

---

## 经验记录：关于 Obtainium 和 hubproxy 的配合机制

**1. 为什么原版 gh-proxy 不能配合 Obtainium，而 hubproxy 可以？**
- 原版 `gh-proxy` 仅支持特定的文件下载正则表达式（如 release, blob, raw 等），**完全没有匹配 `api.github.com` 的路由**。当 Obtainium 发起 API 请求时，原版 `gh-proxy` 会将请求 fallback 到静态资源站点，导致返回 `404 Not Found`。
- `hubproxy` 的路由包含了 `api.github.com` 等所有 GitHub 需要的 API 路径，能够正确转发。

**2. 关于使用代理时 Personal Access Token (PAT) 无法传递的问题**
- **这是 Obtainium 自身的硬编码安全机制，并非 hubproxy 的 Bug。** 经源码分析（`lib/app_sources/github.dart` 约 300 行），Obtainium 开发者为了防止用户的 PAT 泄露给不受信任的第三方代理服务器，当检测到配置了 `GHReqPrefix`（即代理地址）时，会强制将 token 置空 (`creds = null`)。
- **解决方案**：由于请求发往我们的 Cloudflare Worker，我们可以在 Cloudflare Worker 的**环境变量中配置 `GITHUB_TOKEN`**。Worker 收到针对 `api.github.com` 的请求时，会自动向 Headers 注入 `Authorization: Bearer <TOKEN>`，从而完美解决被公共 IP 频繁调用导致的 Rate Limit 问题。

**3. 文件大小限制与黑白名单**
- `gh-proxy` 的 Python 版本才支持文件大小限制和黑白名单。
- 在 Cloudflare Worker 中，我们可以通过读取 `fetch` 响应的 `Content-Length` Header 来实现大小限制（超过则进行 `302 Redirect` 到 GitHub 源站）。
- 黑白名单可以直接通过解析 URL path 中的 `username/repo` 配合环境变量 `WHITELIST` 和 `BLACKLIST` 实现拦截，无需强依赖 D1 数据库即可提供轻量高效的管控。


**4. 对 Uptodown 等其他第三方商店的 HTML Source 抓取支持**
- **单斜杠截断陷阱**：如果用户通过拼接查询参数 `?app=https://xxx` 传递 URL，一些客户端在解析代理路径时会将 `https://` 错误转义为 `https:/` (单斜杠)。Worker 解析参数时必须加上手动补全斜杠的容错逻辑。
- **包名搜索的安全拦截**：Uptodown 使用了 Cloudflare Bot Protection，如果在服务端直接 `fetch` 它的 `search/{package}` 路由，极容易触发 410 (Gone) 或者验证码。**经验是**：避免在服务端通过包名搜索跳转，直接引导用户传递应用的主页绝对 URL。
- **HTML Source 的版本号提取限制**：在 Obtainium 中，`HTML Webpage` 来源默认**仅针对**下载链接本身（即正则提取出的 `href`）进行版本号解析，而不是针对整个页面的 HTML 文本进行解析！（除非用户主动勾选了 `versionExtractWholePage`，但这个选项非常深）。如果用户只填了基于页面标签的正则（例如 `class="version">...`），会导致正则表达式在链接文本上匹配失败，从而抛出 `NoVersionFound (无法确定发行版本号)` 或 `NoReleasesFound` 的错误。
- **完美解法：把版本号和伪后缀注入下载链接**：由于我们需要将第三方的动态下载链接（例如 `dw.uptodown.com/dwn/xxxxx`）伪装成合法的 APK 链接以通过 Obtainium 的默认拦截器（默认匹配 `.apk$`），同时还要解决版本号难以提取的问题，最好的策略是在 Worker 生成代理 URL 时，主动在尾部拼接 `.../v{版本号}.apk`（例如 `.../dwn/xxxxx/v10.59.0.apk`）。这样不仅满足了 `.apk` 后缀要求免填 `Custom Link Filter RegEx`，还能让用户使用极其简单的正则 `v([^/]+)\.apk` 直接从链接中精准截取版本号。当实际下载请求打到 Worker 时，再将伪后缀截断还原即可，一举两得。