import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { MemoryStorage, type Storage } from "@earendil-works/pi-durable";
import {
  SqliteStorage,
  SyncSqliteDatabase,
  type SyncSqliteConnection,
  type SyncSqliteStatement,
} from "@earendil-works/pi-durable/storage/sqlite";

type Sqlite3 = Awaited<ReturnType<typeof sqlite3InitModule>>;
type OoDatabase = InstanceType<Sqlite3["oo1"]["DB"]>;
type OoStatement = ReturnType<OoDatabase["prepare"]>;

let module: Promise<Sqlite3> | undefined;
const sqlite3 = () => (module ??= sqlite3InitModule());

function statement(prepared: OoStatement): SyncSqliteStatement {
  const bound = (params: unknown[]) => {
    prepared.reset(true);
    if (params.length) prepared.bind(params as never);
    return prepared;
  };
  return {
    run: (...params) => {
      bound(params).step();
      prepared.reset(true);
    },
    get: (...params) => {
      const row = bound(params).step() ? prepared.get({}) : undefined;
      prepared.reset(true);
      return row;
    },
    all: (...params) => {
      const rows: unknown[] = [];
      const s = bound(params);
      while (s.step()) rows.push(s.get({}));
      prepared.reset(true);
      return rows;
    },
  };
}

const connection = (database: OoDatabase): SyncSqliteConnection => ({
  exec: (sql) => void database.exec(sql),
  prepare: (sql) => statement(database.prepare(sql)),
  close: () => database.close(),
});

/** Durable storage in the origin private file system, in a dedicated worker. */
async function opfsStorage(name: string): Promise<Storage> {
  const s = await sqlite3();
  // Its types omit the option that lets a failed install be tried again.
  const options = { directory: "/olit", name: "olit-opfs", forceReinitIfPreviouslyFailed: true };
  const pool = await s.installOpfsSAHPoolVfs(options);
  await pool.reserveMinimumCapacity(pool.getFileCount() + 2);
  const database = new SyncSqliteDatabase(connection(new pool.OpfsSAHPoolDb(`/${name}.sqlite3`)));
  await database.exec("PRAGMA journal_mode = TRUNCATE");
  return SqliteStorage.open(database);
}

export interface OpenedStorage {
  storage: Storage;
  /** Why the browser keeps no files, when it keeps none: the session then ends with the page. */
  unkept?: string;
}

/** The storage of `name`: OPFS where the browser has it, memory otherwise. */
export async function openStorage(name: string): Promise<OpenedStorage> {
  // A tab that just handed the storage over may still be letting go of its files.
  let failure: unknown;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      return { storage: await opfsStorage(name) };
    } catch (error) {
      failure = error;
      if ((error as Error)?.name !== "NoModificationAllowedError") break;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  console.warn("[olit] files are not kept:", failure);
  const { name: kind, message } = (failure ?? {}) as Partial<Error>;
  return {
    storage: new MemoryStorage(),
    unkept: [kind, message].filter(Boolean).join(": ") || String(failure),
  };
}

/**
 * Hold `name` for this tab: OPFS lets one tab open a storage at a time. Resolves once held;
 * `waiting` runs first when another tab holds it, `lost` once another tab takes it over.
 * `steal` takes it from the tab that holds it.
 */
export function holdStorage(
  name: string,
  options: { steal?: boolean; waiting?: () => void; lost?: () => void } = {},
): Promise<void> {
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  if (!locks) return Promise.resolve();
  const key = `olit:${name}`;
  return new Promise((held) => {
    const keep = () => {
      held();
      return new Promise<never>(() => {});
    };
    const hold = (steal: boolean) =>
      void locks.request(key, { steal }, keep).catch(() => options.lost?.());
    if (options.steal) {
      hold(true);
      return;
    }
    void locks
      .request(key, { ifAvailable: true }, (lock) => {
        if (lock) return keep();
        options.waiting?.();
        hold(false);
        return undefined;
      })
      .catch(() => options.lost?.());
  });
}
