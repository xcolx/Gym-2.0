// Reads a text/event-stream response body (server-sent events), e.g. the answer of the Gym-AI while it is written.
// EventSource can't be used for it: it only sends GET requests.

export interface ServerSentEvent {
  /** The name of the event, "message" if the server sent none */
  event: string;
  data: string;
}

/** Thrown when the server sent nothing for too long, not even the comments that keep the connection open */
export class StreamIdleError extends Error {
  constructor() {
    super("The server stopped sending.");
    this.name = "StreamIdleError";
  }
}

/**
 * The events of the body, each as soon as it has arrived. Comments (lines starting with a colon) are skipped. With
 * `idleTimeoutMs`, a body that stays silent for that long fails with StreamIdleError: a lost connection often doesn't
 * end the body by itself. Stopping to read (break, return or an error in the loop) closes the connection.
 */
export async function* readServerSentEvents(
  body: ReadableStream<Uint8Array>,
  { idleTimeoutMs }: { idleTimeoutMs?: number } = {},
): AsyncGenerator<ServerSentEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event = "message";
  let data: string[] = [];

  const read = async () => {
    if (idleTimeoutMs === undefined) return reader.read();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const idle = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new StreamIdleError()), idleTimeoutMs);
    });
    try {
      return await Promise.race([reader.read(), idle]);
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    for (;;) {
      const { done, value } = await read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });

      let end: number;
      while ((end = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, end).replace(/\r$/, "");
        buffer = buffer.slice(end + 1);

        if (line === "") {
          // An empty line ends the event
          if (data.length > 0) yield { event, data: data.join("\n") };
          event = "message";
          data = [];
        } else if (!line.startsWith(":")) {
          const colon = line.indexOf(":");
          const field = colon === -1 ? line : line.slice(0, colon);
          const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
          if (field === "event") event = value;
          else if (field === "data") data.push(value);
        }
      }
    }
  } finally {
    void reader.cancel().catch(() => undefined);
  }
}
