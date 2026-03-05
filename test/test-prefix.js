function getProxyPrefix(targetStr, match) {
    const domain = match[1];
    const domainIdx = targetStr.toLowerCase().indexOf(domain.toLowerCase());
    const beforeDomain = targetStr.slice(0, domainIdx);
    return beforeDomain.replace(/https?:\/+$/i, '');
}

const GITHUB_DOMAINS = ['api.github.com'];
const domainsPattern = GITHUB_DOMAINS.map(d => d.replace(/\./g, '\\.')).join('|');
const extractRegex = new RegExp(`(?:^|/)(?:https?:/+)?(${domainsPattern})(?:/|\\?|$)`, 'i');

console.log(getProxyPrefix("gh/api.github.com/repos", "gh/api.github.com/repos".match(extractRegex)));
console.log(getProxyPrefix("gh/https://api.github.com/repos", "gh/https://api.github.com/repos".match(extractRegex)));
console.log(getProxyPrefix("https://api.github.com/repos", "https://api.github.com/repos".match(extractRegex)));
console.log(getProxyPrefix("proxy/path/api.github.com", "proxy/path/api.github.com".match(extractRegex)));

