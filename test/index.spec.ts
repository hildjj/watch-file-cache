import { WatchFileCache } from "../lib/index";
import { assert } from "chai";
import { promises as fs } from "fs";
import path from "path";

function waitForEvent(
  w: WatchFileCache<string>,
  eventName: string
): Promise<Error> {
  return new Promise(resolve => {
    // @ts-expect-error Just for testing.
    w._watcher.once(eventName, (...args) => resolve(args));
  });
}

describe("watch files", () => {
  it("watches", async() => {
    const w = new WatchFileCache<string>();
    const p = path.resolve(__dirname, `TEMP-${process.pid}`);
    assert.deepEqual(w.stats, {
      size: 0,
      hits: 0,
      misses: 0,
      ejected: 0,
      errors: 0,
    });

    assert.equal(w.get(p), undefined);
    assert.deepEqual(w.stats, {
      size: 0,
      hits: 0,
      misses: 1,
      ejected: 0,
      errors: 0,
    });

    w.set(p, "1");
    assert.deepEqual(w.stats, {
      size: 1,
      hits: 0,
      misses: 1,
      ejected: 0,
      errors: 0,
    });

    assert.equal(w.get(p), "1");
    assert.deepEqual(w.stats, {
      size: 1,
      hits: 1,
      misses: 1,
      ejected: 0,
      errors: 0,
    });

    // No way to tell which of these will finish first.
    await Promise.all([fs.writeFile(p, "there"), waitForEvent(w, "all")]);
    assert.deepEqual(w.stats, {
      size: 0,
      hits: 1,
      misses: 1,
      ejected: 1,
      errors: 0,
    });

    w.set(p, "2");
    assert.equal(w.get(p), "2");

    await Promise.all([fs.unlink(p), waitForEvent(w, "all")]);
    assert.deepEqual(w.stats, {
      size: 0,
      hits: 2,
      misses: 1,
      ejected: 2,
      errors: 0,
    });

    await w.clear();
    assert.deepEqual(w.stats, {
      size: 0,
      hits: 0,
      misses: 0,
      ejected: 0,
      errors: 0,
    });
  });

  it("handles errors", async() => {
    // Set up an infinite loop of symlinks
    const j = path.join(__dirname, "j");
    const k = path.join(__dirname, "k");
    try {
      await fs.writeFile(j, "bad");
      await fs.symlink(j, k);
      await fs.unlink(j);
      await fs.symlink(k, j);
      const w = new WatchFileCache<string>();
      await Promise.all([w.set(j, "stuff"), waitForEvent(w, "error")]);
      assert.deepEqual(w.stats, {
        size: 1,
        hits: 0,
        misses: 0,
        ejected: 0,
        errors: 1,
      });
      w.delete(j);
    } finally {
      // Make sure to clean it up!
      await fs.unlink(j);
      await fs.unlink(k);
    }
  });
});
