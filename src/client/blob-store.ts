/**
 * IndexedDB blob store for uploaded wallpaper files. localStorage cannot hold
 * videos (5 MiB quota), so payloads above {@link INLINE_LIMIT} live here —
 * still fully local to the browser, never uploaded anywhere. The settings
 * document in localStorage only keeps a small {@link SourceRef} pointing here.
 */

const DB_NAME = 'dsh-dynamic-wallpaper'
const DB_VERSION = 1
const STORE_NAME = 'sources'

/** One-shot connection promise so parallel put/get share a single open. */
let dbPromise: Promise<IDBDatabase> | undefined

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => { resolve(request.result) }
    request.onerror = () => { reject(request.error ?? new Error('indexedDB open failed')) }
  })
  return dbPromise
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(db => new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode)
    const request = run(transaction.objectStore(STORE_NAME))
    request.onsuccess = () => { resolve(request.result) }
    request.onerror = () => { reject(request.error ?? new Error('indexedDB request failed')) }
  }))
}

/** Store one uploaded file blob under an opaque id. */
export function putBlob(id: string, blob: Blob): Promise<void> {
  return tx('readwrite', store => store.put(blob, id)).then(() => undefined)
}

/** Read a stored blob; resolves null when the id is unknown or the store is unavailable. */
export function getBlob(id: string): Promise<Blob | null> {
  return tx('readonly', store => store.get(id)).then(value => value instanceof Blob ? value : null)
}

/** Remove a stored blob (called when its source is replaced or cleared). */
export function deleteBlob(id: string): Promise<void> {
  return tx('readwrite', store => store.delete(id)).then(() => undefined)
}
