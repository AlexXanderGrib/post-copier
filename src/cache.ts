import { JSONFile, Low } from "lowdb";
import path from "path";
import { fileURLToPath } from "url";


const filePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../cache.json");
const db = new Low(new JSONFile<Record<string, any>>(filePath));

class CacheEntry<T> {
  constructor(public readonly key: string) {}

  get value(): T | undefined {
    return db.data?.[this.key];
  }

  set value(value) {
    db.data![this.key] = value;
  }
}

const proxy: Record<string, CacheEntry<any>> = {};

export function useCache<T>(key: string): CacheEntry<T> {
  return proxy[key] ??= new CacheEntry(key);
}

export async function init() {
  await db.read();
}

export async function save() {
  await db.write();
}