import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

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

  // Streaming avoids HTTP timeouts when the model takes a while on large diffs.
  // We collect all chunks into a single string before parsing.
  // Retry up to 3 times on 503 (model overloaded) with exponential backoff.
  const MAX_RETRIES = 3;
  let lastError;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, 2 ** attempt * 1000));
    }
    try {
      const result = await model.generateContentStream(prompt);
      let responseText = '';
      for await (const chunk of result.stream) {
        responseText += chunk.text();
      }
      return parseReview(responseText);
    } catch (err) {
      if (err.status === 503) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

function parseReview(text) {
  try {
    // Extract the first {...} block from the response. The model is instructed
    // to return only JSON, but occasionally wraps it in prose or markdown —
    // this regex handles that gracefully.
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch {
    // fall through to fallback
  }
  // If JSON parsing fails entirely, surface the raw text as the summary so
  // the review is still posted rather than silently dropped.
  return { summary: text.trim(), issues: [], positives: [] };
}
