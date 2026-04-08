import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

const SYSTEM_PROMPT = `You are an expert code reviewer. Analyze the provided git diff and give concise, actionable feedback.

Focus on:
- Bugs and logic errors
- Security vulnerabilities (SQL injection, XSS, exposed secrets, etc.)
- Performance problems
- Unclear or unmaintainable code

Respond with valid JSON only — no markdown fences, no extra text:
{
  "summary": "2-3 sentence overall assessment",
  "issues": [
    {
      "file": "path/to/file.js",
      "severity": "high|medium|low",
      "comment": "Specific, actionable description of the issue"
    }
  ],
  "positives": [
    "One thing done well (optional)"
  ]
}

Only flag real issues. If the code looks good, say so in the summary and leave issues empty.`;

export async function reviewDiff(diff, pr) {
  if (!diff || diff.trim().length === 0) {
    return { summary: 'No reviewable changes found.', issues: [], positives: [] };
  }

  if (diff.trim().split('\n').length < 3) {
    return { summary: 'Change is too small to review.', issues: [], positives: [] };
  }

  const prompt = [
    SYSTEM_PROMPT,
    '',
    `PR: "${pr.title}"`,
    pr.body ? `Description: ${pr.body}` : null,
    '',
    'Diff:',
    '```diff',
    diff,
    '```',
  ].filter(Boolean).join('\n');

  const result = await model.generateContentStream(prompt);

  let responseText = '';
  for await (const chunk of result.stream) {
    responseText += chunk.text();
  }

  return parseReview(responseText);
}

function parseReview(text) {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch {
    // fall through to fallback
  }
  return { summary: text.trim(), issues: [], positives: [] };
}
