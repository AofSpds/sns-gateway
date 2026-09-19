import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA } from '../../src/storage/schema.ts';
import { MIGRATION_2 } from '../../src/storage/migration2.ts';
import { MIGRATION_3 } from '../../src/storage/migration3.ts';

// Execute exact application TS with only SQLite/native I/O boundaries substituted.
export async function harness(entry, native = {}) {
  const sql = new DatabaseSync(':memory:'); sql.exec(SCHEMA); sql.exec(MIGRATION_2); sql.exec(MIGRATION_3);
  const db = {
    async getFirstAsync(text, ...args) { return sql.prepare(text).get(...args) ?? null; },
    async getAllAsync(text, ...args) { return sql.prepare(text).all(...args); },
    async runAsync(text, ...args) { return sql.prepare(text).run(...args); },
    async execAsync(text) { sql.exec(text); },
    async closeAsync() { sql.close(); },
    async withExclusiveTransactionAsync(work) { sql.exec('BEGIN IMMEDIATE'); try { const result = await work(db); sql.exec('COMMIT'); return result; } catch(error) { sql.exec('ROLLBACK'); throw error; } },
  };
  const bridge = { storageDirectory: async () => '/fixture', managedFiles: async () => [], ...native };
  const modules = new Map();
  function synthetic(key, exports) {
    if (!modules.has(key)) modules.set(key, new SyntheticModule(Object.keys(exports), function() { for (const [name, value] of Object.entries(exports)) this.setExport(name, value); }, {identifier:key}));
    return modules.get(key);
  }
  async function load(path) {
    if (modules.has(path)) return modules.get(path);
    const source = stripTypeScriptTypes(readFileSync(path, 'utf8'), {mode:'strip'});
    const module = new SourceTextModule(source, {identifier:path}); modules.set(path, module);
    await module.link(async (specifier, parent) => {
      if (specifier === 'expo-sqlite') return synthetic(specifier, {openDatabaseAsync: async () => db});
      let target = resolve(dirname(parent.identifier), specifier);
      if (target.endsWith('modules/local-platform')) return synthetic('native', {platformBridge: () => bridge});
      if (!existsSync(target)) target += '.ts';
      return load(target);
    });
    return module;
  }
  const module = await load(resolve(entry)); await module.evaluate();
  return { api:module.namespace, sql, db, bridge, close:()=>sql.close() };
}
export function asset(sql, id='a'.repeat(64)) {
  const photo={id,uri:`file:///fixture/inbox/${id}.jpg`,bytes:1000,width:400,height:400};
  sql.prepare('INSERT INTO inbox_assets VALUES (?,?,?,?,?,?,?)').run(id,photo.uri,1000,400,400,Date.now(),'APP_REGISTERED');
  return photo;
}
