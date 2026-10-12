import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as storyPost } from "@/app/api/story/route";
import { POST as imagePost } from "@/app/api/image/route";

const originalFetch = globalThis.fetch;
const originalEnvironment = {
  FEATHERLESS_API_KEY: process.env.FEATHERLESS_API_KEY,
  CF_ACCOUNT_ID: process.env.CF_ACCOUNT_ID,
  CF_API_TOKEN: process.env.CF_API_TOKEN,
};

function request(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  process.env.FEATHERLESS_API_KEY = originalEnvironment.FEATHERLESS_API_KEY;
  process.env.CF_ACCOUNT_ID = originalEnvironment.CF_ACCOUNT_ID;
  process.env.CF_API_TOKEN = originalEnvironment.CF_API_TOKEN;
});

describe("story route protections", () => {
  it("rejects malformed and oversized request bodies", async () => {
    const malformed = await storyPost(
      new Request("http://localhost/api/story", {
        method: "POST",
        body: "{not-json",
      }),
    );
    expect(malformed.status).toBe(400);

    const oversized = await storyPost(
      request("/api/story", { previousContext: "x".repeat(9_000) }),
    );
    expect(oversized.status).toBe(400);
  });

  it("fails safely when the story credential is missing", async () => {
    delete process.env.FEATHERLESS_API_KEY;
    const response = await storyPost(request("/api/story", {}));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Story generation is not configured.",
    });
  });

  it("repairs model output with missing choices", async () => {
    process.env.FEATHERLESS_API_KEY = "test-only";
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  '{"narration":"Only text","image_prompt":"A safe forest scene"}',
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const response = await storyPost(request("/api/story", {}));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      interactive_options: [
        {
          label: "Continue forward into the forest",
          action: "continue_forward",
        },
        {
          label: "Look closely at your surroundings",
          action: "look_around",
        },
      ],
    });
  });

  it("repairs a valid story response with one choice", async () => {
    process.env.FEATHERLESS_API_KEY = "test-only";
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  narration: "A friendly bird chirps nearby.",
                  image_prompt: "A safe forest clearing with a friendly bird",
                  interactive_options: [
                    { label: "Follow the bird", action: "follow_bird" },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const response = await storyPost(request("/api/story", {}));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      interactive_options: [
        { label: "Follow the bird", action: "follow_bird" },
        {
          label: "Explore another part of the forest",
          action: "explore_another_area",
        },
      ],
    });
  });

  it("truncates an oversized image prompt before validation", async () => {
    process.env.FEATHERLESS_API_KEY = "test-only";
    const oversizedPrompt = `A safe forest scene ${"with glowing leaves ".repeat(30)}`;
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  narration: "The forest glows softly.",
                  image_prompt: oversizedPrompt,
                  interactive_options: [
                    { label: "Follow the light", action: "follow_light" },
                    { label: "Watch the leaves", action: "watch_leaves" },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const response = await storyPost(request("/api/story", {}));
    expect(response.status).toBe(200);
    const responseBody = await response.json();
    expect(responseBody.image_prompt.length).toBeLessThanOrEqual(250);
    expect(responseBody.image_prompt.endsWith(" ")).toBe(false);
  });

  it("repairs one choice and rejects duplicate story paths", async () => {
    process.env.FEATHERLESS_API_KEY = "test-only";
    const modelResponse = (content: string) =>
      new Response(
        JSON.stringify({ choices: [{ message: { content } }] }),
        { status: 200 },
      );

    globalThis.fetch = vi.fn().mockResolvedValue(
      modelResponse(
        JSON.stringify({
          narration: "A path opens.",
          image_prompt: "A safe forest path",
          interactive_options: [
            { label: "Follow the path", action: "follow_path" },
          ],
        }),
      ),
    );
    const tooFew = await storyPost(request("/api/story", {}));
    expect(tooFew.status).toBe(200);

    globalThis.fetch = vi.fn().mockResolvedValue(
      modelResponse(
        JSON.stringify({
          narration: "Two paths open.",
          image_prompt: "A safe forest path",
          interactive_options: [
            { label: "Follow the path", action: "follow_path" },
            { label: "Follow the path", action: "follow_path_again" },
          ],
        }),
      ),
    );
    const duplicateLabels = await storyPost(request("/api/story", {}));
    expect(duplicateLabels.status).toBe(502);
  });

  it("returns a controlled timeout error", async () => {
    process.env.FEATHERLESS_API_KEY = "test-only";
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new DOMException("timed out", "TimeoutError"));

    const response = await storyPost(request("/api/story", {}));
    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({
      error: "Story generation timed out. Please try again.",
    });
  });
});

describe("image route protections", () => {
  it("rejects missing prompts and invalid seeds", async () => {
    const missingPrompt = await imagePost(request("/api/image", {}));
    expect(missingPrompt.status).toBe(400);

    const invalidSeed = await imagePost(
      request("/api/image", { prompt: "A forest", seed: -1 }),
    );
    expect(invalidSeed.status).toBe(400);
  });

  it("uses Pollinations when Cloudflare is not configured", async () => {
    delete process.env.CF_ACCOUNT_ID;
    delete process.env.CF_API_TOKEN;

    const response = await imagePost(
      request("/api/image", { prompt: "A friendly forest", seed: 42 }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ provider: "pollinations" });
  });

  it("falls back when the Cloudflare provider fails", async () => {
    process.env.CF_ACCOUNT_ID = "test-account";
    process.env.CF_API_TOKEN = "test-only";
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("provider failure"));

    const response = await imagePost(
      request("/api/image", { prompt: "A friendly forest", seed: 42 }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ provider: "pollinations" });
  });
});
