function _nsTimeToString(nstime) {
  let string = nstime.toString().padStart(10, '0');
  return string.slice(0, string.length - 9) + '.' + string.slice(string.length - 9);
}

function _stringToNsTime(string) {
  let split = string.split('.');
  if (split.length == 1) split = [ split, '0' ];
  return BigInt(split[0]) * 1000000000n + BigInt(split[1].slice(0, 9).padEnd(9, '0'));
}

function _stringToUTCTimeString(string) {
  let split = string.split('.');
  return new Date(Number(split[0]) * 1000).toISOString().split('.')[0] + '.' + split[1] + 'Z';
}

module.exports = {
  _nsTimeToString,
  _stringToNsTime,
  _stringToUTCTimeString,
};
