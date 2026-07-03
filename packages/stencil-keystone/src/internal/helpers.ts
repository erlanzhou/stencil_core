/**
 * Check whether a value is a complex type (object or function).
 * @param o the value to check
 * @returns `true` if the value is an object or function
 */
export const isComplexType = (o: unknown): boolean => {
  o = typeof o;
  return o === 'object' || o === 'function';
};

