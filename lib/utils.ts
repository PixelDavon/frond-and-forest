export function cleanTextForSpeech(text: string): string {
  return text
    .replace(/[*`]/g, "")
    .replace(/\\(["'])/g, "$1");
}