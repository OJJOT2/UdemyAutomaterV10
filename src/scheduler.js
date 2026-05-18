// ============================================
// Scheduler Module — Cron Jobs
// ============================================
// Orchestrates daily scraping and evening polls
// using node-cron.
// ============================================

const cron = require('node-cron');

let scrapeJob = null;
let pollJob = null;

/**
 * Initialize all cron jobs.
 * @param {Function} onScrape - Async function to call when scrape is triggered
 * @param {Function} onPoll - Async function to call when poll is triggered
 */
function initScheduler(onScrape, onPoll) {
    const scrapeCron = process.env.SCRAPE_CRON || '0 9 * * *';
    const pollCron = process.env.POLL_CRON || '0 20 * * *';
    const tz = process.env.TZ || 'Asia/Amman';

    // --- Daily Scrape Job ---
    if (cron.validate(scrapeCron)) {
        scrapeJob = cron.schedule(scrapeCron, async () => {
            console.log(`[Scheduler] ⏰ Scrape job triggered at ${new Date().toLocaleString('en-US', { timeZone: tz })}`);
            try {
                await onScrape();
            } catch (err) {
                console.error('[Scheduler] Scrape job failed:', err.message);
            }
        }, {
            timezone: tz,
        });
        console.log(`[Scheduler] Scrape job scheduled: "${scrapeCron}" (${tz})`);
    } else {
        console.error(`[Scheduler] Invalid SCRAPE_CRON expression: "${scrapeCron}"`);
    }

    // --- Daily Poll Job ---
    if (cron.validate(pollCron)) {
        pollJob = cron.schedule(pollCron, async () => {
            console.log(`[Scheduler] ⏰ Poll job triggered at ${new Date().toLocaleString('en-US', { timeZone: tz })}`);
            try {
                await onPoll();
            } catch (err) {
                console.error('[Scheduler] Poll job failed:', err.message);
            }
        }, {
            timezone: tz,
        });
        console.log(`[Scheduler] Poll job scheduled: "${pollCron}" (${tz})`);
    } else {
        console.error(`[Scheduler] Invalid POLL_CRON expression: "${pollCron}"`);
    }
}

/**
 * Stop all cron jobs.
 */
function stopScheduler() {
    if (scrapeJob) {
        scrapeJob.stop();
        console.log('[Scheduler] Scrape job stopped.');
    }
    if (pollJob) {
        pollJob.stop();
        console.log('[Scheduler] Poll job stopped.');
    }
}

module.exports = { initScheduler, stopScheduler };
