// does not support self-referential objects
export function deepObjectClone(object) {
  if (typeof object != 'object') {
    throw new Error(`object not object: ${typeof object}`);
  }
  
  return Object.fromEntries(
    Object.entries(object)
      .map(([ key, value ]) => {
        if (typeof value == 'object') {
          return [key, deepObjectClone(value)];
        } else {
          return [key, value];
        }
      })
  );
}
