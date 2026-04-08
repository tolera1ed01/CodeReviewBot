import crypto from 'crypto';
import { getPRFiles, getCommitFiles, postReview, postCommitComment, hasAlreadyReviewed, hasCommitReview } from './githubClient.js';
import { reviewDiff } from './claudeReviewer.js';

// Verifies the HMAC-SHA256 signature GitHub attaches to every webhook delivery.
// Uses timingSafeEqual to prevent timing attacks — regular string comparison
// leaks information about how many characters match.
function verifySignature(rawBody, signature) {
  if (!signature) return false;
  const expected = 'sha256=' + crypto
    .createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    // timingSafeEqual throws if the two buffers are different lengths
    return false;
  }
}

export async function handleWebhook(req, res) {
  const signature = req.headers['x-hub-signature-256'];
  const event     = req.headers['x-github-event'];

  if (!verifySignature(req.body, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const payload = JSON.parse(req.body.toString());
  const repo    = payload.repository.full_name;

  // ── Pull request events ──────────────────────────────────────────────────
  // Reviews the full PR diff on open, reopen, or whenever new commits are pushed.
  // Deduped by commit SHA so each push to the PR gets its own review.
  if (event === 'pull_request') {
    if (!['opened', 'synchronize', 'reopened'].includes(payload.action)) {
      return res.status(200).json({ status: 'ignored' });
    }

    const pr = payload.pull_request;

    try {
      if (await hasAlreadyReviewed(repo, pr.number, pr.head.sha)) {
        console.log(`Already reviewed ${repo}#${pr.number} at ${pr.head.sha}`);
        return res.status(200).json({ status: 'already_reviewed' });
      }

      console.log(`Reviewing PR ${repo}#${pr.number} — "${pr.title}"`);
      const diff   = await getPRFiles(repo, pr.number);
      const review = await reviewDiff(diff, pr);
      await postReview(repo, pr.number, review, pr.head.sha);
      console.log(`PR review posted for ${repo}#${pr.number}`);
      return res.status(200).json({ status: 'reviewed' });
    } catch (err) {
      console.error(`Error reviewing PR ${repo}#${pr.number}:`, err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── Push events ──────────────────────────────────────────────────────────
  // Reviews individual commits pushed directly to the default branch.
  // Skips feature branches — those are handled via pull_request events above.
  // `distinct: true` filters out commits already seen in a previous push
  // (e.g. from a merged PR), avoiding double reviews.
  if (event === 'push') {
    const defaultRef = `refs/heads/${payload.repository.default_branch}`;
    if (payload.ref !== defaultRef) {
      return res.status(200).json({ status: 'ignored' });
    }

    const commits = (payload.commits || []).filter(c => c.distinct);
    if (commits.length === 0) {
      return res.status(200).json({ status: 'ignored' });
    }

    try {
      for (const commit of commits) {
        if (await hasCommitReview(repo, commit.id)) {
          console.log(`Already reviewed commit ${commit.id}`);
          continue;
        }

        console.log(`Reviewing commit ${commit.id} — "${commit.message.split('\n')[0]}"`);
        const diff   = await getCommitFiles(repo, commit.id);
        const review = await reviewDiff(diff, { title: commit.message.split('\n')[0], body: '' });
        await postCommitComment(repo, commit.id, review);
        console.log(`Commit review posted for ${commit.id}`);
      }
      return res.status(200).json({ status: 'reviewed' });
    } catch (err) {
      console.error(`Error reviewing push to ${repo}:`, err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(200).json({ status: 'ignored' });
}
