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
export const PROMPTS: Prompt[] = 
[
  {
    "id": "d01",
    "text": "Okay, easy one. What's something you ate recently that was actually good?",
    "tags": ["low-demand", "sensory", "trust-building"]
  },
  {
    "id": "d02",
    "text": "Think back. When's the last time you heard a sound that wasn't your phone?",
    "tags": ["low-demand", "sensory", "grounding", "anti-rumination"]
  },
  {
    "id": "d03",
    "text": "When did you feel physically comfortable in the last day or so? (Doesn't have to be profound.)",
    "tags": ["low-demand", "sensory", "trust-building"]
  },
  {
    "id": "d04",
    "text": "What's one thing you saw recently that looked… nice? (Low bar, I know.)",
    "tags": ["low-demand", "observational", "trust-building"]
  },
  {
    "id": "d05",
    "text": "Any smells from the last few days stick out? Good or bad, doesn't matter.",
    "tags": ["low-demand", "sensory", "variety"]
  },
  {
    "id": "d06",
    "text": "What's the last thing you touched that had a texture you didn't hate?",
    "tags": ["low-demand", "sensory", "grounding"]
  },
  {
    "id": "d07",
    "text": "When was the temperature just right recently? Rare, I know.",
    "tags": ["low-demand", "sensory", "temporal"]
  },
  {
    "id": "d08",
    "text": "What's something you did recently just because you wanted to? No other reason.",
    "tags": ["medium-demand", "personal", "variety"]
  },
  {
    "id": "d09",
    "text": "Look, I know this is weird, but—what did the sky look like yesterday?",
    "tags": ["low-demand", "observational", "grounding"]
  },
  {
    "id": "d10",
    "text": "What's something you own that serves no purpose but you keep it anyway?",
    "tags": ["medium-demand", "personal", "variety", "anti-rumination"]
  },
  {
    "id": "d11",
    "text": "When's the last time you had a stretch where no one needed anything from you?",
    "tags": ["medium-demand", "personal", "temporal"]
  },
  {
    "id": "d12",
    "text": "Think of a moment this week where you had enough time for something. What was it?",
    "tags": ["medium-demand", "personal", "temporal"]
  },
  {
    "id": "d13",
    "text": "Okay, real talk—when did something actually work the first try recently?",
    "tags": ["low-demand", "personal", "variety"]
  },
  {
    "id": "d14",
    "text": "Pick one random second from yesterday. What were you looking at?",
    "tags": ["medium-demand", "observational", "temporal", "high-specificity"]
  },
  {
    "id": "d15",
    "text": "What's something you looked at recently for absolutely no reason?",
    "tags": ["medium-demand", "observational", "anti-rumination"]
  },
  {
    "id": "d16",
    "text": "Describe the light in whatever room you're in right now. (Or were in earlier. Whatever.)",
    "tags": ["medium-demand", "sensory", "observational", "grounding"]
  },
  {
    "id": "d17",
    "text": "What annoying thing did NOT happen this week? (Wins are wins.)",
    "tags": ["low-demand", "personal", "variety", "anti-rumination"]
  },
  {
    "id": "d18",
    "text": "When's the last time you just… stood somewhere? Doing nothing?",
    "tags": ["medium-demand", "personal", "temporal", "grounding"]
  },
  {
    "id": "d19",
    "text": "What's one thing you noticed outside in the last day or two?",
    "tags": ["low-demand", "observational", "grounding"]
  },
  {
    "id": "d20",
    "text": "Pick one bite of food from this week. What did the texture feel like?",
    "tags": ["medium-demand", "sensory", "temporal", "high-specificity"]
  },
  {
    "id": "d21",
    "text": "Think of a recent moment where absolutely nothing was expected of you.",
    "tags": ["medium-demand", "personal", "temporal", "anti-rumination"]
  },
  {
    "id": "d22",
    "text": "Okay, think back. When's the last time someone made you actually laugh? What happened?",
    "tags": ["medium-demand", "social", "temporal"]
  },
  {
    "id": "d23",
    "text": "What did you drink this week that actually tasted like something?",
    "tags": ["low-demand", "sensory", "temporal"]
  },
  {
    "id": "d24",
    "text": "When did the weather do something that wasn't terrible?",
    "tags": ["low-demand", "observational", "temporal"]
  },
  {
    "id": "d25",
    "text": "What's something from this week you haven't told anyone about yet?",
    "tags": ["medium-demand", "personal", "temporal", "variety"]
  },
  {
    "id": "d26",
    "text": "What's something you've been holding onto for no logical reason?",
    "tags": ["medium-demand", "personal", "variety"]
  },
  {
    "id": "d27",
    "text": "When's the last time you said no to something and didn't feel bad about it?",
    "tags": ["medium-demand", "personal", "temporal"]
  },
  {
    "id": "d28",
    "text": "Think of a place you walked through recently. What's one thing you remember seeing?",
    "tags": ["medium-demand", "observational", "temporal", "high-specificity"]
  },
  {
    "id": "d29",
    "text": "What's the last completely pointless thing you did that felt fine?",
    "tags": ["medium-demand", "personal", "anti-rumination"]
  },
  {
    "id": "d30",
    "text": "Pick a conversation from this week. What's one specific thing they said?",
    "tags": ["high-specificity", "social", "temporal", "deepen"]
  },
  {
    "id": "d31",
    "text": "When did you feel like you had your shit together recently, even for a minute?",
    "tags": ["medium-demand", "personal", "temporal"]
  },
  {
    "id": "d32",
    "text": "What sound have you been hearing a lot lately that you don't usually notice?",
    "tags": ["medium-demand", "sensory", "observational"]
  },
  {
    "id": "d33",
    "text": "Think of someone who was just… easy to be around recently. Who?",
    "tags": ["medium-demand", "social", "temporal"]
  },
  {
    "id": "d34",
    "text": "What's one thing from the last month you'd rewind to for just a second?",
    "tags": ["medium-demand", "personal", "temporal", "deepen"]
  },
  {
    "id": "d35",
    "text": "When's the last time you were genuinely curious about something?",
    "tags": ["medium-demand", "personal", "temporal"]
  },
  {
    "id": "d36",
    "text": "What did your hands do today that wasn't typing or scrolling?",
    "tags": ["medium-demand", "sensory", "observational", "grounding"]
  },
  {
    "id": "d37",
    "text": "Think of the last time you were outside. What did the air feel like?",
    "tags": ["medium-demand", "sensory", "temporal", "high-specificity"]
  },
  {
    "id": "d38",
    "text": "What minor disaster did you avoid this week without even trying?",
    "tags": ["low-demand", "personal", "variety"]
  },
  {
    "id": "d39",
    "text": "When did you recently waste time in a way that felt perfectly fine?",
    "tags": ["medium-demand", "personal", "temporal", "anti-rumination"]
  },
  {
    "id": "d40",
    "text": "What's the last thing someone texted you that didn't need a response?",
    "tags": ["low-demand", "social", "temporal"]
  },
  {
    "id": "d41",
    "text": "Pick one moment from today. What time was it? What were you wearing?",
    "tags": ["high-specificity", "temporal", "personal", "deepen"]
  },
  {
    "id": "d42",
    "text": "What's something that took less time than you expected recently?",
    "tags": ["low-demand", "personal", "temporal"]
  },
  {
    "id": "d43",
    "text": "Think of a color you saw this week that stood out. Where was it?",
    "tags": ["medium-demand", "observational", "temporal", "high-specificity"]
  },
  {
    "id": "d44",
    "text": "When's the last time your body felt good at something?",
    "tags": ["medium-demand", "sensory", "personal", "temporal"]
  },
  {
    "id": "d45",
    "text": "What's the last thing someone did that they didn't have to do?",
    "tags": ["medium-demand", "social", "temporal"]
  },
  {
    "id": "d46",
    "text": "Pick one thing you ate this week. Describe the first bite.",
    "tags": ["high-specificity", "sensory", "temporal", "deepen"]
  },
  {
    "id": "d47",
    "text": "What's a routine thing you did recently that felt… different somehow?",
    "tags": ["medium-demand", "personal", "observational", "variety"]
  },
  {
    "id": "d48",
    "text": "When did you feel relieved about something this week?",
    "tags": ["medium-demand", "personal", "temporal"]
  },
  {
    "id": "d49",
    "text": "What's the last thing you stared at while thinking about nothing?",
    "tags": ["medium-demand", "observational", "temporal", "anti-rumination"]
  },
  {
    "id": "d50",
    "text": "Think of a room you were in yesterday. What was the temperature like?",
    "tags": ["high-specificity", "sensory", "temporal", "deepen"]
  },
  {
    "id": "d51",
    "text": "What made you forget about your phone for a minute recently?",
    "tags": ["medium-demand", "personal", "temporal", "grounding"]
  },
  {
    "id": "d52",
    "text": "When's the last time you had a good coincidence or timing work out?",
    "tags": ["low-demand", "personal", "temporal"]
  },
  {
    "id": "d53",
    "text": "What's one sound from this week you could still hear if you thought about it?",
    "tags": ["high-specificity", "sensory", "temporal", "deepen"]
  },
  {
    "id": "d54",
    "text": "Think of someone who gets you. What do they get?",
    "tags": ["medium-demand", "social", "deepen"]
  },
  {
    "id": "d55",
    "text": "What's the last thing you did slowly on purpose?",
    "tags": ["medium-demand", "personal", "temporal", "grounding"]
  },
  {
    "id": "d56",
    "text": "Pick a small object near you right now. Describe what it feels like to touch.",
    "tags": ["high-specificity", "sensory", "grounding", "deepen"]
  },
  {
    "id": "d57",
    "text": "When did something surprise you in a low-stakes, good way recently?",
    "tags": ["medium-demand", "personal", "temporal", "variety"]
  },
  {
    "id": "d58",
    "text": "What's one thing you're looking forward to that isn't a big deal?",
    "tags": ["low-demand", "personal", "anti-rumination"]
  },
  {
    "id": "d59",
    "text": "Think of the last time you laughed alone. What was funny?",
    "tags": ["medium-demand", "personal", "temporal"]
  },
  {
    "id": "d60",
    "text": "What's one moment from this past month that you'd keep if you could?",
    "tags": ["medium-demand", "personal", "temporal", "deepen"]
  }
]


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
