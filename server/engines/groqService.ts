import type {
  AttentionClass,
  ExtractedConstraint,
  TaskCategory,
  TaskPriority,
} from '../../src/shared/types.js';

export class GroqServiceError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 503) {
    super(message);
    this.name = 'GroqServiceError';
    this.statusCode = statusCode;
  }
}

export interface GroqTaskUnderstandingResult {
  title: string;
  category: TaskCategory;
  priority: TaskPriority;
  deadlineISO: string | null;
  aiEstimatedMinutes: number;
  attentionClass: AttentionClass;
  overlapAllowedWith: AttentionClass[];
  milestones: Array<{ title: string; estimatedMinutes: number }>;
  clarifyingQuestions: string[];
  executionCharacteristics: string[];
  suggestedDependencyTitles: string[];
  suggestedOverlapNote: string;
  summary: string;
  confidence: number;
}

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

async function callGroqJson<T>(
  systemPrompt: string,
  userPrompt: string
): Promise<T> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new GroqServiceError(
      'GROQ_API_KEY is not configured in environment variables. Configure GROQ_API_KEY to enable Groq NLU analysis.',
      503
    );
  }

  const response = await fetch(GROQ_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    throw new GroqServiceError(
      `Groq API error (${response.status}): ${bodyText.slice(0, 240) || response.statusText}`,
      502
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new GroqServiceError('Groq API returned an empty response.', 502);
  }

  try {
    return JSON.parse(content) as T;
  } catch {
    throw new GroqServiceError(
      'Groq API returned malformed JSON payload.',
      502
    );
  }
}

export async function understandTaskWithGroq(params: {
  naturalLanguageInput: string;
  userTimezone: string;
  localDate: string;
  existingTaskTitles: string[];
}): Promise<GroqTaskUnderstandingResult> {
  const systemPrompt = `You are an expert task-understanding engine inside a personal productivity system.
Return ONLY a valid JSON object matching this exact schema:
{
  "title": string (concise, actionable task title),
  "category": one of ["coding","writing","studying","design","meeting","admin","research","background_job","personal","other"],
  "priority": one of ["urgent","high","medium","low"],
  "deadlineISO": string ISO-8601 UTC timestamp or null if none implied,
  "aiEstimatedMinutes": integer (realistic effort minutes between 15 and 600),
  "attentionClass": one of ["attention_intensive","background","partially_attentive"],
  "overlapAllowedWith": array of ["attention_intensive","background","partially_attentive"] (empty for attention_intensive; ["attention_intensive","partially_attentive"] for background),
  "milestones": array of { "title": string, "estimatedMinutes": integer } (0 to 4 items),
  "clarifyingQuestions": array of strings (0 to 3 helpful questions ONLY when genuinely ambiguous),
  "executionCharacteristics": array of short strings (e.g. "Deep focus required", "Can split across sessions"),
  "suggestedDependencyTitles": array of strings matching existingTaskTitles ONLY if clearly prerequisite,
  "suggestedOverlapNote": string explaining whether overlapping is safe or risky,
  "summary": string (1-sentence summary of the work),
  "confidence": number between 0 and 1
}
Never invent fake deadlines. Keep estimates grounded and honest.`;

  const userPrompt = `Current user local date: ${params.localDate} (timezone: ${params.userTimezone})
Existing open task titles: ${JSON.stringify(params.existingTaskTitles.slice(0, 25))}
Task description from user:
"""${params.naturalLanguageInput}"""`;

  const raw = await callGroqJson<Partial<GroqTaskUnderstandingResult>>(
    systemPrompt,
    userPrompt
  );

  const validCategories: TaskCategory[] = [
    'coding',
    'writing',
    'studying',
    'design',
    'meeting',
    'admin',
    'research',
    'background_job',
    'personal',
    'other',
  ];
  const validPriorities: TaskPriority[] = ['urgent', 'high', 'medium', 'low'];
  const validAttention: AttentionClass[] = [
    'attention_intensive',
    'background',
    'partially_attentive',
  ];

  const attentionClass: AttentionClass = validAttention.includes(
    raw.attentionClass as AttentionClass
  )
    ? (raw.attentionClass as AttentionClass)
    : 'attention_intensive';

  return {
    title:
      typeof raw.title === 'string' && raw.title.trim()
        ? raw.title.trim()
        : params.naturalLanguageInput.slice(0, 72),
    category: validCategories.includes(raw.category as TaskCategory)
      ? (raw.category as TaskCategory)
      : 'other',
    priority: validPriorities.includes(raw.priority as TaskPriority)
      ? (raw.priority as TaskPriority)
      : 'medium',
    deadlineISO: typeof raw.deadlineISO === 'string' ? raw.deadlineISO : null,
    aiEstimatedMinutes:
      typeof raw.aiEstimatedMinutes === 'number' && raw.aiEstimatedMinutes >= 5
        ? Math.round(raw.aiEstimatedMinutes)
        : 45,
    attentionClass,
    overlapAllowedWith: Array.isArray(raw.overlapAllowedWith)
      ? (raw.overlapAllowedWith.filter((c) =>
          validAttention.includes(c as AttentionClass)
        ) as AttentionClass[])
      : attentionClass === 'background'
        ? ['attention_intensive', 'partially_attentive']
        : [],
    milestones: Array.isArray(raw.milestones)
      ? raw.milestones
          .filter((m) => m && typeof m.title === 'string')
          .slice(0, 5)
          .map((m) => ({
            title: m.title.trim(),
            estimatedMinutes:
              typeof m.estimatedMinutes === 'number' && m.estimatedMinutes >= 5
                ? Math.round(m.estimatedMinutes)
                : 25,
          }))
      : [],
    clarifyingQuestions: Array.isArray(raw.clarifyingQuestions)
      ? raw.clarifyingQuestions.filter((q) => typeof q === 'string').slice(0, 3)
      : [],
    executionCharacteristics: Array.isArray(raw.executionCharacteristics)
      ? raw.executionCharacteristics
          .filter((c) => typeof c === 'string')
          .slice(0, 5)
      : [],
    suggestedDependencyTitles: Array.isArray(raw.suggestedDependencyTitles)
      ? raw.suggestedDependencyTitles.filter((d) => typeof d === 'string')
      : [],
    suggestedOverlapNote:
      typeof raw.suggestedOverlapNote === 'string'
        ? raw.suggestedOverlapNote
        : '',
    summary: typeof raw.summary === 'string' ? raw.summary : '',
    confidence:
      typeof raw.confidence === 'number'
        ? Math.min(1, Math.max(0, raw.confidence))
        : 0.75,
  };
}

