import type { InteractiveOption } from "@/lib/types";

export interface VoiceChoiceSuggestion {
  transcript: string;
  choice: InteractiveOption;
  sceneId: number;
}

export type VoiceChoiceMatch =
  | { kind: "exact"; choice: InteractiveOption }
  | { kind: "confirm"; choice: InteractiveOption; score: number }
  | { kind: "ambiguous" }
  | { kind: "none" };

const FUZZY_MATCH_THRESHOLD = 0.84;
const FUZZY_MATCH_MARGIN = 0.08;

function normalize(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex];
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + cost,
      );
      diagonal = above;
    }
  }

  return previous[right.length];
}

function similarity(left: string, right: string): number {
  if (!left || !right) {
    return 0;
  }
  return 1 - editDistance(left, right) / Math.max(left.length, right.length);
}

function bestCandidateScore(transcript: string, label: string): number {
  const transcriptWords = normalize(transcript).split(" ");
  const labelWords = normalize(label).split(" ");
  if (!transcriptWords[0] || !labelWords[0]) {
    return 0;
  }

  const windowSizes = new Set([
    labelWords.length,
    Math.max(1, labelWords.length - 1),
    labelWords.length + 1,
  ]);
  let bestScore = 0;

  for (const windowSize of windowSizes) {
    if (windowSize > transcriptWords.length) {
      continue;
    }
    for (let start = 0; start <= transcriptWords.length - windowSize; start += 1) {
      const window = transcriptWords.slice(start, start + windowSize).join(" ");
      bestScore = Math.max(bestScore, similarity(window, labelWords.join(" ")));
    }
  }

  return bestScore;
}

export function matchVoiceChoice(
  transcript: string,
  options: InteractiveOption[],
): VoiceChoiceMatch {
  const normalizedTranscript = normalize(transcript);
  if (!normalizedTranscript || options.length === 0) {
    return { kind: "none" };
  }

  const exactChoice = options.find((choice) => {
    const label = normalize(choice.label);
    return normalizedTranscript === label || normalizedTranscript.includes(label);
  });
  if (exactChoice) {
    return { kind: "exact", choice: exactChoice };
  }

  const ranked = options
    .map((choice) => ({
      choice,
      score: bestCandidateScore(normalizedTranscript, choice.label),
    }))
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];
  const runnerUp = ranked[1];

  if (!best || best.score < FUZZY_MATCH_THRESHOLD) {
    return { kind: "none" };
  }
  if (runnerUp && best.score - runnerUp.score < FUZZY_MATCH_MARGIN) {
    return { kind: "ambiguous" };
  }

  return { kind: "confirm", choice: best.choice, score: best.score };
}

export function findMatchingChoice(
  transcript: string,
  options: InteractiveOption[],
): InteractiveOption | undefined {
  const match = matchVoiceChoice(transcript, options);
  return match.kind === "exact" ? match.choice : undefined;
}

export function isVoiceSuggestionCurrent(
  suggestion: VoiceChoiceSuggestion,
  currentSceneId: number,
  currentOptions: InteractiveOption[],
): boolean {
  return (
    suggestion.sceneId === currentSceneId &&
    currentOptions.some(
      (choice) =>
        choice.action === suggestion.choice.action &&
        choice.label === suggestion.choice.label,
    )
  );
}
