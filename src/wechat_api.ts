import { makeRes } from './utils';

export async function handleWechatApi(request: Request): Promise<Response | null> {
	const urlObj = new URL(request.url);
	const path = urlObj.pathname;

	if (!path.includes('/wechat') && !path.includes('/wechat/version')) {
		return null;
	}

	try {
		const headers = new Headers();
		headers.set('User-Agent', 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.43 Mobile Safari/537.36');

		const listRes = await fetch('https://weixin.qq.com/updates?platform=android', {
			headers,
			redirect: 'follow',
		});

		if (!listRes.ok) {
			return makeRes('Failed to fetch version list', 500);
		}

		const html = await listRes.text();

		const versionMatch = html.match(/<li[^>]*class="[^"]*faq_section_sublist_item[^"]*"[^>]*>.*?<span[^>]*class="[^"]*version[^"]*"[^>]*>(\d+\.\d+\.\d+)<\/span>/);

		if (!versionMatch || !versionMatch[1]) {
			return makeRes('Failed to extract version', 500);
		}

		const version = versionMatch[1];
		const redirectUrl = `https://weixin.qq.com/updates?platform=android&version=${version}`;

		return Response.redirect(redirectUrl, 302);
	} catch (error) {
		return makeRes('Internal server error', 500);
	}
}
