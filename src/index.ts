import { Env } from './types';
import { PREFLIGHT_INIT, makeRes } from './utils';
import { handleGitHubProxy } from './github';
import { handleUptodownSearch, handleUptodownProxy } from './uptodown';

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const urlObj = new URL(request.url);
		const path = urlObj.pathname;

		// If root, show a simple message
		if (path === '/' || path === '') {
			return makeRes('gh-proxy-cf is running. Usage: https://worker.dev/https://github.com/...', 200, {
				'content-type': 'text/plain;charset=utf-8',
			});
		}

		// preflight
		if (request.method === 'OPTIONS' && request.headers.has('access-control-request-headers')) {
			return new Response(null, PREFLIGHT_INIT);
		}

		// Handle /search endpoint
		if (path === '/search' || path.endsWith('/search')) {
			// Auth check
			if (env.PROXY_AUTH_TOKEN) {
				const authHeader = request.headers.get('X-Proxy-Auth');
				if (authHeader !== env.PROXY_AUTH_TOKEN) {
					return makeRes('Forbidden: Invalid X-Proxy-Auth header', 403);
				}
			}

			const source = urlObj.searchParams.get('source');
			if (source === 'uptodown') {
				return await handleUptodownSearch(request, env);
			}
			return makeRes('Invalid source', 400);
		}

		// Try GitHub proxy
		const githubRes = await handleGitHubProxy(request, env, urlObj);
		if (githubRes) {
			return githubRes;
		}

		// Try Uptodown proxy
		const uptodownRes = await handleUptodownProxy(request, env, urlObj);
		if (uptodownRes) {
			return uptodownRes;
		}

		return makeRes('Not Found or Domain not allowed', 404);
	},
} satisfies ExportedHandler<Env>;
