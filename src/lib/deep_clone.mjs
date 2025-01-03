// does not support self-referential objects
export function deepObjectClone(object) {
  if (typeof object != 'object' || object == null) {
    throw new Error(`object not object: ${object == null ? 'null' : typeof object}`);
  }
  
  return Object.fromEntries(
    Object.entries(object)
      .map(([ key, value ]) => {
        if (typeof value == 'object' && value != null) {
          return [key, deepObjectClone(value)];
        } else {
          return [key, value];
        }
      })
  );
}
