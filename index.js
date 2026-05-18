// ============================================
// UdemyAutomaterV10 — Entry Point
// ============================================
// Boots all modules: Telegram bot, WhatsApp
// Baileys socket, Gemini AI, Scraper, and
// Cron Scheduler. Also runs Express Web UI.
// ============================================

require('dotenv').config();

const express = require('express');
const scraper = require('./src/scraper');
const gemini = require('./src/gemini');
const telegram = require('./src/telegram');
const whatsapp = require('./src/whatsapp');
const scheduler = require('./src/scheduler');

// --- Web Dashboard & Log Interceptor ---
const app = express();
const PORT = process.env.PORT || 3000;

global.appLogs = [];
const originalLog = console.log;
const originalError = console.error;

function captureLog(type, ...args) {
    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : a)).join(' ');
    const timestamp = new Date().toLocaleString('en-US', { timeZone: process.env.TZ || 'Asia/Amman' });
    global.appLogs.unshift(`[${timestamp}] [${type}] ${msg}`);
    if (global.appLogs.length > 1000) global.appLogs.length = 1000; // keep last 1000 lines

    if (type === 'ERROR') originalError.apply(console, args);
    else originalLog.apply(console, args);
}

console.log = (...args) => captureLog('INFO', ...args);
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

/**
 * Run the full scrape pipeline.
 */
async function runScrapePipeline(ctx = null, pagesToScrape = 1, category = null) {
    console.log('\n========================================');
    console.log(`[Pipeline] Starting scrape pipeline... Pages: ${pagesToScrape}, Category: ${category || 'All'}`);
    console.log('========================================\n');

    try {
        // 1. Scrape new courses
        const courses = await scraper.scrapeCourses(null, pagesToScrape, category);

        if (courses.length === 0) {
            console.log('[Pipeline] No new courses found.');
            if (ctx) {
                await ctx.reply('ℹ️ Scrape completed — no new courses found.');
            } else {
                await telegram.sendToAdmin('ℹ️ Scrape completed — no new courses found.');
            }
            return;
        }

        console.log(`[Pipeline] Processing ${courses.length} new courses...`);

        // 2. For each course, send raw preview for admin approval/generation
        for (const course of courses) {
            try {
                // Send RAW preview to admin
                await telegram.sendRawPreview(
                    course,
                    // onGenerateAI callback
                    async (courseData) => {
                        return await gemini.generatePost(courseData);
                    },
                    // onApprove callback
                    (slug) => {
                        scraper.markAsPosted(slug);
                    }
                );

                // Small delay between processing courses
                await new Promise((r) => setTimeout(r, 1000));
            } catch (err) {
                console.error(`[Pipeline] Error processing "${course.title}":`, err.message);
            }
        }

        console.log('[Pipeline] All courses sent for admin approval.');
    } catch (err) {
        console.error('[Pipeline] Scrape pipeline failed:', err.message);
        if (ctx) {
            await ctx.reply(`❌ Scrape pipeline error: ${err.message}`);
        } else {
            await telegram.sendToAdmin(`❌ Scrape pipeline error: ${err.message}`);
        }
    }
}

/**
 * Main boot sequence.
 */
async function main() {
    console.log('╔══════════════════════════════════════╗');
    console.log('║     UdemyAutomaterV10  —  v1.0.0     ║');
    console.log('╚══════════════════════════════════════╝');
    console.log();

    // Start Web Server
    app.listen(PORT, () => {
        console.log(`[Boot] Web Dashboard running on port ${PORT}`);
    });

    // Validate required env vars
    const required = ['BOT_TOKEN', 'ADMIN_CHAT_ID', 'GEMINI_API_KEY'];
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length > 0) {
        console.error(`[Boot] Missing required environment variables: ${missing.join(', ')}`);
        console.error('[Boot] Copy .env.example to .env and fill in the values.');
        process.exit(1);
    }

    try {
        // 1. Initialize Gemini AI
        console.log('[Boot] Initializing Gemini AI...');
        gemini.initGemini();

        // 2. Initialize Telegram Bot (pass whatsapp module reference)
        console.log('[Boot] Initializing Telegram Bot...');
        telegram.initTelegram(whatsapp);

        // Wire up manual /scrape command
        const bot = telegram.getBot();
        bot._onManualScrape = runScrapePipeline;

        // 3. Start the Telegram Bot (begins polling)
        await telegram.startBot();

        // 4. Initialize WhatsApp (pass telegram module for QR delivery)
        console.log('[Boot] Initializing WhatsApp...');
        await whatsapp.initWhatsApp(telegram);

        // 5. Initialize Cron Scheduler
        console.log('[Boot] Initializing Scheduler...');
        scheduler.initScheduler(runScrapePipeline, telegram.sendDailyPoll);

        console.log();
        console.log('========================================');
        console.log('[Boot] ✅ All systems operational!');
        console.log('========================================');
        console.log();
        console.log(`  🤖 Telegram Bot: Running`);
        console.log(`  📱 WhatsApp:     Connecting...`);
        console.log(`  🧠 Gemini AI:    Ready`);
        console.log(`  ⏰ Scheduler:    ${process.env.SCRAPE_CRON || '0 9 * * *'} (scrape) | ${process.env.POLL_CRON || '0 20 * * *'} (poll)`);
        console.log(`  🌍 Timezone:     ${process.env.TZ || 'Asia/Amman'}`);
        console.log();

        // Notify admin
        await telegram.sendToAdmin(
            '🚀 *UdemyAutomaterV10 is online!*\n\n' +
            '🤖 Telegram Bot: ✅\n' +
            '📱 WhatsApp: Connecting...\n' +
            '🧠 Gemini AI: ✅\n' +
            `⏰ Scrape: ${process.env.SCRAPE_CRON || '0 9 * * *'}\n` +
            `⏰ Poll: ${process.env.POLL_CRON || '0 20 * * *'}\n\n` +
            'Use /scrape to trigger manually.'
        );

    } catch (err) {
        console.error('[Boot] Fatal error:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
}

// --- Run ---
main();
