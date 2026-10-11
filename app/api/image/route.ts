import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { prompt, seed } = await req.json();
    const cleanPrompt = prompt
      .replace(/[^a-zA-Z0-9 ,.-]/g, '')
      .slice(0, 280);
    
    // Strategy 1: Server-Side Cloudflare Workers AI (FLUX.1 [schnell])
    if (process.env.CF_ACCOUNT_ID && process.env.CF_API_TOKEN) {
      try {
        const cfRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.CF_API_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              prompt: cleanPrompt,
              steps: 4
            }),
            signal: AbortSignal.timeout(10000),
          }
        );

        if (cfRes.ok) {
          const cfData = await cfRes.json();
          const rawBase64 = cfData.result?.image;
          if (rawBase64) {
            return NextResponse.json({
              image_url: `data:image/jpeg;base64,${rawBase64}`,
              provider: "cloudflare"
            });
          }
          console.error("Cloudflare AI response missing image:", cfData);
        } else {
          console.error("Cloudflare AI Error:", cfRes.status, await cfRes.text());
        }
      } catch (cfErr) {
        console.warn("Cloudflare FLUX failed. Falling back to Pollinations...", cfErr);
      }
    }

    // Strategy 2: Zero-Key Fallback (Pollinations.ai)
    const encodedPrompt = encodeURIComponent(cleanPrompt);
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&seed=${seed}&nologo=true&model=flux`;

    return NextResponse.json({ 
      image_url: pollinationsUrl,
      provider: "pollinations"
    }); 
  } catch {
    return NextResponse.json({ error: "Failed to render image" }, { status: 500 });
  }
}
