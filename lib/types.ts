export type AppStatus =
  | "idle"
  | "fetching_story"
  | "generating_image"
  | "narrating";

export interface InteractiveOption {
  label: string;
  action: string;
}

export interface StoryResponse {
  narration: string;
  image_prompt: string;
  interactive_options: InteractiveOption[];
  seed: number;
  image_url?: string;
}

export interface StoryRequest {
  userChoice?: string;
  previousContext?: string;
  seed?: number;
}