// ============================================
// UdemyAutomaterV10 — Entry Point
// ============================================
// Boots all modules: Telegram bot, WhatsApp
// Baileys socket, Gemini AI, Scraper, and
// Cron Scheduler. Also runs Express Web UI.
//
// Automated daily flow:
//   ① After scrape pipeline → poll sent to channel
//   ② 8:00 AM Cairo → read poll winner → scrape → send to admin
//   ③ 4:00 PM Cairo → if 0 approved → auto-post 10 courses → send poll
// ============================================

require('dotenv').config();

const express = require('express');
const scraper  = require('./src/scraper');
const gemini   = require('./src/gemini');
const telegram = require('./src/telegram');
const whatsapp = require('./src/whatsapp');
const scheduler = require('./src/scheduler');

// ─── Web Dashboard & Log Interceptor ─────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3000;

global.appLogs = [];
const originalLog   = console.log;
const originalError = console.error;

function captureLog(type, ...args) {
    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : a)).join(' ');
    const timestamp = new Date().toLocaleString('en-US', { timeZone: process.env.TZ || 'Africa/Cairo' });
    global.appLogs.unshift(`[${timestamp}] [${type}] ${msg}`);
    if (global.appLogs.length > 1000) global.appLogs.length = 1000;

    if (type === 'ERROR') originalError.apply(console, args);
    else originalLog.apply(console, args);
}

console.log   = (...args) => captureLog('INFO',  ...args);
console.error = (...args) => captureLog('ERROR', ...args);

app.get('/', (req, res) => {
    res.send(`
        <html>
        <head>
            <title>UdemyAutomater Logs</title>
            <meta http-equiv="refresh" content="5">
            <style>
                body { font-family: monospace; background: #1e1e1e; color: #00ff00; padding: 20px; }
                h2 { color: #fff; }
                pre { white-space: pre-wrap; word-wrap: break-word; }
                .error { color: #ff5555; }
            </style>
        </head>
        <body>
            <h2>🤖 UdemyAutomaterV10 - Live Logs</h2>
            <p>Auto-refreshing every 5 seconds...</p>
            <hr/>
            <pre>${global.appLogs.map(l => l.includes('[ERROR]') ? `<span class="error">${l}</span>` : l).join('\n')}</pre>
        </body>
        </html>
    `);
});

// ─── Daily Approval Counter ───────────────────────────────────────────────────
// Tracks how many posts were approved today (since 8 AM).
// Reset every morning by the morning scrape job.
let approvedTodayCount = 0;
// Cache of today's scraped courses — needed by the 4 PM deadline job.
let todayCourses = [];

function resetDailyCounters() {
    approvedTodayCount = 0;
    todayCourses = [];
    console.log('[Pipeline] Daily counters reset.');
}

// ─── Scrape Pipeline ──────────────────────────────────────────────────────────

/**
 * Run the full scrape pipeline.
 *
 * @param {Object|null} ctx           - Telegram context for manual scrapes; null for automated
 * @param {number}      pagesToScrape - Number of listing pages to fetch per sub-category
 * @param {Array|null}  category      - Sub-category slug array; null = read from poll winner
 */
