const relDecoded = "http://localhost/gh/https://dw.uptodown.com/dwn/Vvj.../app.apk";
const regexStr = 'class="version">([^<]+)</div>';
console.log(relDecoded.match(new RegExp(regexStr)));
