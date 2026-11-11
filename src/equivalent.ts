/** Compare persisted values without treating object key order as an edit. */
export function equivalent(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item, index) => equivalent(item, right[index]));
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
  const keys = Object.keys(left).filter((key) => Reflect.get(left, key) !== undefined);
  const otherKeys = Object.keys(right).filter((key) => Reflect.get(right, key) !== undefined);
  return keys.length === otherKeys.length && keys.every((key) => Object.hasOwn(right, key) && equivalent(Reflect.get(left, key), Reflect.get(right, key)));
}
