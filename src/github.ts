import { Env } from './types';
import { makeRes, extractTargetUrl } from './utils';

export const GITHUB_DOMAINS = ['github.com', 'api.github.com', 'githubusercontent.com', 'githubassets.com'];

export async function handleGitHubProxy(request: Request, env: Env, urlObj: URL): Promise<Response | null> {
	let { targetStr, proxyPrefix } = extractTargetUrl(urlObj.href.slice(urlObj.origin.length + 1), GITHUB_DOMAINS);

	let targetUrl: URL;
	try {
		targetUrl = new URL(targetStr);
	} catch (e) {
		return makeRes('Invalid URL', 400);
	}

	const hostname = targetUrl.hostname;
	let validDomain = false;
	for (const d of GITHUB_DOMAINS) {
		if (hostname === d || hostname.endsWith('.' + d)) {
			validDomain = true;
			break;
		}
	}
	if (!validDomain) {
		return null; // Not a GitHub domain
	}

	// Check Whitelist / Blacklist based on user/repo
	let repoPath = '';
	if (hostname === 'github.com' || hostname === 'api.github.com' || hostname.endsWith('githubusercontent.com')) {
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

	let body: BodyInit | null = res.body;
	const resContentLength = res.headers.get('content-length');
	// If the response is small (less than 2MB), buffer it so Cloudflare calculates and sends the correct content-length header.
	// This prevents Dart's HttpClient from hanging waiting for chunked EOF on small API responses (like 404s).
	if (resContentLength && parseInt(resContentLength, 10) < 2 * 1024 * 1024) {
		body = await res.arrayBuffer();
	}

	return new Response(body, {
		status: res.status,
		headers: resHeaders,
	});
}