async function runScrapePipeline(ctx = null, pagesToScrape = 1, category = null) {
    console.log('\n========================================');
    console.log(`[Pipeline] Starting scrape pipeline... Pages: ${pagesToScrape}, Category: ${category ? JSON.stringify(category) : 'Poll Winner'}`);
    console.log('========================================\n');

    try {
        // Resolve category: if null, read poll winner (automated morning run)
        let resolvedCategory = category;
        if (!resolvedCategory) {
            resolvedCategory = telegram.getPollWinnerCategory();
            console.log(`[Pipeline] Poll winner resolved to ${resolvedCategory.length} sub-category(ies).`);
        }

        // For manual scrapes remove course limit; automated runs use env var
        const maxLimit = ctx ? 9999 : null;

        // 1. Scrape
        const courses = await scraper.scrapeCourses(maxLimit, pagesToScrape, resolvedCategory);

        if (courses.length === 0) {
            console.log('[Pipeline] No new courses found.');
            const msg = 'ℹ️ Scrape completed — no new courses found.';
            if (ctx) await ctx.reply(msg);
            else     await telegram.sendToAdmin(msg);
            return;
        }

        // Cache today's courses for the 4 PM deadline job
        todayCourses = courses;

        console.log(`[Pipeline] Processing ${courses.length} new courses...`);

        // 2. Send each course for admin review
        for (const course of courses) {
            try {
                await telegram.sendRawPreview(
                    course,
                    async (courseData) => gemini.generatePost(courseData),
                    (slug)            => scraper.markAsPosted(slug)
                );
                await new Promise((r) => setTimeout(r, 1000));
            } catch (err) {
                console.error(`[Pipeline] Error processing "${course.title}":`, err.message);
            }
        }

        console.log('[Pipeline] All courses sent for admin approval.');

        // 3. Inform admin to use /poll when finished
        if (!ctx) {
            await telegram.sendToAdmin("📊 All courses sent for review. Use /poll when you finish posting to send tomorrow's poll.");
        }

    } catch (err) {
        console.error('[Pipeline] Scrape pipeline failed:', err.message);
        const errMsg = `❌ Scrape pipeline error: ${err.message}`;
        if (ctx) await ctx.reply(errMsg);
        else     await telegram.sendToAdmin(errMsg);
    }
}

// ─── 4 PM Deadline Handler ────────────────────────────────────────────────────

/**
 * Called at 4 PM Cairo.
 * If no posts were approved today → auto-post up to AUTO_POST_COUNT courses,
 * then send the next-day poll to the channel.
 */
async function handleDeadline() {
    const autoCount = parseInt(process.env.AUTO_POST_COUNT, 10) || 10;
    const tz        = process.env.TZ || 'Africa/Cairo';
    const timeStr   = new Date().toLocaleString('en-US', { timeZone: tz });

    console.log(`[Deadline] Checking at ${timeStr}. Approved today: ${approvedTodayCount}`);

    if (approvedTodayCount > 0) {
        console.log(`[Deadline] ${approvedTodayCount} post(s) already approved. Skipping auto-post.`);
        await telegram.sendToAdmin(
            `✅ *Deadline Check (4 PM)*\n` +
            `${approvedTodayCount} course(s) were posted today — no auto-post needed.\n` +
            `Sending next-day poll now... 📊`
        );
        // Still send the poll for tomorrow
        await telegram.sendPollAfterPosting();
        return;
    }

    // No approvals — auto-post
    if (todayCourses.length === 0) {
        console.log('[Deadline] No cached courses to auto-post. Triggering fresh scrape...');
        await telegram.sendToAdmin('⚠️ No cached courses for auto-post. Running a fresh scrape...');

        // Run a fresh scrape using the poll winner
        const categoryList = telegram.getPollWinnerCategory();
        const freshCourses = await scraper.scrapeCourses(autoCount, 1, categoryList);
        todayCourses = freshCourses;
    }

    if (todayCourses.length === 0) {
        await telegram.sendToAdmin('❌ Auto-post failed — no courses available. Sending poll anyway.');
        await telegram.sendPollAfterPosting();
        return;
    }

    // Auto-post the courses
    await telegram.autoPostCourses(
        todayCourses,
        autoCount,
        async (courseData) => gemini.generatePost(courseData),
        (slug) => scraper.markAsPosted(slug)
    );

    // Send next-day poll
    await telegram.sendPollAfterPosting();
}

// ─── Main Boot ────────────────────────────────────────────────────────────────

