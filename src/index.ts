import { type FSWatcher, watch } from "fs";
import { EventEmitter } from "events";

// Many of the file watching utilities are optimized to watch directories, and
// are not terribly concerned with async feedback. We'll just use Node's
// fs.watch and home for the best.

/**
 * Hold on one FSWatcher per entry in the cache.  The watcher will
 * mostly-always be defined, but there's a race condition on adding entries
 * to the cache that we're working around with the `?`.
 */
interface Entry<T> {
  watcher?: FSWatcher;
  contents: T;
}

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

function waitEvent(emitter: EventEmitter, eventName: string): Promise<any[]> {
  return new Promise(resolve => {
    emitter.once(eventName, (...args) => resolve(args));
  });
}

/**
 * Create a cache of information associated with files.  Whenever the file
 * changes, the corresponding cache entry will be invalidated.
 *
 * Make sure to call `close` on shutdown to clean up file watching handles.
 */
export class WatchFileCache<T> extends EventEmitter {
  private _cache = new Map<string, Entry<T>>();

  private _watcher: FSWatcher | undefined = undefined;

  private _stats: Omit<Stats, "size"> = { ...zeroStats };

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
    // Can't really get when closed, but it should always return undefined and
    // not hurt anything.
    const res = this._cache.get(path);
    if (res === undefined) {
      this._stats.misses++;
      this.emit("miss", path);
      return undefined;
    }
    this._stats.hits++;
    this.emit("hit", path, res.contents);
    return res.contents;
  }

  /**
   * Set information into the cache associated with a file name.
   *
   * @param path The file path associated with the info.
   * @param contents Information to store in the cache.
   * @returns Any previous value set for this path, or undefined if this is
   * the first time.
   */
  public set(path: string, contents: T): this {
    let entry = this._cache.get(path);
    let prev: T | undefined = undefined;
    if (entry === undefined) {
      try {
        entry = { contents };
        // Key race condition: this has to come before `watch`, I think.
        this._cache.set(path, entry);
        // Will throw with ENOENT if the file doesn't exist, e.g.
        entry.watcher = watch(path, {}, eventType => {
          this.delete(path).then(() => {
            this._stats.ejected++;
            this.emit("eject", path, eventType);
          });
        }).on("error", e => {
          // Don't call delete.  We don't need to call close.
          this._cache.delete(path);
          this._stats.errors++;
          this.emit("error", e);
        });

        this.emit("watch", path);
      } catch (er) {
        // If fs.watch threw, invalidate the cache entry.
        this._cache.delete(path);
        throw er;
      }
    } else {
      // Existing file, which hasn't changed, is getting update data.
      prev = entry.contents;
      entry.contents = contents;
    }
    this.emit("set", path, contents, prev);
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
  public async delete(path: string): Promise<boolean> {
    const entry = this._cache.get(path);
    let ret = false;
    if (entry) {
      if (entry.watcher) {
        await this._closeWatcher(entry.watcher);
      }
      this._cache.delete(path);
      this.emit("delete", path, ret);
      ret = true;
    }

    return ret;
  }

  /**
   * Clear all information from the cache, stop watching all current files,
   * and reset all statistics to zero.
   *
   * @returns this, for chaining.
   */
  public async clear(): Promise<this> {
    await this.close();
    this._stats = { ...zeroStats };
    this.emit("clear");
    return this;
  }

  /**
   * Close down all file watching and clear the cache, but not the statistics.
   * Make sure to call this on shutdown!
   *
   * @returns this for chaining
   */
  public async close(): Promise<this> {
    for (const [, entry] of this._cache) {
      if (entry.watcher) {
        await this._closeWatcher(entry.watcher);
      }
    }
    this._cache.clear();
    this.emit("close");
    return this;
  }

  /**
   * Close the watcher, and wait for the `close` event to fire, which means
   * it's actually closed.
   *
   * @param watcher The FSWatcher to close.
   * @returns Nothing interesting.
   */
  private _closeWatcher(watcher: FSWatcher): Promise<any[]> {
    const closed = waitEvent(watcher, "close");
    watcher.close();
    return closed;
  }
}
