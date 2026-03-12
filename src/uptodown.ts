import { Env } from './types';
import { makeRes, extractTargetUrl } from './utils';

export const UPTODOWN_DOMAINS = ['uptodown.com', 'uptodown.net'];

export async function handleUptodownSearch(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const app = url.searchParams.get('app');

	if (!app) {
		return makeRes('Missing app parameter', 400);
	}

	let appUrl = app;
	if (appUrl.startsWith('http:/') && !appUrl.startsWith('http://')) {
		appUrl = appUrl.replace('http:/', 'http://');
	} else if (appUrl.startsWith('https:/') && !appUrl.startsWith('https://')) {
		appUrl = appUrl.replace('https:/', 'https://');
	}

	if (!appUrl.startsWith('http')) {
		// It's a package ID or app name, search for it
		const searchUrl = `https://en.uptodown.com/android/search/${app}`;
		const searchRes = await fetch(searchUrl, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
			},
		});

		if (searchRes.redirected && searchRes.url.includes('.uptodown.com/android') && !searchRes.url.includes('/search')) {
			appUrl = searchRes.url;
		} else if (searchRes.status === 200 || searchRes.status === 410) {
			const searchHtml = await searchRes.text();
			// Ignore the generic Uptodown App Store result if there are others
			const matches = Array.from(
				searchHtml.matchAll(/<a href="(https:\/\/[^"]+\.(?:en|cn)\.uptodown\.com\/android)"[^>]*>\s*<img[^>]+alt="([^"]+)"/g),
			);
			let foundUrl = null;
			for (const m of matches) {
				if (!m[2].includes('Uptodown App Store') && !m[2].includes('Uptodown App Store 图标')) {
					foundUrl = m[1];
					break;
				}
			}
			if (!foundUrl && matches.length > 0) {
				foundUrl = matches[0][1]; // Fallback to whatever is first
			}

			if (foundUrl) {
				appUrl = foundUrl;
			} else {
				return makeRes('App not found on Uptodown', 404);
			}
		} else {
			return makeRes('App not found', 404);
		}
	}

	// Ensure we are on the en.uptodown.com domain for consistent scraping
	try {
		const appUrlObj = new URL(appUrl);
		if (!appUrlObj.hostname.endsWith('uptodown.com')) {
			return makeRes('Invalid Uptodown URL', 400);
		}
		// Force en subdomain if not present? Actually many apps have their own subdomain like whatsapp.en.uptodown.com
	} catch (e) {
		return makeRes('Invalid URL', 400);
	}

	// Fetch app page to get version and data-file-id
	const appRes = await fetch(appUrl, {
		headers: {
			'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
		},
	});
	const appHtml = await appRes.text();

	// Scrape version
	// <span class="version">3.4</span>
	const versionMatch = appHtml.match(/class="version">([^<]+)</);
	const version = versionMatch ? versionMatch[1].trim() : 'unknown';

	// Scrape data-file-id
	// data-file-id="123456"
	const fileIdMatch = appHtml.match(/data-file-id="([^"]+)"/);
	if (!fileIdMatch) {
		return makeRes('Could not find download information on page', 500);
	}
	const fileId = fileIdMatch[1];

	// Fetch download page to get data-url
	// In some regions or new UI it's `/dw` instead of `/download`, or it's dynamically extracted from `data-download-extra="dw"`
	// Let's use `/dw` directly.
	let baseDownloadUrl = appUrl.replace(/\/$/, '');
	if (baseDownloadUrl.endsWith('/download')) {
		baseDownloadUrl = baseDownloadUrl.replace(/\/download$/, '/dw');
	} else if (!baseDownloadUrl.endsWith('/dw')) {
		baseDownloadUrl = `${baseDownloadUrl}/dw`;
	}
	const downloadPageUrl = baseDownloadUrl;

	const downloadRes = await fetch(downloadPageUrl, {
		headers: {
			'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
		},
	});
	const downloadHtml = await downloadRes.text();

	// Scrape data-url
	// <button id="detail-download-button" ... data-url="xxx" ...>
	const dataUrlMatch = downloadHtml.match(/id="detail-download-button"[^>]*data-url="([^"]+)"/i);
	if (!dataUrlMatch) {
		return makeRes('Could not find download URL on download page', 500);
	}
	const finalUrlKey = dataUrlMatch[1];
	const downloadUrl = `https://dw.uptodown.com/dwn/${finalUrlKey}`;

	// Construct proxied download link
	// We append `/v${version}.apk` so that Obtainium's default HTML source parser recognizes it as an APK link
	// AND can extract the version directly from the URL.
	const workerUrl = new URL(request.url);
	const path = workerUrl.pathname;
	const proxyPrefix = path.endsWith('/search') ? path.slice(1, -6) : '';
	const proxiedUrl = proxyPrefix
		? `${workerUrl.origin}/${proxyPrefix}${downloadUrl}/v${version}.apk`
		: `${workerUrl.origin}/${downloadUrl}/v${version}.apk`;
	const accept = request.headers.get('Accept') || '';
	if (accept.includes('application/json')) {
		return makeRes(
			JSON.stringify({
				version,
				downloadUrl: proxiedUrl,
				originalDownloadUrl: downloadUrl,
			}),
			200,
			{ 'Content-Type': 'application/json' },
		);
	} else {
		const html = `
<div class="version">${version}</div>
<a id="download" href="${proxiedUrl}">Download ${version}</a>
		`.trim();
		return makeRes(html, 200, { 'Content-Type': 'text/html;charset=utf-8' });
	}
}

