import { NextResponse } from 'next/server';
import { StoryResponse } from '@/lib/types';

export async function POST(req: Request) {
  try {
    const { userChoice, previousContext, seed } = await req.json();
    const currentSeed = seed || Math.floor(Math.random() * 100000);

    const systemPrompt = `You are The narrator for Frond & Forest, an interactive children's book generator.
Return ONLY a valid raw JSON object. Do NOT wrap output in markdown code fences or backticks.
Schema:
{
  "narration": "1-3 simple sentences for children.",
  "image_prompt": "Vivid 3D digital art style scene description, vibrant colors, child storybook illustration",
  "interactive_options": [
    {"label": "Short action text", "action": "action_id"}
  ]
}`;

    const res = await fetch("https://api.featherless.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.FEATHERLESS_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "Qwen/Qwen2.5-7B-Instruct",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Context: ${previousContext || "The adventure begins."} Choice made: ${userChoice || "Start"}` }
        ],
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      throw new Error(`Featherless API responded with status ${res.status}`);
    }

    const data = await res.json();
    const rawContent = data.choices[0].message.content.trim();
    
    // Clean markdown code blocks (```json ... ```)
    const sanitizedString = rawContent.replace(/^```(?:json)?\s*|\s*```$/gi, '');
    const parsedContent = JSON.parse(sanitizedString);

    const responsePayload: StoryResponse = {
      ...parsedContent,
      seed: currentSeed
    };

    return NextResponse.json(responsePayload);
  } catch (error: unknown) {
    console.error("Story API Error:", error);
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to generate story scene", details },
      { status: 500 }
    );
  }
}
