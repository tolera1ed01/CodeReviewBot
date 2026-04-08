# CodeReviewBot

Automated code review using Gemini. Runs as a GitHub Action and posts feedback as PR review comments and commit comments.

## What it does

- Reviews pull requests when opened, updated, or reopened
- Reviews commits pushed directly to the default branch
- Posts a summary, a list of issues with severity, and any positives it finds
- Skips reviews it has already posted so you never get duplicates

## Setup

### 1. Add the workflow file

Create `.github/workflows/code-review.yml` in any repository you want reviewed:

```yaml
name: Code Review

on:
  pull_request:
    types: [opened, synchronize, reopened]
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: tolera1ed01/CodeReviewBot@main
        with:
          gemini-api-key: ${{ secrets.GEMINI_API_KEY }}
```

### 2. Add the API key secret

Get a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).

Then add it as a repository secret:

1. Go to your repository on GitHub
2. Settings -> Secrets and variables -> Actions
3. Click "New repository secret"
4. Name: `GEMINI_API_KEY`, value: your key

That's it. The bot will run automatically on the next pull request or push.

## How it works

The action installs its own dependencies and reads the event context GitHub provides to every workflow run. It fetches the diff via the GitHub API, sends it to Gemini for review, and posts the result back as a comment. The `GITHUB_TOKEN` used for posting comments is provided automatically by GitHub and requires no setup.

Diffs larger than 100KB are truncated. Diffs with fewer than three lines are skipped.
