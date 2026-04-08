import { readFileSync } from 'fs';
import { getPRFiles, getCommitFiles, postReview, postCommitComment, hasAlreadyReviewed, hasCommitReview } from './githubClient.js';
import { reviewDiff } from './claudeReviewer.js';

const eventName = process.env.GITHUB_EVENT_NAME;
const repo      = process.env.GITHUB_REPOSITORY; // "owner/repo"

// GitHub Actions writes the full event payload to a temp JSON file and
// points GITHUB_EVENT_PATH at it — same data the webhook handler parsed
// from the HTTP request body, but without the HTTP layer.
const payload = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));

async function run() {
  // ── Pull request events ──────────────────────────────────────────────────
  if (eventName === 'pull_request') {
    if (!['opened', 'synchronize', 'reopened'].includes(payload.action)) {
      console.log(`Ignoring pull_request action: ${payload.action}`);
      return;
    }

    const pr = payload.pull_request;

    if (await hasAlreadyReviewed(repo, pr.number, pr.head.sha)) {
      console.log(`Already reviewed ${repo}#${pr.number} at ${pr.head.sha}`);
      return;
    }

    console.log(`Reviewing PR ${repo}#${pr.number} — "${pr.title}"`);
    const diff   = await getPRFiles(repo, pr.number);
    const review = await reviewDiff(diff, pr);
    await postReview(repo, pr.number, review, pr.head.sha);
    console.log(`PR review posted for ${repo}#${pr.number}`);
    return;
  }

  // ── Push events ──────────────────────────────────────────────────────────
  if (eventName === 'push') {
    const defaultRef = `refs/heads/${payload.repository.default_branch}`;
    if (payload.ref !== defaultRef) {
      console.log(`Ignoring push to non-default branch: ${payload.ref}`);
      return;
    }

    const commits = (payload.commits || []).filter(c => c.distinct);
    if (commits.length === 0) {
      console.log('No distinct commits to review.');
      return;
    }

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
    return;
  }

  console.log(`Unhandled event: ${eventName}`);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