export async function handleUptodownProxy(request: Request, env: Env, urlObj: URL): Promise<Response | null> {
	let { targetStr, proxyPrefix } = extractTargetUrl(urlObj.href.slice(urlObj.origin.length + 1), UPTODOWN_DOMAINS);

	let targetUrl: URL;
	try {
		// Strip the dummy /v1.2.3.apk we added for Obtainium's parser
		if (targetStr.match(/\/v[^\/]+\.apk$/)) {
			targetStr = targetStr.replace(/\/v[^\/]+\.apk$/, '');
		}
		targetUrl = new URL(targetStr);
	} catch (e) {
		return null;
	}

	const hostname = targetUrl.hostname;
	if (!hostname.endsWith('uptodown.com') && !hostname.endsWith('uptodown.net')) {
		return null;
	}
	// Forward headers
	const reqHeaders = new Headers(request.headers);
	reqHeaders.delete('host');
	reqHeaders.delete('cf-connecting-ip');
	reqHeaders.delete('cf-visitor');
	reqHeaders.delete('cf-ray');
	reqHeaders.delete('cf-ipcountry');

	// Uptodown might check Referer or User-Agent
	reqHeaders.set('Referer', 'https://en.uptodown.com/');

	const reqInit: RequestInit = {
		method: request.method,
		headers: reqHeaders,
		redirect: 'manual',
	};

	if (request.method !== 'GET' && request.method !== 'HEAD') {
		reqInit.body = request.body;
	}

	const res = await fetch(targetUrl.href, reqInit);

	// Handle Size Limit
	if (env.SIZE_LIMIT_MB && env.SIZE_LIMIT_MB > 0) {
		const contentLength = res.headers.get('content-length');
		if (contentLength) {
			const sizeBytes = parseInt(contentLength, 10);
			const limitBytes = env.SIZE_LIMIT_MB * 1024 * 1024;
			if (sizeBytes > limitBytes) {
				return Response.redirect(targetUrl.href, 302);
			}
		}
	}

	const resHeaders = new Headers(res.headers);

	// If redirecting, rewrite Location header so it goes through proxy
	if (resHeaders.has('location')) {
		let loc = resHeaders.get('location')!;
		try {
			const locUrl = new URL(loc);
			if (UPTODOWN_DOMAINS.some((d) => locUrl.hostname === d || locUrl.hostname.endsWith('.' + d))) {
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
	if (resContentLength && parseInt(resContentLength, 10) < 2 * 1024 * 1024) {
		body = await res.arrayBuffer();
	}

	return new Response(body, {
		status: res.status,
		headers: resHeaders,
	});
}
