import { describe, expect, it, vi } from "vitest";

import { readServerSentEvents, StreamIdleError, type ServerSentEvent } from "./sse";

function bodyOf(chunks: string[], { close = true }: { close?: boolean } = {}) {
  const encoder = new TextEncoder();
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      if (close) controller.close();
    },
    cancel,
  });
  return { body, cancel };
}

async function collect(events: AsyncIterable<ServerSentEvent>) {
  const all: ServerSentEvent[] = [];
  for await (const event of events) all.push(event);
  return all;
}

describe("readServerSentEvents", () => {
  it("reads events that are split over chunks and skips comments", async () => {
    const { body } = bodyOf(['event: start\ndata: {"a"', ':1}\n\n: ping\n\nevent: delta\r\ndata: x\r\n\r\ndata: plain\n\n']);
    expect(await collect(readServerSentEvents(body))).toEqual([
      { event: "start", data: '{"a":1}' },
      { event: "delta", data: "x" },
      { event: "message", data: "plain" },
    ]);
  });

  it("joins several data lines and keeps characters split between chunks", async () => {
    const bytes = new TextEncoder().encode("data: Grüße\ndata: 2\n\n");
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        // Splits the two bytes of "ü"
        controller.enqueue(bytes.slice(0, 9));
        controller.enqueue(bytes.slice(9));
        controller.close();
      },
    });
    expect(await collect(readServerSentEvents(body))).toEqual([{ event: "message", data: "Grüße\n2" }]);
  });

  it("leaves out an event the body ended in", async () => {
    const { body } = bodyOf(["data: 1\n\ndata: 2\n"]);
    expect(await collect(readServerSentEvents(body))).toEqual([{ event: "message", data: "1" }]);
  });

  it("closes the connection when the reader stops", async () => {
    const { body, cancel } = bodyOf(["data: 1\n\ndata: 2\n\n"], { close: false });
    for await (const event of readServerSentEvents(body)) {
      expect(event.data).toBe("1");
      break;
    }
    expect(cancel).toHaveBeenCalled();
  });

  it("fails if the body stays silent for too long", async () => {
    const { body, cancel } = bodyOf(["data: 1\n\n"], { close: false });
    await expect(collect(readServerSentEvents(body, { idleTimeoutMs: 10 }))).rejects.toBeInstanceOf(StreamIdleError);
    expect(cancel).toHaveBeenCalled();
  });
});
