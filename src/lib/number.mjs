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
    throw new Error(`separatorCharacter not string: ${separatorCharacter}`);
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
}) {
  if (!Number.isSafeInteger(separatorInterval) || separatorInterval <= 0) {
    throw new Error(`separatorInterval not positive integer: ${separatorInterval}`);
  }
  
  if (typeof separatorCharacter != 'string') {
    throw new Error(`separatorCharacter not string: ${separatorCharacter}`);
  }
  
  let digitChunks = [];
  
  for (let stringStart = 0; stringStart < decimalString.length; stringStart += separatorInterval) {
    const stringEnd = Math.min(stringStart + separatorInterval, decimalString.length);
    digitChunks.unshift(decimalString.slice(stringStart, stringEnd));
  }
  
  return digitChunks.join(separatorCharacter);
}

export function numberToStringWithSeparator(number, {
  integerSeparatorInterval = DEFAULT_INTEGER_SEPARATOR_INTERVAL,
  integerSeparatorCharacter = DEFAULT_INTEGER_SEPARATOR_CHARACTER,
  decimalSeparatorInterval = DEFAULT_DECIMAL_SEPARATOR_INTERVAL,
  decimalSeparatorCharacter = DEFAULT_DECIMAL_SEPARATOR_CHARACTER,
} = {}) {
  if (typeof number != 'number') {
    throw new Error(`integer not integer: ${number}`);
  }
  
  if (!Number.isSafeInteger(integerSeparatorInterval) || integerSeparatorInterval <= 0) {
    throw new Error(`integerSeparatorInterval not positive integer: ${integerSeparatorInterval}`);
  }
  
  if (typeof integerSeparatorCharacter != 'string') {
    throw new Error(`integerSeparatorCharacter not string: ${integerSeparatorCharacter}`);
  }
  
  if (!Number.isSafeInteger(decimalSeparatorInterval) || decimalSeparatorInterval <= 0) {
    throw new Error(`decimalSeparatorInterval not positive integer: ${decimalSeparatorInterval}`);
  }
  
  if (typeof decimalSeparatorCharacter != 'string') {
    throw new Error(`decimalSeparatorCharacter not string: ${decimalSeparatorCharacter}`);
  }
  
  if (number < 0) {
    return `-${numberToStringWithSeparator(-number, { integerSeparatorInterval, integerSeparatorCharacter, decimalSeparatorInterval, decimalSeparatorCharacter })}`;
  } else {
    const numString = number + '';
    
    let match;
    
    if (numString == 'Infinity' || numString == 'NaN') {
      return numString;
    } else if ((match = /^(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/.exec(numString)) == null) {
      let [ intString, decimalString, exponent ] = match.slice(1);
      
      intString = intStringToStringWithSeparator(intString, {
        separatorInterval: integerSeparatorInterval,
        separatorCharacter: integerSeparatorCharacter,
      });
      
      if (decimalString != null) {
        decimalString = decimalStringToStringWithSeparator(intString, {
          separatorInterval: decimalSeparatorInterval,
          separatorCharacter: decimalSeparatorCharacter,
        });
      }
      
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
    }
  }
}

export function numberStringToNumber(numString) {
  
}
