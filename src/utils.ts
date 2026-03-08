export const PREFLIGHT_INIT = {
	status: 204,
	headers: new Headers({
		'access-control-allow-origin': '*',
		'access-control-allow-methods': 'GET,POST,PUT,PATCH,TRACE,DELETE,HEAD,OPTIONS',
		'access-control-allow-headers': '*',
		'access-control-max-age': '1728000',
	}),
};

export function makeRes(body: any, status = 200, headers: HeadersInit = {}) {
	const h = new Headers(headers);
	h.set('access-control-allow-origin', '*');
	return new Response(body, { status, headers: h });
}

export function extractTargetUrl(targetStr: string, knownDomains: string[]): { targetStr: string; proxyPrefix: string } {
	// Match exactly the known domain, or subdomains (ending with .known-domain)
	const domainsPattern = knownDomains.map((d) => `(?:[a-zA-Z0-9-]+\\.)*` + d.replace(/\./g, '\\.')).join('|');
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

	// Basic protocol fix
	if (targetStr.startsWith('http:/') && !targetStr.startsWith('http://')) {
		targetStr = targetStr.replace('http:/', 'http://');
	} else if (targetStr.startsWith('https:/') && !targetStr.startsWith('https://')) {
		targetStr = targetStr.replace('https:/', 'https://');
	} else if (!targetStr.startsWith('http://') && !targetStr.startsWith('https://')) {
		targetStr = 'https://' + targetStr;
	}

	return { targetStr, proxyPrefix };
}
