const regexStr = 'class="version">([^<]+)</div>';
const html = `<div class="version">10.59.0</div>
<a id="download" href="http://localhost/gh/https://dw.uptodown.com/dwn/Vvj.../#app.apk">Download 10.59.0</a>`;

const reg = new RegExp(regexStr);
const match = html.match(reg);
console.log("match:", match);
