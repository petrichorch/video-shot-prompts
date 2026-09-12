# Notion performance reports

Use the connected Notion workspace as the durable feedback source shared by the
post-publication checker and future video-generation runs.

## Canonical location

- Parent page title: `视频表现报告`
- Child page title: `发布后表现检查 — YYYY-MM-DD`
- Create the parent as a private workspace page only when an exact-title search
  confirms that it does not already exist.
- Before updating an existing page, fetch it. Never choose a similarly named page
  without verifying its exact title and parent.

Do not hardcode a user-specific Notion page ID in this public skill. Resolve the
page through the connected workspace so the workflow remains portable.

## Writing after publication

Run the Buffer checker first. Create one child page only when all of these are
true:

1. the Buffer post status is `sent`;
2. the post has been sent for at least 24 hours;
3. Buffer returned a metric snapshot newer than the saved snapshot, or returned
   eligible metrics for the first time.

The child page should contain the check date, channel and Buffer post ID, exact
Buffer exposure fields, Buffer engagement rate, changes from the prior snapshot,
`metricsUpdatedAt` when returned, comparable-post counts, the evidence boundary,
and one or two variables proposed for the next video. Preserve Buffer's metric
names and values. If fewer than three same-channel or genuinely comparable sent
posts exist, state that the evidence is insufficient and do not summarize a
trend or cause.

Write only the sanitized report. Never include API keys, authentication headers,
credential file contents, local filesystem paths, or full publishing receipts.
Do not create an empty page or notify the user when no new valid metrics exist.

## Reading before generation

Before selecting the next video's opening frame, hook, pacing, reveal, music, or
CTA:

1. search for the exact parent title `视频表现报告`;
2. fetch the parent and identify the latest dated child report;
3. fetch that child page and inspect its evidence boundary;
4. apply only recommendations supported by at least three sent posts on the same
   or genuinely comparable channel.

When the latest report explicitly says the comparable sample is smaller than
three, treat its suggestions as unconfirmed test ideas rather than learned
performance findings. Change no more than one or two variables in the next
draft. Record which report was read and which variables were adopted in the
review manifest.

If Notion search or fetch is unavailable, use the latest local
`buffer/reports/` report as a fallback, note that fallback in the review
manifest, and never fabricate a missing report or conclusion.