async function main() {
    console.log('╔══════════════════════════════════════╗');
    console.log('║     UdemyAutomaterV10  —  v2.0.0     ║');
    console.log('╚══════════════════════════════════════╝');
    console.log();

    // Start Web Server
    app.listen(PORT, () => {
        console.log(`[Boot] Web Dashboard running on port ${PORT}`);
    });

    // Validate required env vars
    const required = ['BOT_TOKEN', 'ADMIN_CHAT_ID'];
    const missing  = required.filter((key) => !process.env[key]);
    
    if (!process.env.GEMINI_API_KEYS && !process.env.GEMINI_API_KEY) {
        missing.push('GEMINI_API_KEYS');
    }

    if (missing.length > 0) {
        console.error(`[Boot] Missing required environment variables: ${missing.join(', ')}`);
        console.error('[Boot] Copy .env.example to .env and fill in the values.');
        process.exit(1);
    }

    try {
        // 1. Initialize Gemini AI
        console.log('[Boot] Initializing Gemini AI...');
        gemini.initGemini();

        // 2. Initialize Telegram Bot
        console.log('[Boot] Initializing Telegram Bot...');
        telegram.initTelegram(whatsapp);

        // Wire up callbacks on the bot instance
        const bot = telegram.getBot();

        // Manual /scrape command
        bot._onManualScrape = runScrapePipeline;

        bot._onTestMorning = async (ctx) => {
            await ctx.reply('🛠️ Triggering 8 AM Morning Scrape flow...');
            resetDailyCounters();
            await runScrapePipeline(null, 1, null); 
        };

        bot._onTestDeadline = async (ctx) => {
            await ctx.reply('🛠️ Triggering 4 PM Deadline Auto-Post flow...');
            await handleDeadline();
        };

        // Post-approval counter: incremented by telegram.js on every broadcastPost()
        bot._onPostApproved = () => {
            approvedTodayCount++;
            console.log(`[Pipeline] Post approved. Today's count: ${approvedTodayCount}`);
        };

        // 3. Start the Telegram Bot (begins polling)
        await telegram.startBot();

        // 4. Initialize WhatsApp
        console.log('[Boot] Initializing WhatsApp...');
        await whatsapp.initWhatsApp(telegram);

        // 5. Initialize Scheduler
        console.log('[Boot] Initializing Scheduler...');
        scheduler.initScheduler(
            // Morning scrape: reset counters, then run pipeline with poll winner
            async (_categoryOverride) => {
                resetDailyCounters();
                await runScrapePipeline(null, 1, null); // null = use poll winner
            },
            // Legacy evening poll (if POLL_CRON set in .env)
            telegram.sendDailyPoll,
            // 4 PM deadline
            handleDeadline
        );

        // ── Startup Summary ──────────────────────────────────────────────────────
        const tz          = process.env.TZ || 'Africa/Cairo';
        const morningCron = process.env.MORNING_CRON  || '0 8 * * *';
        const deadlineCron = process.env.DEADLINE_CRON || '0 16 * * *';

        console.log();
        console.log('========================================');
        console.log('[Boot] ✅ All systems operational!');
        console.log('========================================');
        console.log();
        console.log(`  🤖 Telegram Bot: Running`);
        console.log(`  📱 WhatsApp:     Connecting...`);
        console.log(`  🧠 Gemini AI:    Ready`);
        console.log(`  ⏰ Morning Scrape: ${morningCron} (${tz})`);
        console.log(`  ⏰ 4 PM Deadline: ${deadlineCron} (${tz})`);
        console.log();

        await telegram.sendToAdmin(
            '🚀 *UdemyAutomaterV10 v2.0.0 is online!*\n\n' +
            '🤖 Telegram Bot: ✅\n' +
            '📱 WhatsApp: Connecting...\n' +
            '🧠 Gemini AI: ✅\n\n' +
            `⏰ Morning Scrape: \`${morningCron}\`\n` +
            `⏰ 4 PM Deadline:  \`${deadlineCron}\`\n` +
            `🌍 Timezone: \`${tz}\`\n\n` +
            '📊 *Daily flow:*\n' +
            '  → 8 AM: scrape poll-winner category\n' +
            '  → Poll sent after scrape\n' +
            '  → 4 PM: auto-post if 0 approved + new poll\n\n' +
            'Use /scrape to trigger manually.\n' +
            'Use /poll to send next-day poll now.\n' +
            'Use /winner to see current poll leader.'
        );

    } catch (err) {
        console.error('[Boot] Fatal error:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
}

// ─── Run ──────────────────────────────────────────────────────────────────────
main();
