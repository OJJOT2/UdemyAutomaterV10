// ============================================
// Scheduler Module — Cron Jobs
// ============================================
// Orchestrates:
//   1. Morning scrape (8 AM Cairo) — reads poll winner, scrapes & sends to admin
//   2. Afternoon deadline (4 PM Cairo) — auto-posts if 0 approved, then sends poll
//   3. Legacy evening poll (20:00) — still available via env override
// ============================================

const cron = require('node-cron');

let morningJob  = null;  // 8 AM — scrape based on poll winner
let deadlineJob = null;  // 4 PM — auto-post if needed, then send poll
let pollJob     = null;  // Legacy evening poll (optional)

/**
 * Initialize all cron jobs.
 *
 * @param {Function} onScrape      - async (categoryList) => void  — runs the scrape pipeline
 * @param {Function} onPoll        - async () => void              — sends daily poll
 * @param {Function} onDeadline    - async () => void              — checks approved count & auto-posts
 */
function initScheduler(onScrape, onPoll, onDeadline) {
    const tz = process.env.TZ || 'Africa/Cairo';

    // ── 1. Morning Scrape Job ────────────────────────────────────────────────────
    //   Default: 8:00 AM Cairo daily
    const morningCron = process.env.MORNING_CRON || '0 8 * * *';

    if (cron.validate(morningCron)) {
        morningJob = cron.schedule(morningCron, async () => {
            console.log(`[Scheduler] ⏰ Morning scrape triggered at ${_now(tz)}`);
            try {
                await onScrape(null); // null = read poll winner inside index.js
            } catch (err) {
                console.error('[Scheduler] Morning scrape job failed:', err.message);
            }
        }, { timezone: tz });
        console.log(`[Scheduler] Morning scrape job: "${morningCron}" (${tz})`);
    } else {
        console.error(`[Scheduler] Invalid MORNING_CRON: "${morningCron}"`);
    }

    // ── 2. 4 PM Deadline Job ─────────────────────────────────────────────────────
    //   If no posts were approved since 8 AM → auto-post + send poll.
    const deadlineCron = process.env.DEADLINE_CRON || '0 16 * * *';

    if (cron.validate(deadlineCron)) {
        deadlineJob = cron.schedule(deadlineCron, async () => {
            console.log(`[Scheduler] ⏰ 4 PM deadline check triggered at ${_now(tz)}`);
            try {
                await onDeadline();
            } catch (err) {
                console.error('[Scheduler] Deadline job failed:', err.message);
            }
        }, { timezone: tz });
        console.log(`[Scheduler] Deadline job: "${deadlineCron}" (${tz})`);
    } else {
        console.error(`[Scheduler] Invalid DEADLINE_CRON: "${deadlineCron}"`);
    }

    // ── 3. Legacy Evening Poll Job ───────────────────────────────────────────────
    //   Only runs if POLL_CRON is explicitly set in .env AND differs from the
    //   deadline job (which already sends a poll after auto-posting).
    //   By default we leave this disabled to avoid duplicate polls.
    const pollCron = process.env.POLL_CRON || '';

    if (pollCron && cron.validate(pollCron)) {
        pollJob = cron.schedule(pollCron, async () => {
            console.log(`[Scheduler] ⏰ Evening poll triggered at ${_now(tz)}`);
            try {
                await onPoll();
            } catch (err) {
                console.error('[Scheduler] Poll job failed:', err.message);
            }
        }, { timezone: tz });
        console.log(`[Scheduler] Evening poll job: "${pollCron}" (${tz})`);
    } else {
        console.log('[Scheduler] Evening poll job: disabled (POLL_CRON not set — poll sent automatically after posting)');
    }
}

/**
 * Stop all cron jobs.
 */
function stopScheduler() {
    if (morningJob)  { morningJob.stop();   console.log('[Scheduler] Morning job stopped.'); }
    if (deadlineJob) { deadlineJob.stop();  console.log('[Scheduler] Deadline job stopped.'); }
    if (pollJob)     { pollJob.stop();      console.log('[Scheduler] Poll job stopped.'); }
}

/** Format current time in given timezone. */
function _now(tz) {
    return new Date().toLocaleString('en-US', { timeZone: tz });
}

module.exports = { initScheduler, stopScheduler };
