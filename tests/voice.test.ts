import { describe, expect, it } from "vitest";
import {
  isVoiceSuggestionCurrent,
  matchVoiceChoice,
} from "@/lib/voice";

const choices = [
  { label: "Follow the fireflies", action: "follow" },
  { label: "Open the tiny door", action: "open" },
];

describe("matchVoiceChoice", () => {
  it("automatically matches an exact choice label", () => {
    expect(matchVoiceChoice("I want to follow the fireflies", choices)).toEqual({
      kind: "exact",
      choice: choices[0],
    });
  });

  it("requires confirmation for a close match", () => {
    const result = matchVoiceChoice(
      "Flake follows the fireflies",
      [{ label: "Flick follows the fireflies", action: "follow" }],
    );
    expect(result.kind).toBe("confirm");
  });

  it("rejects ambiguous close matches", () => {
    const result = matchVoiceChoice(
      "Open the green drow",
      [
        { label: "Open the green door", action: "door" },
        { label: "Open the green drawer", action: "drawer" },
      ],
    );
    expect(result.kind).toBe("ambiguous");
  });

  it("does not match unrelated or empty transcripts", () => {
    expect(matchVoiceChoice("", choices).kind).toBe("none");
    expect(matchVoiceChoice("What is the boy's name?", choices).kind).toBe("none");
  });

  it("does not auto-select a sole choice from unrelated speech", () => {
    expect(
      matchVoiceChoice("Tell me the boy's name", [
        { label: "Follow the fireflies", action: "follow" },
      ]).kind,
    ).toBe("none");
  });
});

describe("voice suggestion freshness", () => {
  it("rejects confirmations from an older scene", () => {
    expect(
      isVoiceSuggestionCurrent(
        {
          transcript: "Flake follows the fireflies",
          choice: choices[0],
          sceneId: 2,
        },
        3,
        choices,
      ),
    ).toBe(false);
  });
});