export async function extractCalibrationConstraintsWithGroq(params: {
  text: string;
  localDate: string;
  timezone: string;
}): Promise<ExtractedConstraint[]> {
  if (!params.text.trim()) return [];

  const systemPrompt = `Extract explicit scheduling constraints from the user's daily calibration note.
CRITICAL RULES:
- Do NOT invent commitments or assume unspecified times.
- Only include startTime/endTime (24-hour "HH:mm") if explicitly stated or clearly bounded (e.g. "leave early at 16:00" -> startTime "16:00", endTime "23:59").
- Return JSON object: { "constraints": [ { "type": "unavailable_window"|"leave_early"|"rest"|"priority_target"|"commitment"|"note", "description": string, "startTime": "HH:mm" or null, "endTime": "HH:mm" or null, "targetTaskTitle": string or null, "effect": string } ] }`;

  const userPrompt = `Local date: ${params.localDate} (${params.timezone})
User note: """${params.text}"""`;

  const raw = await callGroqJson<{
    constraints?: Array<Partial<ExtractedConstraint>>;
  }>(systemPrompt, userPrompt);

  if (!Array.isArray(raw.constraints)) return [];

  const validTypes = [
    'unavailable_window',
    'leave_early',
    'rest',
    'priority_target',
    'commitment',
    'note',
  ];

  return raw.constraints
    .filter((c) => c && typeof c.description === 'string')
    .map((c) => ({
      type: validTypes.includes(c.type as string)
        ? (c.type as ExtractedConstraint['type'])
        : 'note',
      description: c.description!.trim(),
      startTime:
        typeof c.startTime === 'string' && /^\d{2}:\d{2}$/.test(c.startTime)
          ? c.startTime
          : undefined,
      endTime:
        typeof c.endTime === 'string' && /^\d{2}:\d{2}$/.test(c.endTime)
          ? c.endTime
          : undefined,
      targetTaskTitle:
        typeof c.targetTaskTitle === 'string' ? c.targetTaskTitle : undefined,
      effect:
        typeof c.effect === 'string' && c.effect.trim()
          ? c.effect.trim()
          : 'Noted in daily context',
    }));
}
