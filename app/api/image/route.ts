import { NextResponse } from "next/server";
import {
  ApiValidationError,
  MAX_IMAGE_BODY_BYTES,
  MAX_IMAGE_PROMPT_LENGTH,
  optionalSeed,
  readJsonObject,
  requiredString,
} from "@/lib/api-validation";

const IMAGE_TIMEOUT_MS = 10_000;

export async function POST(req: Request) {
  try {
    const body = await readJsonObject(req, MAX_IMAGE_BODY_BYTES);
    const prompt = requiredString(
      body.prompt,
      "prompt",
      MAX_IMAGE_PROMPT_LENGTH,
    );
    const seed = optionalSeed(body.seed) ?? 0;
    const cleanPrompt = prompt.replace(/[^a-zA-Z0-9 ,.-]/g, "").slice(0, 280);
    if (!cleanPrompt.trim()) {
      throw new ApiValidationError("prompt must contain usable text.");
    }

    if (process.env.CF_ACCOUNT_ID && process.env.CF_API_TOKEN) {
      try {
        const cloudflareResponse = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.CF_API_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              prompt: cleanPrompt,
              steps: 4,
            }),
            signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
          },
        );

        if (cloudflareResponse.ok) {
          const cloudflareData: unknown = await cloudflareResponse.json();
          if (
            cloudflareData &&
            typeof cloudflareData === "object" &&
            "result" in cloudflareData &&
            cloudflareData.result &&
            typeof cloudflareData.result === "object" &&
            "image" in cloudflareData.result &&
            typeof cloudflareData.result.image === "string" &&
            cloudflareData.result.image.length > 0
          ) {
            return NextResponse.json({
              image_url: `data:image/jpeg;base64,${cloudflareData.result.image}`,
              provider: "cloudflare",
            });
          }
          console.error("Cloudflare image response did not contain an image.");
        } else {
          console.error("Cloudflare image provider returned a non-OK response.");
        }
      } catch {
        console.warn("Cloudflare image provider failed; using fallback.");
      }
    }

    const encodedPrompt = encodeURIComponent(cleanPrompt);
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&seed=${seed}&nologo=true&model=flux`;

    return NextResponse.json({
      image_url: pollinationsUrl,
      provider: "pollinations",
    });
  } catch (error: unknown) {
    if (error instanceof ApiValidationError) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 },
      );
    }

    console.error("Image API request failed.");
    return NextResponse.json(
      { error: "Failed to render image." },
      { status: 502 },
    );
  }
}
