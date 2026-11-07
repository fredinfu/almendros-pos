import Dexie, { liveQuery } from 'dexie';
import { State, emptyState, tableNames } from '../../domain/models';
import { DataRepository } from '../../domain/repository';

export class DexieRepository implements DataRepository {
  constructor(readonly database: Dexie) {}
  private async load(): Promise<State> {
    const state = emptyState();
    await Promise.all(
      tableNames.map(async (name) => {
        Object.assign(state, { [name]: await this.database.table(name).toArray() });
      }),
    );
    return state;
  }
  async read(): Promise<State> {
    let snapshot: State | undefined;
    await this.database.transaction('r', this.database.tables, async () => {
      snapshot = await this.load();
    });
    return snapshot!;
  }
  transact<T>(operation: (state: State) => T): Promise<T> {
    return this.database.transaction<T>('rw', this.database.tables, async () => {
      const state = await this.load();
      const before = new Map(tableNames.map((name) => [name, JSON.stringify(state[name])]));
      const catalogIds = {
        products: state.products.map((p) => p.id),
        variants: state.variants.map((v) => v.id),
      };
      const result = operation(state);
      // Only unreferenced catalog records may be removed; historical tables stay append-only.
      for (const name of ['products', 'variants'] as const) {
        const remaining = new Set(state[name].map((row) => row.id));
        await this.database
          .table(name)
          .bulkDelete(catalogIds[name].filter((id) => !remaining.has(id)));
      }
      for (const name of tableNames) {
        if (JSON.stringify(state[name]) !== before.get(name))
          await this.database.table(name).bulkPut(state[name]);
      }
      return result;
    });
  }
  async replace(state: State): Promise<void> {
    await this.database.transaction('rw', this.database.tables, async () => {
      for (const name of tableNames) {
        await this.database.table(name).clear();
        await this.database.table(name).bulkAdd(state[name]);
      }
    });
  }
  observe(next: (state: State) => void, error: (error: unknown) => void): () => void {
    const subscription = liveQuery(() => this.read()).subscribe({ next, error });
    return () => subscription.unsubscribe();
  }
}
