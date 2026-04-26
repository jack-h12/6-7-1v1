/** Random meme banter strings sprinkled into the UI. */

export const WIN_TAGLINES = [
  "67 king",
  "They will study this at Harvard.",
  "Undisputed 67 champion.",
  "You cooked. Deeply.",
];

export const LOSE_TAGLINES = [
  "L + ratio + your brain is still healthy",
  "Brain has not rotted",
  "67 game needs work.",
];

export const TIE_TAGLINES = [
  "Evenly deranged.",
  "Balanced. As all things should be.",
  "Both equally brainrotted. No winners.",
];

export const ILLEGAL_CALLOUTS = [
  "Illegal technique detected!",
  "That ain't the 67 twin",
  "Whatchu doing gng that ain't it",
];

export const MILESTONES: Record<number, string> = {
  5: "NICE.",
  10: "COOKING",
  15: "67676767",
  20: "UNHINGED",
  25: "USAIN BOLT WASN'T THIS FAST",
  30: "CALL AN AMBULANCE",
  40: "UNSTOPPABLE",
  50: "BEYOND HUMAN",
};

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
