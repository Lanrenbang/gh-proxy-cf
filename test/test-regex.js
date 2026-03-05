const GITHUB_DOMAINS = [
	'github.com',
	'api.github.com',
	'raw.githubusercontent.com',
	'gist.githubusercontent.com',
	'avatars.githubusercontent.com',
	'camo.githubusercontent.com',
	'githubassets.com',
];
const domainsPattern = GITHUB_DOMAINS.map(d => d.replace(/\./g, '\\.')).join('|');
const extractRegex = new RegExp(`(?:^|/)(?:https?:/+)?(${domainsPattern})(?:/|\\?|$)`, 'i');

const testCases = [
    "gh/api.github.com/repos/soupslurpr/AppVerifier/releases?per_page=100",
    "gh/https://api.github.com/repos/x",
    "https://api.github.com/repos/x",
    "proxy/prefix/github.com/a/b",
    "proxy/http:/github.com/a/b",
    "some-other-domain.com/abc",
    "github.com.tw/xyz", // Should not match
    "gh/github.com/a/b?q=1",
    "api.github.com"
];

for (const t of testCases) {
    let targetStr = t;
    const match = targetStr.match(extractRegex);
    if (match) {
        const domain = match[1];
        const domainIdx = targetStr.indexOf(domain);
        
        const beforeDomain = targetStr.slice(0, domainIdx);
        const domainAndAfter = targetStr.slice(domainIdx);
        
        if (beforeDomain.match(/https?:\/+$/i)) {
            const protoMatch = beforeDomain.match(/(https?:\/+)$/i);
            targetStr = protoMatch[1] + domainAndAfter;
        } else {
            targetStr = 'https://' + domainAndAfter;
        }
        console.log(`[MATCH] ${t} => ${targetStr}`);
    } else {
        console.log(`[NO MATCH] ${t}`);
    }
}
