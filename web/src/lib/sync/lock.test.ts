import { afterEach, describe, expect, it, vi } from "vitest";

import { createLeaseLock, createSyncLock, inTabLock } from "./lock";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("inTabLock", () => {
  it("runs the tasks one after the other in the order they were requested", async () => {
    const lock = inTabLock();
    const order: string[] = [];
    const first = deferred();
    const a = lock(async () => {
      order.push("a start");
      await first.promise;
      order.push("a end");
      return "a";
    });
    const b = lock(async () => {
      order.push("b");
      return "b";
    });
    await Promise.resolve();
    expect(order).toEqual(["a start"]);
    first.resolve();
    expect(await Promise.all([a, b])).toEqual(["a", "b"]);
    expect(order).toEqual(["a start", "a end", "b"]);
  });

  it("passes on the error of a task and runs the next one anyway", async () => {
    const lock = inTabLock();
    const failing = lock(async () => {
      throw new Error("boom");
    });
    const next = lock(async () => "next");
    await expect(failing).rejects.toThrow("boom");
    await expect(next).resolves.toBe("next");
  });
});

describe("createSyncLock", () => {
  it("uses the Web Locks API with the name when it exists", async () => {
    const request = vi.fn(async <T,>(_name: string, callback: () => Promise<T>) => callback());
    vi.stubGlobal("navigator", { locks: { request } });
    const lock = createSyncLock("gym2-sync-test");
    await expect(lock(async () => 5)).resolves.toBe(5);
    expect(request).toHaveBeenCalledWith("gym2-sync-test", expect.any(Function));
  });

  it("falls back to the lease in the localStorage", async () => {
    const storage = memoryStorage();
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("localStorage", storage);
    const lock = createSyncLock("fallback");
    let held: string | undefined;
    await lock(async () => {
      held = storage.values.get("gym2.lock.fallback");
    });
    expect(JSON.parse(held!)).toMatchObject({ owner: expect.any(String), expires: expect.any(Number) });
    expect(storage.values.size).toBe(0);
  });

  it("serializes the runs of the tab when neither exists", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("SecurityError");
      },
    });
    const lock = createSyncLock("none");
    let running = 0;
    let maxRunning = 0;
    const task = async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
    };
    await Promise.all([lock(task), lock(task), lock(task)]);
    expect(maxRunning).toBe(1);
  });
});

describe("createLeaseLock", () => {
  it("is null if the storage can't be used", () => {
    const storage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {},
      removeItem: () => {},
    };
    expect(createLeaseLock("x", storage)).toBeNull();
  });

  it("takes over an expired lease of a tab that is gone", async () => {
    const storage = memoryStorage();
    storage.setItem("gym2.lock.x", JSON.stringify({ owner: "closed tab", expires: Date.now() - 1 }));
    const lock = createLeaseLock("x", storage)!;
    await expect(lock(async () => "ran")).resolves.toBe("ran");
    expect(storage.values.size).toBe(0);
  });

  it("takes over a lease that can't be read", async () => {
    const storage = memoryStorage();
    storage.setItem("gym2.lock.x", "{not json");
    const lock = createLeaseLock("x", storage)!;
    await expect(lock(async () => "ran")).resolves.toBe("ran");
  });

  it("waits for a valid lease of another tab until it is released", async () => {
    vi.useFakeTimers();
    const storage = memoryStorage();
    storage.setItem("gym2.lock.x", JSON.stringify({ owner: "other tab", expires: Date.now() + 15_000 }));
    const lock = createLeaseLock("x", storage)!;
    const task = vi.fn(async () => "ran");
    const run = lock(task);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(task).not.toHaveBeenCalled();

    storage.removeItem("gym2.lock.x");
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(run).resolves.toBe("ran");
  });

  it("waits until the lease of another tab expires if it isn't released", async () => {
    vi.useFakeTimers();
    const storage = memoryStorage();
    storage.setItem("gym2.lock.x", JSON.stringify({ owner: "frozen tab", expires: Date.now() + 15_000 }));
    const lock = createLeaseLock("x", storage)!;
    const task = vi.fn(async () => "ran");
    const run = lock(task);
    await vi.advanceTimersByTimeAsync(14_000);
    expect(task).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(run).resolves.toBe("ran");
  });

  it("renews the lease while a long task runs, so other tabs keep waiting", async () => {
    vi.useFakeTimers();
    const storage = memoryStorage();
    const tabA = createLeaseLock("x", storage)!;
    const tabB = createLeaseLock("x", storage)!;
    const finish = deferred();
    const a = tabA(() => finish.promise);
    await vi.advanceTimersByTimeAsync(100);
    const bTask = vi.fn(async () => {});
    const b = tabB(bTask);
    // much longer than the lease of 15 s
    await vi.advanceTimersByTimeAsync(40_000);
    expect(bTask).not.toHaveBeenCalled();

    finish.resolve();
    await a;
    await vi.advanceTimersByTimeAsync(1_000);
    await b;
    expect(bTask).toHaveBeenCalledTimes(1);
  });

  it("releases the lease when the task fails", async () => {
    const storage = memoryStorage();
    const lock = createLeaseLock("x", storage)!;
    await expect(
      lock(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(storage.values.size).toBe(0);
  });

  it("doesn't remove a lease another tab took over", async () => {
    const storage = memoryStorage();
    const lock = createLeaseLock("x", storage)!;
    await lock(async () => {
      storage.setItem("gym2.lock.x", JSON.stringify({ owner: "other tab", expires: Date.now() + 15_000 }));
    });
    expect(JSON.parse(storage.values.get("gym2.lock.x")!)).toMatchObject({ owner: "other tab" });
  });
});
