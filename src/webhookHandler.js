import crypto from 'crypto';
import { isDuplicate, isRateLimited } from './redisClient.js';
import { getPRFiles, postReview } from './githubClient.js';
import { reviewDiff } from './claudeReviewer.js';

function verifySignature(rawBody, signature) {
  if (!signature) return false;
  const expected = 'sha256=' + crypto
    .createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function handleWebhook(req, res) {
  const signature  = req.headers['x-hub-signature-256'];
  const deliveryId = req.headers['x-github-delivery'];
  const event      = req.headers['x-github-event'];

  const rawBody = req.body; // Buffer set by express.raw() middleware

  if (!verifySignature(rawBody, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Only process pull_request open/update events
  if (event !== 'pull_request') {
    return res.status(200).json({ status: 'ignored' });
  }

  const payload = JSON.parse(rawBody.toString());
  if (!['opened', 'synchronize', 'reopened'].includes(payload.action)) {
    return res.status(200).json({ status: 'ignored' });
  }

  const { repository, pull_request: pr } = payload;
  const repo = repository.full_name;

  if (await isDuplicate(deliveryId)) {
    console.log(`[${deliveryId}] Duplicate delivery, skipping`);
    return res.status(200).json({ status: 'duplicate' });
  }

  if (await isRateLimited(repo)) {
    console.log(`[${repo}] Rate limit reached`);
    return res.status(200).json({ status: 'rate_limited' });
  }

  try {
    console.log(`Reviewing ${repo}#${pr.number} — "${pr.title}"`);
    const diff   = await getPRFiles(repo, pr.number);
    const review = await reviewDiff(diff, pr);
    await postReview(repo, pr.number, review, pr.head.sha);
    console.log(`Review posted for ${repo}#${pr.number}`);
    return res.status(200).json({ status: 'reviewed' });
  } catch (err) {
    console.error(`Error reviewing ${repo}#${pr.number}:`, err.message);
    return res.status(500).json({ error: err.message });
  }
}
