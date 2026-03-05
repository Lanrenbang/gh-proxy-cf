export interface Env {
	SIZE_LIMIT_MB: number;
	WHITELIST: string;
	BLACKLIST: string;
	GITHUB_TOKEN?: string;
}

const PREFLIGHT_INIT = {
	status: 204,
	headers: new Headers({
		'access-control-allow-origin': '*',
		'access-control-allow-methods': 'GET,POST,PUT,PATCH,TRACE,DELETE,HEAD,OPTIONS',
		'access-control-allow-headers': '*',
		'access-control-max-age': '1728000',
	}),
};

function makeRes(body: any, status = 200, headers: HeadersInit = {}) {
	const h = new Headers(headers);
	h.set('access-control-allow-origin', '*');
	return new Response(body, { status, headers: h });
}

// target domains
const GITHUB_DOMAINS = [
	'github.com',
	'api.github.com',
	'raw.githubusercontent.com',
	'gist.githubusercontent.com',
	'avatars.githubusercontent.com',
	'camo.githubusercontent.com',
	'githubassets.com',
];

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const urlObj = new URL(request.url);
		let path = urlObj.pathname + urlObj.search;

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

		// Parse target url
		let targetStr = urlObj.href.slice(urlObj.origin.length + 1); // remove origin + leading slash

		const q = urlObj.searchParams.get('q');
		if (q) {
			return Response.redirect('https://' + urlObj.host + '/' + q, 301);
		}

		// Support subpath routing (e.g. /gh/https://github.com/... or /proxy/api.github.com/...)
		// Find the first occurrence of any known GitHub domain and strip the prefix.
		const domainsPattern = GITHUB_DOMAINS.map((d) => d.replace(/\./g, '\\.')).join('|');
		const extractRegex = new RegExp(`(?:^|/)(?:https?:/+)?(${domainsPattern})(?:/|\\?|$)`, 'i');
		const match = targetStr.match(extractRegex);
		let proxyPrefix = '';
		if (match) {
			const domain = match[1];
			const domainIdx = targetStr.toLowerCase().indexOf(domain.toLowerCase());

			const beforeDomain = targetStr.slice(0, domainIdx);
			proxyPrefix = beforeDomain.replace(/https?:\/+$/i, '');
			const domainAndAfter = targetStr.slice(domainIdx);

			if (beforeDomain.match(/https?:\/+$/i)) {
				const protoMatch = beforeDomain.match(/(https?:\/+)$/i);
				targetStr = protoMatch![1] + domainAndAfter;
			} else {
				targetStr = 'https://' + domainAndAfter;
			}
		}

		// Fix the protocol
		if (targetStr.startsWith('http:/') && !targetStr.startsWith('http://')) {
			targetStr = targetStr.replace('http:/', 'http://');
		} else if (targetStr.startsWith('https:/') && !targetStr.startsWith('https://')) {
			targetStr = targetStr.replace('https:/', 'https://');
		} else if (!targetStr.startsWith('http://') && !targetStr.startsWith('https://')) {
			targetStr = 'https://' + targetStr;
		}

		let targetUrl: URL;
		try {
			targetUrl = new URL(targetStr);
		} catch (e) {
			return makeRes('Invalid URL', 400);
		}

		// Check domain
		const hostname = targetUrl.hostname;
		let validDomain = false;
		for (const d of GITHUB_DOMAINS) {
			if (hostname === d || hostname.endsWith('.' + d)) {
				validDomain = true;
				break;
			}
		}
		if (!validDomain) {
			return makeRes('Domain not allowed', 403);
		}

		// Check Whitelist / Blacklist based on user/repo
		let repoPath = '';
		if (hostname === 'github.com' || hostname === 'api.github.com' || hostname === 'raw.githubusercontent.com') {
			const parts = targetUrl.pathname.split('/').filter(Boolean);
			if (hostname === 'api.github.com' && parts[0] === 'repos' && parts.length >= 3) {
				repoPath = `${parts[1]}/${parts[2]}`; // user/repo
			} else if ((hostname === 'github.com' || hostname === 'raw.githubusercontent.com') && parts.length >= 2) {
				repoPath = `${parts[0]}/${parts[1]}`;
			}
		}

		if (repoPath) {
			repoPath = repoPath.toLowerCase();
			if (env.WHITELIST) {
				const wl = env.WHITELIST.toLowerCase()
					.split(',')
					.map((s) => s.trim())
					.filter(Boolean);
				if (wl.length > 0 && !wl.includes(repoPath)) {
					return makeRes('Repository not in whitelist', 403);
				}
			}
			if (env.BLACKLIST) {
				const bl = env.BLACKLIST.toLowerCase()
					.split(',')
					.map((s) => s.trim())
					.filter(Boolean);
				if (bl.length > 0 && bl.includes(repoPath)) {
					return makeRes('Repository is blacklisted', 403);
				}
			}
		}

		// Forward headers
		const reqHeaders = new Headers(request.headers);
		reqHeaders.delete('host');
		reqHeaders.delete('cf-connecting-ip');
		reqHeaders.delete('cf-visitor');
		reqHeaders.delete('cf-ray');
		reqHeaders.delete('cf-ipcountry');

		// Inject GitHub PAT for API requests
		if (hostname === 'api.github.com' && env.GITHUB_TOKEN) {
			reqHeaders.set('Authorization', `Bearer ${env.GITHUB_TOKEN}`);
		}

		const reqInit: RequestInit = {
			method: request.method,
			headers: reqHeaders,
			redirect: 'manual',
		};

		// Only attach body if not GET or HEAD
		if (request.method !== 'GET' && request.method !== 'HEAD') {
			reqInit.body = request.body;
		}

		const res = await fetch(targetUrl.href, reqInit);

		// Handle Size Limit for large files
		if (env.SIZE_LIMIT_MB && env.SIZE_LIMIT_MB > 0) {
			const contentLength = res.headers.get('content-length');
			if (contentLength) {
				const sizeBytes = parseInt(contentLength, 10);
				const limitBytes = env.SIZE_LIMIT_MB * 1024 * 1024;
				if (sizeBytes > limitBytes) {
					// Redirect to the original URL
					return Response.redirect(targetUrl.href, 302);
				}
			}
		}

		// Forward response headers
		const resHeaders = new Headers(res.headers);

		// If redirecting, rewrite Location header so it goes through proxy
		if (resHeaders.has('location')) {
			let loc = resHeaders.get('location')!;
			try {
				const locUrl = new URL(loc);
				if (GITHUB_DOMAINS.some((d) => locUrl.hostname === d || locUrl.hostname.endsWith('.' + d))) {
					loc = 'https://' + urlObj.host + '/' + proxyPrefix + loc;
					resHeaders.set('location', loc);
				}
			} catch (e) {
				// relative url, pass through
			}
		}

		resHeaders.set('access-control-expose-headers', '*');
		resHeaders.set('access-control-allow-origin', '*');
		resHeaders.delete('content-security-policy');
		resHeaders.delete('content-security-policy-report-only');
		resHeaders.delete('clear-site-data');

		return new Response(res.body, {
			status: res.status,
			headers: resHeaders,
		});
	},
} satisfies ExportedHandler<Env>;
