/**
 * Gratitude prompt definitions.
 * Each prompt has an id, text, and tags for rotation.
 */

export interface Prompt {
  id: string;
  text: string;
  tags: string[];
}

/**
 * Curated prompts for gratitude reflection.
 * First tag is the "primary tag" used for rotation rules.
 */
export const PROMPTS: Prompt[] = [
  // People
  {
    id: "p01",
    text: "Who made you smile today, and what did they do?",
    tags: ["people", "recent"],
  },
  {
    id: "p02",
    text: "Think of someone who helped you recently. What did their help mean to you?",
    tags: ["people", "support"],
  },
  {
    id: "p03",
    text: "Who in your life do you often take for granted? What do they bring to your life?",
    tags: ["people", "awareness"],
  },
  {
    id: "p04",
    text: "Describe a moment when someone showed you unexpected kindness.",
    tags: ["people", "kindness"],
  },
  {
    id: "p05",
    text: "Who taught you something valuable? What was the lesson?",
    tags: ["people", "growth"],
  },

  // Moments
  {
    id: "m01",
    text: "What small moment today brought you peace or joy?",
    tags: ["moments", "recent"],
  },
  {
    id: "m02",
    text: "Describe a moment this week when you felt truly present.",
    tags: ["moments", "mindfulness"],
  },
  {
    id: "m03",
    text: "What unexpected thing happened recently that turned out well?",
    tags: ["moments", "surprise"],
  },
  {
    id: "m04",
    text: "What simple pleasure did you enjoy today?",
    tags: ["moments", "simple"],
  },
  {
    id: "m05",
    text: "Recall a recent moment of laughter. What made it funny?",
    tags: ["moments", "joy"],
  },

  // Self
  {
    id: "s01",
    text: "What's something you did well today, even if small?",
    tags: ["self", "accomplishment"],
  },
  {
    id: "s02",
    text: "What personal quality helped you through a challenge recently?",
    tags: ["self", "strength"],
  },
  {
    id: "s03",
    text: "What did you learn about yourself this week?",
    tags: ["self", "growth"],
  },
  {
    id: "s04",
    text: "How did you take care of yourself today?",
    tags: ["self", "care"],
  },
  {
    id: "s05",
    text: "What boundary did you set or maintain that you're grateful for?",
    tags: ["self", "boundaries"],
  },

  // Nature/Environment
  {
    id: "n01",
    text: "What in nature caught your attention recently?",
    tags: ["nature", "observation"],
  },
  {
    id: "n02",
    text: "Describe a place that brought you comfort or peace.",
    tags: ["nature", "place"],
  },
  {
    id: "n03",
    text: "What aspect of the weather or season are you appreciating?",
    tags: ["nature", "seasons"],
  },
  {
    id: "n04",
    text: "What sound, smell, or sight in your environment do you enjoy?",
    tags: ["nature", "senses"],
  },
  {
    id: "n05",
    text: "How has being outdoors or near nature affected your mood recently?",
    tags: ["nature", "wellbeing"],
  },

  // Daily life
  {
    id: "d01",
    text: "What everyday convenience are you grateful for today?",
    tags: ["daily", "convenience"],
  },
  {
    id: "d02",
    text: "What part of your morning routine do you actually enjoy?",
    tags: ["daily", "routine"],
  },
  {
    id: "d03",
    text: "What meal or drink did you really appreciate recently?",
    tags: ["daily", "food"],
  },
  {
    id: "d04",
    text: "What tool or object made your day easier?",
    tags: ["daily", "tools"],
  },
  {
    id: "d05",
    text: "What aspect of your home brings you comfort?",
    tags: ["daily", "home"],
  },

  // Growth/Learning
  {
    id: "g01",
    text: "What mistake taught you something valuable?",
    tags: ["growth", "learning"],
  },
  {
    id: "g02",
    text: "What challenge helped you grow stronger?",
    tags: ["growth", "challenge"],
  },
  {
    id: "g03",
    text: "What new skill or knowledge are you developing that excites you?",
    tags: ["growth", "skills"],
  },
  {
    id: "g04",
    text: "When did you step out of your comfort zone recently? What did you gain?",
    tags: ["growth", "courage"],
  },
  {
    id: "g05",
    text: "What feedback or advice improved something in your life?",
    tags: ["growth", "feedback"],
  },

  // Past/Memory
  {
    id: "r01",
    text: "What happy memory surfaced recently that made you smile?",
    tags: ["memory", "past"],
  },
  {
    id: "r02",
    text: "What past experience are you grateful shaped who you are?",
    tags: ["memory", "identity"],
  },
  {
    id: "r03",
    text: "Who from your past do you feel grateful to have known?",
    tags: ["memory", "people"],
  },
  {
    id: "r04",
    text: "What difficult time in your past are you now grateful you went through?",
    tags: ["memory", "resilience"],
  },
  {
    id: "r05",
    text: "What tradition or memory from childhood do you still value?",
    tags: ["memory", "childhood"],
  },
];

/**
 * Get a prompt by ID.
 */
export function getPromptById(id: string): Prompt | undefined {
  return PROMPTS.find((p) => p.id === id);
}

/**
 * Get the primary tag (first tag) for a prompt.
 */
export function getPrimaryTag(prompt: Prompt): string {
  return prompt.tags[0] || "general";
}
