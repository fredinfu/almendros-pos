import { State } from './models';

/** Unit of work: callbacks are synchronous, ensuring IndexedDB stays active. */
export interface DataRepository {
  read(): Promise<State>;
  transact<T>(operation: (state: State) => T): Promise<T>;
  replace(state: State): Promise<void>;
  observe(next: (state: State) => void, error: (error: unknown) => void): () => void;
}
