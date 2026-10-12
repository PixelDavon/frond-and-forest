export const MAX_STORY_BODY_BYTES = 8_192;
export const MAX_IMAGE_BODY_BYTES = 4_096;
export const MAX_CONTEXT_LENGTH = 300;
export const MAX_ACTION_LENGTH = 120;
export const MAX_IMAGE_PROMPT_LENGTH = 400;
export const MAX_NARRATION_LENGTH = 600;
export const MAX_OPTION_COUNT = 4;
export const MAX_OPTION_LABEL_LENGTH = 100;
export const MAX_OPTION_ACTION_LENGTH = 80;
export const MAX_SEED = 999_999;

export class ApiValidationError extends Error {}
export class ModelOutputError extends Error {}

export function assertRequestBodySize(req: Request, maxBytes: number): void {
  const contentLength = req.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new ApiValidationError("Request body is too large.");
  }
}

export async function readJsonObject(
  req: Request,
  maxBytes: number,
): Promise<Record<string, unknown>> {
  assertRequestBodySize(req, maxBytes);

  const body = await req.text();
  if (!body || new TextEncoder().encode(body).byteLength > maxBytes) {
    throw new ApiValidationError("Request body is missing or too large.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new ApiValidationError("Request body must be valid JSON.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ApiValidationError("Request body must be a JSON object.");
  }

  return parsed as Record<string, unknown>;
}

export function optionalString(
  value: unknown,
  field: string,
  maxLength: number,
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiValidationError(`${field} must be a non-empty string.`);
  }
  if (value.length > maxLength) {
    throw new ApiValidationError(`${field} is too long.`);
  }
  return value.trim();
}

export function requiredString(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  const result = optionalString(value, field, maxLength);
  if (!result) {
    throw new ApiValidationError(`${field} is required.`);
  }
  return result;
}

export function optionalSeed(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > MAX_SEED
  ) {
    throw new ApiValidationError("seed must be an integer between 0 and 999999.");
  }
  return value;
}

export function validateStoryResponse(value: unknown): {
  narration: string;
  image_prompt: string;
  interactive_options: Array<{ label: string; action: string }>;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiValidationError("Story model output was not an object.");
  }

  const output = value as Record<string, unknown>;
  const narration = requiredString(
    output.narration,
    "narration",
    MAX_NARRATION_LENGTH,
  );
  const imagePrompt = requiredString(
    output.image_prompt,
    "image_prompt",
    MAX_IMAGE_PROMPT_LENGTH,
  );
  const options = output.interactive_options;

  if (
    !Array.isArray(options) ||
    options.length < 2 ||
    options.length > MAX_OPTION_COUNT
  ) {
    throw new ApiValidationError("interactive_options must contain 2 to 4 choices.");
  }

  const labels = new Set<string>();
  const actions = new Set<string>();
  const interactiveOptions = options.map((option) => {
    if (!option || typeof option !== "object" || Array.isArray(option)) {
      throw new ApiValidationError("Each story choice must be an object.");
    }
    const choice = option as Record<string, unknown>;
    const label = requiredString(
      choice.label,
      "choice label",
      MAX_OPTION_LABEL_LENGTH,
    );
    const action = requiredString(
      choice.action,
      "choice action",
      MAX_OPTION_ACTION_LENGTH,
    );
    const normalizedLabel = label.toLocaleLowerCase().replace(/\s+/g, " ");
    const normalizedAction = action.toLocaleLowerCase();

    if (labels.has(normalizedLabel)) {
      throw new ApiValidationError(
        "interactive_options must use distinct choice labels.",
      );
    }
    if (actions.has(normalizedAction)) {
      throw new ApiValidationError(
        "interactive_options must use distinct story paths.",
      );
    }

    labels.add(normalizedLabel);
    actions.add(normalizedAction);
    return { label, action };
  });

  return {
    narration,
    image_prompt: imagePrompt,
    interactive_options: interactiveOptions,
  };
}
