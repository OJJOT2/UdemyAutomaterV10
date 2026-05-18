// ============================================
// Telegram Module — Bot, Admin Approval & Channel
// ============================================
// Handles Telegram bot setup, admin approval flow
// with inline keyboards, channel posting, and
// daily polls.
// ============================================

const { Telegraf, Markup } = require('telegraf');

let bot = null;
let whatsappModule = null; // Injected at runtime to avoid circular deps

// In-memory store for pending approval posts (slug -> post data)
const pendingPosts = new Map();

/**
 * Initialize and configure the Telegram bot.
 * @param {Object} waModule - Reference to the WhatsApp module (for broadcasting)
 * @returns {Telegraf} - The bot instance
 */
function initTelegram(waModule) {
    if (!process.env.BOT_TOKEN) {
        throw new Error('[Telegram] BOT_TOKEN is not set in environment variables.');
    }

    whatsappModule = waModule;
    bot = new Telegraf(process.env.BOT_TOKEN);

    // --- Admin Commands ---

    bot.command('start', (ctx) => {
        if (!isAdmin(ctx)) return;
        ctx.reply(
            '🤖 *Udemy Automater V10* is running!\n\n' +
            'Commands:\n' +
            '/scrape — Manually trigger a scrape\n' +
            '/status — Check bot & WhatsApp status\n' +
            '/qr — Re-send WhatsApp QR code\n',
            { parse_mode: 'Markdown' }
        );
    });

    bot.command('scrape', async (ctx) => {
        if (!isAdmin(ctx)) return;
        ctx.reply('🔄 Starting manual scrape...');
        // This will be wired up in index.js
        if (bot._onManualScrape) {
            try {
                await bot._onManualScrape();
            } catch (err) {
                ctx.reply(`❌ Scrape failed: ${err.message}`);
            }
        }
    });

    bot.command('status', (ctx) => {
        if (!isAdmin(ctx)) return;
        const waStatus = whatsappModule ? whatsappModule.getStatus() : 'Not initialized';
        ctx.reply(
            `📊 *Bot Status*\n\n` +
            `🤖 Telegram: ✅ Running\n` +
            `📱 WhatsApp: ${waStatus}\n` +
            `📅 Last check: ${new Date().toLocaleString('en-US', { timeZone: process.env.TZ || 'Asia/Amman' })}`,
            { parse_mode: 'Markdown' }
        );
    });

    bot.command('qr', (ctx) => {
        if (!isAdmin(ctx)) return;
        if (whatsappModule) {
            whatsappModule.requestNewQR();
            ctx.reply('📱 Requesting new WhatsApp QR code...');
        } else {
            ctx.reply('❌ WhatsApp module not initialized.');
        }
    });

    // --- Inline Button Handlers ---

    bot.action(/approve_(.+)/, async (ctx) => {
        const slug = ctx.match[1];
        await ctx.answerCbQuery('Approving...');

        const postData = pendingPosts.get(slug);
        if (!postData) {
            await ctx.editMessageText('⚠️ Post data not found (may have expired). No action taken.');
            return;
        }

        try {
            // 1. Post to Telegram Channel
            await sendToChannel(postData.text);
            console.log(`[Telegram] ✅ Posted to channel: ${slug}`);

            // 2. Post to WhatsApp
            if (whatsappModule) {
                try {
                    await whatsappModule.sendToChannel(postData.text);
                    console.log(`[Telegram] ✅ Posted to WhatsApp: ${slug}`);
                } catch (waErr) {
                    console.error(`[Telegram] WhatsApp broadcast failed for ${slug}:`, waErr.message);
                    await sendToAdmin(`⚠️ WhatsApp broadcast failed for "${postData.title}": ${waErr.message}`);
                }
            }

            // 3. Mark as posted
            if (postData.onApprove) {
                postData.onApprove(slug);
            }

            // 4. Update the admin message
            await ctx.editMessageText(`✅ Posted!\n\n${postData.text}`);

            pendingPosts.delete(slug);
        } catch (err) {
            console.error(`[Telegram] Error broadcasting ${slug}:`, err.message);
            await ctx.editMessageText(`❌ Broadcast failed: ${err.message}`);
        }
    });

    bot.action(/reject_(.+)/, async (ctx) => {
        const slug = ctx.match[1];
        await ctx.answerCbQuery('Rejected.');
        pendingPosts.delete(slug);
        await ctx.editMessageText(`❌ Course rejected: ${slug}`);
        console.log(`[Telegram] ❌ Rejected: ${slug}`);
    });

    // --- Error Handler ---
    bot.catch((err) => {
        console.error('[Telegram] Bot error:', err.message);
    });

    console.log('[Telegram] Bot initialized.');
    return bot;
}

