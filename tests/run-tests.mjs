// 可重复运行的测试入口：node --experimental-vm-modules 不需要，直接由 Vite SSR 加载器转译 TS。
// 运行：pnpm test
// 存储链路（utils/storage.ts、api/*、stores）使用真实 saveLocal/loadLocal，只替换底层 localStorage
// 为内存实现，并将仅用于提示的 element-plus 替换为可观测的桩，不替换任何业务/存储代码。
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

// ---- 真实 localStorage 语义的内存实现（不绕过 saveLocal，仅提供 Web 存储底座）----
class MemoryStorage {
  #map = new Map();
  getItem(key) {
    return this.#map.has(key) ? this.#map.get(key) : null;
  }
  setItem(key, value) {
    this.#map.set(key, String(value));
  }
  removeItem(key) {
    this.#map.delete(key);
  }
  clear() {
    this.#map.clear();
  }
  key(index) {
    return [...this.#map.keys()][index] ?? null;
  }
  get length() {
    return this.#map.size;
  }
}
globalThis.localStorage = new MemoryStorage();

const server = await createServer({
  root,
  configFile: false,
  logLevel: 'silent',
  resolve: { alias: { 'element-plus': path.resolve(here, 'support/elementPlusStub.ts') } },
  ssr: { noExternal: ['element-plus'] },
  server: { middlewareMode: true },
});

const suites = [
  '/tests/suites/persistence.test.ts',
  '/tests/suites/scheduler.test.ts',
  '/tests/suites/scheduleStore.test.ts',
];

// 顶层 test() 由 node:test 自动执行并在结束时汇总；await 其 Promise 后再关闭 Vite。
await Promise.all(suites.map((id) => server.ssrLoadModule(id)));
await server.close();
