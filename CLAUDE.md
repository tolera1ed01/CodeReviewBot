# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CodeReviewBot is a Node.js service that listens for GitHub webhook events, fetches PR diffs, sends them to the Claude API for review, and posts feedback as GitHub PR comments. Redis (hosted on Railway) is used for deduplication and rate limiting.

## Commands

```bash
# Install dependencies
npm install

# Start the server
node src/server.js

# Start with auto-reload during development
npx nodemon src/server.js

# Run tests
npm test

# Run a single test file
npx jest src/__tests__/reviewer.test.js
```

## Environment Variables

Copy `.env.example` to `.env` and fill in:

```
PORT=3000
GITHUB_WEBHOOK_SECRET=...
GITHUB_TOKEN=...
ANTHROPIC_API_KEY=...
UPSTASH_REDIS_REST_URL=https://...upstash.io
UPSTASH_REDIS_REST_TOKEN=...   # Upstash free tier — no cost
```

## Architecture

```
GitHub Push/PR Event
       │
       ▼
src/server.js          Express server; receives POST /webhook
       │
       ▼
src/webhookHandler.js  Validates HMAC signature, routes push vs. pull_request events
       │
       ├── src/redisClient.js    Checks for duplicate webhook delivery (idempotency key = delivery ID)
       │                         Rate-limits per repo using sliding window counters
       │
       ├── src/githubClient.js   Fetches PR diff or commit diff via GitHub REST API
       │                         Posts review comments back to the PR
       │
       └── src/claudeReviewer.js Sends diff to Claude API (claude-opus-4-6, streaming)
                                  Returns structured review feedback
```

### Key design decisions

- **Webhook validation**: Every request is verified against `GITHUB_WEBHOOK_SECRET` using HMAC-SHA256 before any processing.
- **Idempotency**: The GitHub delivery ID (`X-GitHub-Delivery` header) is stored in Redis with a short TTL so duplicate deliveries are ignored.
- **Claude model**: Uses `claude-opus-4-6` with `thinking: {type: "adaptive"}` and streaming to avoid HTTP timeouts on large diffs.
- **Redis on Upstash (free tier)**: Uses the `@upstash/redis` HTTP client in `src/redisClient.js`. Only ~3 commands per webhook (well under the 10,000/day free limit). Not used for storing review results — only dedup + rate limiting.
- **GitHub comments**: Reviews are posted as PR review comments (line-level where possible) via `POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews`.
