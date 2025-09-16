import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

interface StoredValueMap {
  [key: string]: unknown;
}

export class JsonFileKeyValueStorage {
  private cache: StoredValueMap | null = null;
  private readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.cache !== null) return;
    try {
      const buf = await readFile(this.path);
      const decoded = JSON.parse(buf.toString()) as StoredValueMap;
      this.cache = decoded ?? {};
    } catch (error) {
      // If file doesn't exist or is invalid, start with empty storage
      this.cache = {};
    }
  }

  private async persist(): Promise<void> {
    if (this.cache === null) return;
    const dir = dirname(this.path);
    await mkdir(dir, { recursive: true });
    const data = JSON.stringify(this.cache, null, 2);
    await writeFile(this.path, data);
  }

  private assertCache(): StoredValueMap {
    if (this.cache === null) {
      throw new Error("Storage cache not initialized");
    }
    return this.cache;
  }

  async getKeys(): Promise<string[]> {
    await this.ensureLoaded();
    return Object.keys(this.assertCache());
  }

  async getEntries<T = unknown>(): Promise<[string, T][]> {
    await this.ensureLoaded();
    const cache = this.assertCache();
    return Object.entries(cache) as [string, T][];
  }

  async getItem<T = unknown>(key: string): Promise<T | undefined> {
    await this.ensureLoaded();
    const cache = this.assertCache();
    return cache[key] as T | undefined;
  }

  async setItem<T = unknown>(key: string, value: T): Promise<void> {
    await this.ensureLoaded();
    const cache = this.assertCache();
    cache[key] = value;
    await this.persist();
  }

  async removeItem(key: string): Promise<void> {
    await this.ensureLoaded();
    const cache = this.assertCache();
    delete cache[key];
    await this.persist();
  }
}
