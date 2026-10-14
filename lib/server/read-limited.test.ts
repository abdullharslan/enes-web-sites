import { describe, expect, it } from "vitest";
import { readLimitedText } from "./read-limited";

const post = (body: BodyInit, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/views", { method: "POST", body, headers });

describe("readLimitedText", () => {
  it("returns small bodies", async () => {
    expect(await readLimitedText(post('{"path":"/de"}'), 512)).toBe('{"path":"/de"}');
  });

  it("refuses a body declared too large without reading it", async () => {
    expect(
      await readLimitedText(post("x", { "content-length": "999999" }), 512),
    ).toBeNull();
  });

  it("stops reading a streamed body once it passes the limit", async () => {
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        if (pulled > 1000) controller.close();
        else controller.enqueue(new Uint8Array(100));
      },
    });
    const request = new Request("http://localhost/api/views", {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit);
    expect(await readLimitedText(request, 512)).toBeNull();
    expect(pulled).toBeLessThan(20);
  });
});
