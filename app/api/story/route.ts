import { NextResponse } from "next/server";
import { StoryResponse } from "@/lib/types";
import {
  ApiValidationError,
  MAX_ACTION_LENGTH,
  MAX_CONTEXT_LENGTH,
  MAX_STORY_BODY_BYTES,
  ModelOutputError,
  optionalSeed,
  optionalString,
  readJsonObject,
  validateStoryResponse,
} from "@/lib/api-validation";

const STORY_TIMEOUT_MS = 15_000;

export async function POST(req: Request) {
  try {
    const body = await readJsonObject(req, MAX_STORY_BODY_BYTES);
    const userChoice = optionalString(
      body.userChoice,
      "userChoice",
      MAX_ACTION_LENGTH,
    );
    const previousContext = optionalString(
      body.previousContext,
      "previousContext",
      MAX_CONTEXT_LENGTH,
    );
    const requestedSeed = optionalSeed(body.seed);
    const currentSeed =
      requestedSeed ?? Math.floor(Math.random() * 100_000);
    const apiKey = process.env.FEATHERLESS_API_KEY;

    if (!apiKey) {
      console.error("Story API is not configured: FEATHERLESS_API_KEY is missing.");
      return NextResponse.json(
        { error: "Story generation is not configured." },
        { status: 503 },
      );
    }

    const systemPrompt = `You are the narrator for Frond & Forest, an interactive children's book generator.
Return ONLY a valid raw JSON object. Do NOT wrap output in markdown code fences or backticks.
Create gentle, age-appropriate content for young children. Do not include violence, abuse, frightening threats, sexual content, profanity, hate, self-harm, dangerous instructions, or realistic weapons. Keep the narration positive and suitable for supervised storytime.
The image prompt must describe a safe, non-threatening children's storybook illustration and must not request text, logos, realistic weapons, or frightening imagery.
Return 2-4 choices. Every choice must be a genuinely different way to continue the story, with a distinct consequence, discovery, or direction. Do not offer synonyms, reworded duplicates, or choices that lead to the same immediate outcome. Give every choice a unique, descriptive action id that represents its story path.
Keep 'image_prompt' concise (under 25 words).
Schema:
{
  "narration": "1-3 simple sentences for children.",
  "image_prompt": "Vivid 3D digital art style scene description, vibrant colors, child storybook illustration",
  "interactive_options": [
    {"label": "First action description", "action": "unique_action_id_1"},
    {"label": "Second action description", "action": "unique_action_id_2"}
  ]
}`;

    const response = await fetch("https://api.featherless.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "Qwen/Qwen2.5-7B-Instruct",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Context: ${previousContext || "The adventure begins."} Choice made: ${userChoice || "Start"}`,
          },
        ],
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(STORY_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error("Story provider returned a non-OK response.");
      return NextResponse.json(
        { error: "Story generation is temporarily unavailable." },
        { status: 502 },
      );
    }

    const data: unknown = await response.json();
    if (
      !data ||
      typeof data !== "object" ||
      !("choices" in data) ||
      !Array.isArray(data.choices) ||
      !data.choices[0] ||
      typeof data.choices[0] !== "object" ||
      !("message" in data.choices[0]) ||
      !data.choices[0].message ||
      typeof data.choices[0].message !== "object" ||
      !("content" in data.choices[0].message) ||
      typeof data.choices[0].message.content !== "string"
    ) {
      throw new ModelOutputError("Story provider returned an invalid response.");
    }

    const rawContent = data.choices[0].message.content.trim();
    const sanitizedString = rawContent.replace(
      /^```(?:json)?\s*|\s*```$/gi,
      "",
    );
    let parsedContent: unknown;
    let validatedContent: ReturnType<typeof validateStoryResponse>;
    try {
      parsedContent = JSON.parse(sanitizedString);
      if (
        parsedContent &&
        typeof parsedContent === "object" &&
        !Array.isArray(parsedContent)
      ) {
        const storyObject = parsedContent as Record<string, unknown>;
        if (typeof storyObject.image_prompt === "string") {
          let promptStr = storyObject.image_prompt.trim();
          if (promptStr.length > 250) {
            const lastSpace = promptStr.lastIndexOf(" ", 250);
            promptStr = promptStr.slice(
              0,
              lastSpace > 0 ? lastSpace : 250,
            );
          }
          storyObject.image_prompt = promptStr;
        } else {
          storyObject.image_prompt =
            "Vivid 3D child storybook illustration of a magical forest";
        }

        const options = storyObject.interactive_options;
        if (!Array.isArray(options)) {
          storyObject.interactive_options = [];
        }

        const repairedOptions = storyObject.interactive_options as unknown[];
        if (repairedOptions.length === 1) {
          repairedOptions.push({
            label: "Explore another part of the forest",
            action: "explore_another_area",
          });
        } else if (repairedOptions.length === 0) {
          storyObject.interactive_options = [
            {
              label: "Continue forward into the forest",
              action: "continue_forward",
            },
            {
              label: "Look closely at your surroundings",
              action: "look_around",
            },
          ];
        } else if (repairedOptions.length > 4) {
          storyObject.interactive_options = repairedOptions.slice(0, 4);
        }
      }

      validatedContent = validateStoryResponse(parsedContent);
    } catch (validationError: unknown) {
      if (process.env.NODE_ENV === "development") {
        console.error("Story model output validation diagnostic:");
        console.dir(validationError, { depth: null });
        console.error("Raw story model output:");
        console.dir(rawContent, { depth: null });
      }
      throw new ModelOutputError("Story provider returned invalid story data.");
    }
    const responsePayload: StoryResponse = {
      ...validatedContent,
      seed: currentSeed,
    };

    return NextResponse.json(responsePayload);
  } catch (error: unknown) {
    if (error instanceof ApiValidationError) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 },
      );
    }

    if (error instanceof ModelOutputError) {
      console.error("Story provider returned invalid story data.");
      return NextResponse.json(
        { error: "Story generation returned invalid data. Please try again." },
        { status: 502 },
      );
    }

    if (error instanceof DOMException && error.name === "TimeoutError") {
      console.error("Story provider request timed out.");
      return NextResponse.json(
        { error: "Story generation timed out. Please try again." },
        { status: 504 },
      );
    }

    console.error("Story API request failed.");
    return NextResponse.json(
      { error: "Failed to generate story scene." },
      { status: 502 },
    );
  }
}
