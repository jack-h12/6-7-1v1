/** Random meme banter strings sprinkled into the UI. */

export const WIN_TAGLINES = [
  "Certified meme lord.",
  "Wrist of the generation.",
  "They will study this at Harvard.",
  "Undisputed 6-7 champion.",
  "You cooked. Deeply.",
];

export const LOSE_TAGLINES = [
  "Respectfully… mid.",
  "L + ratio + take the stairs.",
  "Touch some grass. Rematch?",
  "The algorithm is disappointed.",
  "Wrist game needs work.",
];

export const TIE_TAGLINES = [
  "Evenly deranged.",
  "Balanced. As all things should be.",
  "Both certified yappers. No winners.",
];

export const ILLEGAL_CALLOUTS = [
  "Illegal technique detected!",
  "Suspicious wrist activity.",
  "The FBI is watching.",
  "Blatant violation of the Geneva Convention.",
];

export const MILESTONES: Record<number, string> = {
  5: "NICE.",
  10: "MEME COMBO!",
  15: "CERTIFIED YAPPER",
  20: "UNHINGED",
  25: "WRIST OF THE GODS",
  30: "CALL AN AMBULANCE",
  40: "UNSTOPPABLE",
  50: "BEYOND HUMAN",
};

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
