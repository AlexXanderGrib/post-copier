export function env(key: string, defaultValue = "") {
  return String(Reflect.get(process.env, key) ?? defaultValue);
}
