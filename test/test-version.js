const regexStr = "([0-9])([0-9]{2})([0-9]{3})\\.apk$";
const reg = new RegExp(regexStr);
const match = "200149.apk".match(reg);
// Obtainium doesn't do math or parseInt() on match groups.
// But wait! If the APK version is "2.0.149", Android `versionName` might be `2.0.149`,
// while the filename is `200149`.
// If we extract `2`, `00`, `149` -> `2.00.149`.
// When Obtainium compares `2.00.149` with the Android OS version `2.0.149` ...
// Obtainium's `reconcileVersionDifferences` method actually normalizes versions!
// It strips leading zeros!
console.log(match);
