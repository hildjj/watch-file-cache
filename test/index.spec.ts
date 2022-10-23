import { assert, default as chai } from "chai";
import { WatchFileCache } from "../lib/index.js";
import chaiAsPromised from "chai-as-promised";
import { promises as fs } from "fs";
import path from "path";

chai.use(chaiAsPromised);

function tempFile(name: string): string {
  return path.resolve(__dirname, `TEMP-${process.pid}-${name}.date`);
}

function waitForEvent<T>(
  watcher: WatchFileCache<T>,
  event: string
): Promise<void> {
  return new Promise(resolve => {
    watcher.once(event, resolve);
  });
}

describe("watch files", () => {
  it("starts empty", () => {
    const w = new WatchFileCache<Date>();
    assert.deepEqual(w.stats, {
      size: 0,
      hits: 0,
      misses: 0,
      ejected: 0,
      errors: 0,
    });
  });

  it("returns undefined for unknown files", () => {
    const w = new WatchFileCache<Date>();
    assert.equal(w.get(tempFile("unknown")), undefined);
    assert.deepEqual(w.stats, {
      size: 0,
      hits: 0,
      misses: 1,
      ejected: 0,
      errors: 0,
    });
  });

  it("maintains state", async() => {
    const w = new WatchFileCache<Date>();
    const p = tempFile("state");
    const d = new Date();
    await fs.writeFile(p, d.toString());
    w.set(p, d);
    assert.deepEqual(w.stats, {
      size: 1,
      hits: 0,
      misses: 0,
      ejected: 0,
      errors: 0,
    });

    assert.equal(w.get(p), d);
    assert.deepEqual(w.stats, {
      size: 1,
      hits: 1,
      misses: 0,
      ejected: 0,
      errors: 0,
    });
    await w.close();
    await fs.unlink(p);
  });

  it("ejects on change", async() => {
    const w = new WatchFileCache<Date>();
    const p = tempFile("change");

    const d = new Date();
    await fs.writeFile(p, d.toString());
    w.set(p, d);
    assert.deepEqual(w.stats, {
      size: 1,
      hits: 0,
      misses: 0,
      ejected: 0,
      errors: 0,
    });

    const d2 = new Date(d.getTime() + 1000);
    // No way to tell which of these will finish first.
    await Promise.all([waitForEvent(w, "eject"), fs.writeFile(p, d2.toString())]);
    assert.deepEqual(w.stats, {
      size: 0,
      hits: 0,
      misses: 0,
      ejected: 1,
      errors: 0,
    });

    assert.equal(w.get(p), undefined);
    assert.deepEqual(w.stats, {
      size: 0,
      hits: 0,
      misses: 1,
      ejected: 1,
      errors: 0,
    });

    await w.close();
    await fs.unlink(p);
  });

  it("ejects on unlink", async() => {
    const w = new WatchFileCache<Date>();
    const p = tempFile("unlink");

    const d = new Date();
    await fs.writeFile(p, d.toString());
    w.set(p, d);
    assert.deepEqual(w.stats, {
      size: 1,
      hits: 0,
      misses: 0,
      ejected: 0,
      errors: 0,
    });

    // No way to tell which of these will finish first.
    await Promise.all([waitForEvent(w, "eject"), fs.unlink(p)]);
    assert.deepEqual(w.stats, {
      size: 0,
      hits: 0,
      misses: 0,
      ejected: 1,
      errors: 0,
    });

    assert.equal(w.get(p), undefined);
    assert.deepEqual(w.stats, {
      size: 0,
      hits: 0,
      misses: 1,
      ejected: 1,
      errors: 0,
    });

    await w.close();
  });

  it("allows update", async() => {
    const w = new WatchFileCache<Date>();
    const p = tempFile("update");

    const d = new Date();
    await fs.writeFile(p, d.toString());
    w.set(p, d);
    assert.deepEqual(w.stats, {
      size: 1,
      hits: 0,
      misses: 0,
      ejected: 0,
      errors: 0,
    });

    const d2 = new Date(d.getTime() + 1000);
    w.set(p, d2);
    assert.deepEqual(w.stats, {
      size: 1,
      hits: 0,
      misses: 0,
      ejected: 0,
      errors: 0,
    });

    assert.equal(w.get(p), d2);
    assert.deepEqual(w.stats, {
      size: 1,
      hits: 1,
      misses: 0,
      ejected: 0,
      errors: 0,
    });

    await w.close();
    await fs.unlink(p);
  });

  it("clears open watches", async() => {
    const w = new WatchFileCache<Date>();
    const p = tempFile("clear");

    const d = new Date();
    await fs.writeFile(p, d.toString());
    w.set(p, d);
    await w.clear();
    assert.deepEqual(w.stats, {
      size: 0,
      hits: 0,
      misses: 0,
      ejected: 0,
      errors: 0,
    });
    await fs.unlink(p);
  });

  it("handles errors", async() => {
    const w = new WatchFileCache<string>();
    const p = tempFile("errors");

    assert.throws(() => w.set(p, "does not exist"));
    assert.deepEqual(w.stats, {
      size: 0,
      hits: 0,
      misses: 0,
      ejected: 0,
      errors: 0,
    });

    await fs.writeFile(p, "gonna error one day");
    w.set(p, "does not exist");
    assert.deepEqual(w.stats, {
      size: 1,
      hits: 0,
      misses: 0,
      ejected: 0,
      errors: 0,
    });

    const pError = waitForEvent(w, "error");
    // @ts-expect-error Testing this the same janky way that the node source
    // does.
    const entry = w._cache.get(p);
    entry.watcher._handle.onchange(-2, "ENOENT", p);
    await pError;
    assert.deepEqual(w.stats, {
      size: 0,
      hits: 0,
      misses: 0,
      ejected: 0,
      errors: 1,
    });

    await fs.unlink(p);
  });
});
