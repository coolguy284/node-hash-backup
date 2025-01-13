const DEFAULT_INTEGER_SEPARATOR_INTERVAL = 3;
const DEFAULT_INTEGER_SEPARATOR_CHARACTER = '_';
const DEFAULT_DECIMAL_SEPARATOR_INTERVAL = 3;
const DEFAULT_DECIMAL_SEPARATOR_CHARACTER = '_';

function intStringToStringWithSeparator(intString, {
  separatorInterval = DEFAULT_INTEGER_SEPARATOR_INTERVAL,
  separatorCharacter = DEFAULT_INTEGER_SEPARATOR_CHARACTER,
} = {}) {
  let digitChunks = [];
  
  for (let digitsFromEnd = 0; digitsFromEnd < intString.length; digitsFromEnd += separatorInterval) {
    const stringEnd = intString.length - digitsFromEnd;
    const stringStart = Math.max(stringEnd - separatorInterval, 0);
    digitChunks.unshift(intString.slice(stringStart, stringEnd));
  }
  
  return digitChunks.join(separatorCharacter);
}

export function integerToStringWithSeparator(integer, {
  separatorInterval = DEFAULT_INTEGER_SEPARATOR_INTERVAL,
  separatorCharacter = DEFAULT_INTEGER_SEPARATOR_CHARACTER,
} = {}) {
  if (!Number.isSafeInteger(integer)) {
    throw new Error(`integer not integer: ${integer}`);
  }
  
  if (!Number.isSafeInteger(separatorInterval) || separatorInterval <= 0) {
    throw new Error(`separatorInterval not positive integer: ${separatorInterval}`);
  }
  
  if (typeof separatorCharacter != 'string') {
    throw new Error(`separatorCharacter not string: ${typeof separatorCharacter}`);
  }
  
  if (integer < 0) {
    return `-${integerToStringWithSeparator(-integer, { separatorInterval, separatorCharacter })}`;
  } else {
    const intString = integer + '';
    return intStringToStringWithSeparator(intString);
  }
}

function decimalStringToStringWithSeparator(decimalString, {
  separatorInterval = DEFAULT_DECIMAL_SEPARATOR_INTERVAL,
  separatorCharacter = DEFAULT_DECIMAL_SEPARATOR_CHARACTER,
} = {}) {
  if (typeof decimalString != 'string') {
    throw new Error(`decimalString not string: ${typeof decimalString}`);
  }
  
  if (decimalString != 'Infinity' && decimalString != 'NaN' && !/^(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/.test(decimalString)) {
    throw new Error(`decimalString invalid format: ${decimalString}`);
  }
  
  if (decimalString == 'Infinity' || decimalString == 'NaN') {
    return decimalString;
  }
  
  if (!Number.isSafeInteger(separatorInterval) || separatorInterval <= 0) {
    throw new Error(`separatorInterval not positive integer: ${separatorInterval}`);
  }
  
  if (typeof separatorCharacter != 'string') {
    throw new Error(`separatorCharacter not string: ${typeof separatorCharacter}`);
  }
  
  let digitChunks = [];
  
  for (let stringStart = 0; stringStart < decimalString.length; stringStart += separatorInterval) {
    const stringEnd = Math.min(stringStart + separatorInterval, decimalString.length);
    digitChunks.unshift(decimalString.slice(stringStart, stringEnd));
  }
  
  return digitChunks.join(separatorCharacter);
}

export function numberStringToStringWithSeparator(numberString, {
  integerSeparatorInterval = DEFAULT_INTEGER_SEPARATOR_INTERVAL,
  integerSeparatorCharacter = DEFAULT_INTEGER_SEPARATOR_CHARACTER,
  decimalSeparatorInterval = DEFAULT_DECIMAL_SEPARATOR_INTERVAL,
  decimalSeparatorCharacter = DEFAULT_DECIMAL_SEPARATOR_CHARACTER,
} = {}) {
  if (typeof numberString != 'string') {
    throw new Error(`numberString not string: ${typeof numberString}`);
  }
  
  if (!Number.isSafeInteger(integerSeparatorInterval) || integerSeparatorInterval <= 0) {
    throw new Error(`integerSeparatorInterval not positive integer: ${integerSeparatorInterval}`);
  }
  
  if (typeof integerSeparatorCharacter != 'string') {
    throw new Error(`integerSeparatorCharacter not string: ${typeof integerSeparatorCharacter}`);
  }
  
  if (!Number.isSafeInteger(decimalSeparatorInterval) || decimalSeparatorInterval <= 0) {
    throw new Error(`decimalSeparatorInterval not positive integer: ${decimalSeparatorInterval}`);
  }
  
  if (typeof decimalSeparatorCharacter != 'string') {
    throw new Error(`decimalSeparatorCharacter not string: ${typeof decimalSeparatorCharacter}`);
  }
  
  if (numberString.startsWith('--')) {
    throw new Error(`numberString invalid format: ${numberString}`);
  } else if (numberString.startsWith('-')) {
    return '-' + numberStringToStringWithSeparator(
      numberString.slice(1),
      {
        integerSeparatorInterval,
        integerSeparatorCharacter,
        decimalSeparatorInterval,
        decimalSeparatorCharacter,
      },
    );
  }
  
  let match;
  
  if (numberString == 'Infinity' || numberString == 'NaN') {
    return numberString;
  } else if ((match = /^(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/.exec(numberString)) != null) {
    let [ intString, decimalString, exponent ] = match.slice(1);
    
    intString = intStringToStringWithSeparator(intString, {
      separatorInterval: integerSeparatorInterval,
      separatorCharacter: integerSeparatorCharacter,
    });
    
    if (decimalString != null) {
      decimalString = decimalStringToStringWithSeparator(decimalString, {
        separatorInterval: decimalSeparatorInterval,
        separatorCharacter: decimalSeparatorCharacter,
      });
    }
    
    /* eslint-disable @stylistic/indent */
    
    return intString +
      (
        decimalString != null ?
          `.${decimalString}` :
          ''
      ) + (
        exponent != null ?
          `e${exponent}` :
          ''
      );
    
    /* eslint-enable @stylistic/indent */
  } else {
    throw new Error(`numberString invalid format: ${numberString}`);
  }
}

export function numberToStringWithSeparator(number, {
  integerSeparatorInterval = DEFAULT_INTEGER_SEPARATOR_INTERVAL,
  integerSeparatorCharacter = DEFAULT_INTEGER_SEPARATOR_CHARACTER,
  decimalSeparatorInterval = DEFAULT_DECIMAL_SEPARATOR_INTERVAL,
  decimalSeparatorCharacter = DEFAULT_DECIMAL_SEPARATOR_CHARACTER,
} = {}) {
  if (typeof number != 'number') {
    throw new Error(`number not number: ${typeof number}`);
  }
  
  return numberStringToStringWithSeparator(number, {
    integerSeparatorInterval,
    integerSeparatorCharacter,
    decimalSeparatorInterval,
    decimalSeparatorCharacter,
  });
}

export function numberStringToNumber(numString) {
  if (typeof numString != 'string') {
    throw new Error(`numString not string: ${typeof numString}`);
  }
  
  numString = numString.replaceAll('_', '');
  
  return Number(numString);
}
