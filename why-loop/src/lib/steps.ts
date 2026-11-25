/** The seven steps of the Why Loop, shown one at a time in the Lectures tab. */
export interface Step {
  title: string;
  /** One line, shown in the list of all steps. */
  how: string;
  /** Rough time the step should take. */
  time: string;
  /** What to do, in order. */
  todo: string[];
  /** The same step done on a real lecture (G-protein receptors). */
  example: string;
}

export const STEPS_FULL: Step[] = [
  {
    title: 'Sort',
    how: 'Topic by topic: is there a reason behind it, or do I just memorize it?',
    time: '2 min',
    todo: [
      'Skim the slide titles.',
      'For each topic ask: is there a reason behind this, or do I just have to memorize it?',
      'Reason topics get the full loop. Memorize topics (names, lists, labels) just get plain cards. Never invent a why for those.',
      'Not sure? If the slides give a reason, it is a reason topic. If you cannot find one in 2 minutes, treat it as memorize and write ?? next to it.',
    ],
    example:
      'How the G-protein cycle works has reasons, so it gets the loop. The list of G-protein types (Gs, Gi, Gq) is just a list, so plain cards.',
  },
  {
    title: 'Questions',
    how: 'Turn the learning objectives into how and why questions. Note the slide range.',
    time: '5 min',
    todo: [
      'Find the learning objectives. No objectives? Use practice questions, section headings, or slide titles.',
      'Rewrite each one as a How or Why question. Any wording is fine.',
      'Pick the shape: if you can point at it, it is a Thing. If it is a story of events, it is a Process. If you compute something, it is a Calculation.',
      'Type your questions below, one per line. They go into your page with the fixed questions under each.',
    ],
    example: `Objective: "Describe the G-protein cycle." Becomes: "How does a G-protein receptor pass the hormone's signal into the cell?" (slides 31 to 35). Shape: Thing.`,
  },
  {
    title: 'Pretest',
    how: 'Answer 3 to 5 practice questions cold. Being wrong is fine. Skip if there are none.',
    time: '2 min',
    todo: [
      "Answer 3 to 5 of the professor's practice questions before reading anything.",
      'Being wrong is fine. Do not read the explanations yet.',
      'No practice questions, or only a few? Skip this step and save them for later.',
    ],
    example: 'The G-protein practice bank had one question, so this step was skipped.',
  },
  {
    title: 'Map',
    how: 'Sources open, 20 minutes max. Answer the fixed questions in your own words. Write ?? where no reason is given.',
    time: '20 min max',
    todo: [
      'Start the timer. Keep your sources open: slides first, then notes, then search the transcript.',
      'Under each fixed question, write the answer in your own words. Short phrases and arrows. This is read and rewrite, not a quiz.',
      'Every arrow needs a because. If the source gives a what but no why, write ??.',
      'When the timer ends, stop. Write ?? on anything unfinished.',
    ],
    example:
      'Where is it, and why there? "Spans the membrane, because a water-soluble hormone cannot cross the fatty membrane." What if it breaks? "??" (the slides did not say).',
  },
  {
    title: 'Cards',
    how: '10 to 15 at most. At least half blank the reason or what happens next. One what-if card.',
    time: '10 min',
    todo: [
      'Make 10 to 15 cards at most.',
      'At least half must blank the reason or what happens next. None may blank only a name.',
      'Add one what-if card.',
      'Check each card: could I get this right just by remembering a word? If yes, rewrite it.',
      'If you use the Bubble Map plugin, its Study button has a Card check that counts this for you.',
    ],
    example:
      'Bad: "Gs activates {{adenylate cyclase}}." Good: "The receptor sits across the membrane because {{a water-soluble hormone cannot cross the fatty membrane}}." What-if: "If G-alpha cannot cut GTP, then {{the effector stays on}}."',
  },
  {
    title: 'Quick test',
    how: '5 to 7 exam-style questions on this topic. Type "I think it is X because Y" first.',
    time: '10 min',
    todo: [
      "Do 5 to 7 exam-style questions on only this topic. Use the professor's set first.",
      'Before you look at the choices, type or say: "I think it is X because Y."',
      'Enter your score below. A good score right after studying is encouraging, not proof.',
    ],
    example: 'G-proteins: 7 of 7, including two twists never seen before.',
  },
  {
    title: 'Miss log',
    how: 'Log wrong reasoning only, not careless slips.',
    time: '2 min',
    todo: [
      'For each question you got wrong because your reasoning was wrong, log one line in the Miss log tab.',
      'Skip careless slips like misreading.',
      'Fix the map where the arrow was wrong, and add a what-if card on it.',
      'In one week the log brings each miss back. Use a fresh question, not the same one.',
    ],
    example:
      'Question: What dissociates after GTP binds? I said: the hormone-receptor complex. Right reason: G-alpha-GTP leaves the receptor and beta-gamma.',
  },
];

/** [title, how] pairs, used for the checkbox list and step counts. */
export const STEPS: [string, string][] = STEPS_FULL.map((s) => [s.title, s.how]);

/** Step indexes that have extra controls. */
export const QUESTIONS_STEP = 1;
export const PRETEST_STEP = 2;
export const MAP_STEP = 3;
export const CARDS_STEP = 4;
export const QUICK_TEST_STEP = 5;
export const MISS_LOG_STEP = 6;

/** The fixed sub-questions added under each how/why question, by shape. */
export const QUESTION_SETS: Record<string, string[]> = {
  Thing: ['What turns it on, and why?', 'Where is it, and why there?', 'What happens next?', 'What if it breaks?'],
  Process: ['What starts it?', 'What are the steps, in order?', 'What sets the rate (the limiting step)?', 'What breaks the chain?'],
  Calculation: ["What's given?", "What's asked?", 'Which equation, and why that one?', 'Does the answer make sense?'],
};

/** Self-check after the Teach it box. */
export const TEACH_CHECKS = ['I gave the reason', 'My arrows go the right way', 'I explained every big word'];

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