/**
 * Start the bot (long polling).
 */
async function startBot() {
    if (!bot) throw new Error('[Telegram] Bot not initialized. Call initTelegram() first.');

    await bot.launch();
    console.log('[Telegram] Bot started (polling).');

    // Graceful shutdown
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

/**
 * Check if the message sender is the admin.
 * @param {Object} ctx - Telegraf context
 * @returns {boolean}
 */
function isAdmin(ctx) {
    const adminId = process.env.ADMIN_CHAT_ID;
    return ctx.from && String(ctx.from.id) === String(adminId);
}

/**
 * Send an AI-generated post to the admin for approval via inline buttons.
 * @param {Object} course - Course data { title, slug, ... }
 * @param {string} postText - The AI-generated post text
 * @param {Function} onApprove - Callback when approved (receives slug)
 */
async function sendForApproval(course, postText, onApprove) {
    if (!bot) throw new Error('[Telegram] Bot not initialized.');

    const adminId = process.env.ADMIN_CHAT_ID;
    if (!adminId) throw new Error('[Telegram] ADMIN_CHAT_ID is not set.');

    // Store post data for when the button is clicked
    pendingPosts.set(course.slug, {
        text: postText,
        title: course.title,
        onApprove,
    });

    const keyboard = Markup.inlineKeyboard([
        Markup.button.callback('✅ Approve & Post', `approve_${course.slug}`),
        Markup.button.callback('❌ Reject', `reject_${course.slug}`),
    ]);

    await bot.telegram.sendMessage(
        adminId,
        `📝 *New Course for Review*\n\n${postText}`,
        {
            parse_mode: 'Markdown',
            ...keyboard,
        }
    );

    console.log(`[Telegram] Sent for approval: ${course.title}`);
}

/**
 * Send a text message to the public Telegram channel.
 * @param {string} text
 */
async function sendToChannel(text) {
    if (!bot) throw new Error('[Telegram] Bot not initialized.');

    const channelId = process.env.TELEGRAM_CHANNEL_ID;
    if (!channelId) throw new Error('[Telegram] TELEGRAM_CHANNEL_ID is not set.');

    await bot.telegram.sendMessage(channelId, text);
    console.log('[Telegram] Message sent to channel.');
}

/**
 * Send a text message to the admin chat.
 * @param {string} text
 */
async function sendToAdmin(text) {
    if (!bot) return;
    const adminId = process.env.ADMIN_CHAT_ID;
    if (!adminId) return;

    try {
        await bot.telegram.sendMessage(adminId, text);
    } catch (err) {
        console.error('[Telegram] Failed to send to admin:', err.message);
    }
}

/**
 * Send an image buffer to the admin chat (used for WhatsApp QR codes).
 * @param {Buffer} imageBuffer - PNG image buffer
 * @param {string} caption - Image caption
 */
async function sendImageToAdmin(imageBuffer, caption) {
    if (!bot) throw new Error('[Telegram] Bot not initialized.');

    const adminId = process.env.ADMIN_CHAT_ID;
    if (!adminId) throw new Error('[Telegram] ADMIN_CHAT_ID is not set.');

    await bot.telegram.sendPhoto(adminId, { source: imageBuffer }, { caption });
    console.log('[Telegram] QR image sent to admin.');
}

/**
 * Send a daily poll to the Telegram channel.
 */
async function sendDailyPoll() {
    if (!bot) return;

    const channelId = process.env.TELEGRAM_CHANNEL_ID;
    if (!channelId) return;

    try {
        await bot.telegram.sendPoll(
            channelId,
            'What courses do you want to see tomorrow? 🤔',
            [
                'Web Development',
                'Python',
                'AI / Machine Learning',
                'Design',
                'Business',
                'Marketing',
                'Office Productivity',
                'Other',
            ],
            {
                is_anonymous: true,
                allows_multiple_answers: true,
            }
        );
        console.log('[Telegram] Daily poll sent to channel.');
    } catch (err) {
        console.error('[Telegram] Failed to send poll:', err.message);
    }
}

/**
 * Get the bot instance (for external use).
 * @returns {Telegraf}
 */
function getBot() {
    return bot;
}

module.exports = {
    initTelegram,
    startBot,
    sendForApproval,
    sendToChannel,
    sendToAdmin,
    sendImageToAdmin,
    sendDailyPoll,
    getBot,
};
