# Post-publication feedback loop

Use this guide after approved videos have been published through Buffer.

## Data source and timing

Buffer exposes normalized metrics on sent posts through its GraphQL `Post.metrics`
field for personal workflows and automations. A personal API key needs
`postsRead` and `insightsRead`. Metrics are experimental and Buffer refreshes
them roughly daily, so the first useful check is normally 24-48 hours after a
post is sent. Recheck later when `metricsUpdatedAt` changes.

Run:

```sh
node "${CODEX_HOME:-$HOME/.codex}/skills/video-shot-prompts/scripts/check-buffer-performance.js"
```

The script reads durable publishing receipts, fetches each post's current status
and metrics, preserves snapshots, and writes the latest comparison report. Raw
metric names are retained because available metrics differ by social network.

## Interpretation

Do not use Larry's fixed viral thresholds. Compare at least three sent posts on
the same or genuinely comparable channels:

- Higher exposure and higher engagement rate: preserve the opening, overlay
  style, pacing, and reveal; test a close variation.
- Higher exposure and lower engagement rate: reach is working; improve the
  promise/payoff match, process clarity, final reveal, or CTA.
- Lower exposure and higher engagement rate: strengthen the first frame,
  opening overlay, cover choice, or posting time while keeping the core process.
- Lower exposure and lower engagement rate: test a different source blueprint,
  opening visual, overlay hook, or pacing pattern.

Change one or two variables at a time and record them in the next Buffer receipt.
Do not infer conversions, watch time, audience sentiment, or causation when those
fields are absent. Treat missing metrics and fewer than three comparable posts as
insufficient evidence, not failure.
