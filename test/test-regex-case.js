const GITHUB_DOMAINS = ['api.github.com'];
const domainsPattern = GITHUB_DOMAINS.map(d => d.replace(/\./g, '\\.')).join('|');
const extractRegex = new RegExp(`(?:^|/)(?:https?:/+)?(${domainsPattern})(?:/|\\?|$)`, 'i');

let targetStr = "proxy/API.GITHUB.COM/repos";
const match = targetStr.match(extractRegex);
if (match) {
    const domainIdx = targetStr.toLowerCase().indexOf(match[1].toLowerCase());
    console.log("domainIdx:", domainIdx);
}
