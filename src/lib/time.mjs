export function unixNSIntToUnixSecString(unixNSInt) {
  if (typeof unixNSInt != 'bigint') {
    throw new Error(`unixNSInt not bigint: ${typeof unixNSInt}`);
  }
  
  if (unixNSInt < 0n) {
    return `-${unixNSIntToUnixSecString(-unixNSInt)}`;
  } else {
    const unixNSIntString = unixNSInt.toString().padStart(10, '0');
    
    return `${unixNSIntString.slice(0, -9)}.${unixNSIntString.slice(-9)}`;
  }
}

export function unixSecStringToUnixNSInt(unixSecString) {
  if (typeof unixSecString != 'string') {
    throw new Error(`unixSecString not bigint: ${typeof unixSecString}`);
  }
  
  let match;
  
  if (match = /^(-)?(\d+)(?:\.(\d+))?/.test(unixSecString)) {
    const [ sign, integer, fractional ] = match.slice(1);
    
    return (sign != null ? -1n : 1n) * (BigInt(integer) * 1_000_000_000n + BigInt(fractional));
  } else {
    throw new Error(`unixSecString invalid format: ${unixSecString}`);
  }
}

export function unixNSIntToUTCTimeString(unixNSInt) {
  if (typeof unixNSInt != 'bigint') {
    throw new Error(`unixNSInt not bigint: ${typeof unixNSInt}`);
  }
  
  const [ seconds, fraction ] = unixNSIntToUnixSecString(unixNSInt).split('.');
  
  return `${new Date(Number(seconds) * 1_000).toISOString().split('.')[0]}.${fraction}Z`;
}