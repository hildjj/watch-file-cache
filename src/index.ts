import { FSWatcher, type WatchOptions } from "chokidar";

/** Statistics */
interface Stats {
  /**
   * Number of items currently in the cache.
   */
  size: number;
  /**
   * Number of cache hits.
   */
  hits: number;
  /**
   * Number of cache misses.
   */
  misses: number;
  /**
   * Number of times information has been ejected from the cache based on a
   * file change.
   */
  ejected: number;
  /**
   * Number of filesystem errors that occurred.
   */
  errors: number;
}

const zeroStats: Omit<Stats, "size"> = {
  hits: 0,
  misses: 0,
  ejected: 0,
  errors: 0,
};

/**
 * Create a cache of information associated with files.  Whenever the file
 * changes, the corresponding cache entry will be invalidated.
 */
export class WatchFileCache<T> {
  private _cache = new Map<string, T>();

  private _watcher: FSWatcher;

  private _options: WatchOptions;

  private _stats: Omit<Stats, "size"> = { ...zeroStats };

  /**
   * Create an instance.
   *
   * @param options Chokidar options for file watching.  Any value provided
   * for `ignoreInitial` and `disableGlobbing` will be overwritten.
   */
  public constructor(options?: WatchOptions) {
    this._options = {
      ...options,
      ignoreInitial: true,
      disableGlobbing: true,
    };
    this._watcher = new FSWatcher(options);
    this._watcher.on("all", (event, path) => {
      this.delete(path);
      this._stats.ejected++;
    });
    this._watcher.on("error", () => {
      this._stats.errors++;
    });
  }

  /**
   * Current statistics for this instance.
   */
  public get stats(): Stats {
    return {
      ...this._stats,
      size: this._cache.size,
    };
  }

  /**
   * Get info from the cache.
   *
   * @param path The file path associated with the info.
   * @returns `undefined` if there is no entry.
   */
  public get(path: string): T | undefined {
    const res = this._cache.get(path);
    if (res === undefined) {
      this._stats.misses++;
    } else {
      this._stats.hits++;
    }
    return res;
  }

  /**
   * Set information into the cache associated with a file name.
   *
   * @param path The file path associated with the info.
   * @param contents Information to store in the cache.
   * @returns this, for chaining.
   */
  public set(path: string, contents: T): this {
    this._cache.set(path, contents);
    this._watcher.add(path);
    return this;
  }

  /**
   * Delete info in the cache associated with this file, and stop watching for
   * changes to that file.
   *
   * @param path The file path associated with the info.
   * @returns true if an element in the cache existed and has been removed, or
   * false if the element did not exist.
   */
  public delete(path: string): boolean {
    this._watcher.unwatch(path);
    return this._cache.delete(path);
  }

  /**
   * Clear all information from the cache, stop watching all current files,
   * and reset all statistics to zero. Note: this is async because
   * unregistering the file watchers might take some time.
   *
   * @returns this, for chaining.
   */
  public async clear(): Promise<this> {
    await this._watcher.close();
    this._cache.clear();
    // `close` invalidates the old watcher
    this._watcher = new FSWatcher(this._options);
    this._stats = { ...zeroStats };
    return this;
  }
}
