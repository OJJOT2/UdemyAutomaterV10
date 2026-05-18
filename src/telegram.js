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

// In-memory store for admin conversation state
// chat_id -> { step: 'ASK_PAGES' | 'ASK_CATEGORY', pages: number }
const adminState = new Map();

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
            '/scrape — Interactive manual scrape\n' +
            '/status — Check bot & WhatsApp status\n' +
            '/qr — Re-send WhatsApp QR code\n',
            { parse_mode: 'Markdown' }
        );
    });

    bot.command('scrape', async (ctx) => {
        if (!isAdmin(ctx)) return;
        
        // Start conversation
        adminState.set(ctx.from.id, { step: 'ASK_PAGES' });
        
        ctx.reply('🔄 Interactive Scrape Started.\n\nHow many pages do you want to scrape? (e.g., 1, 2, 3...)', 
            Markup.keyboard(['1', '2', '3', 'Cancel']).oneTime().resize()
        );
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

    // --- Text Handler for Conversation State ---
    bot.on('text', async (ctx, next) => {
        if (!isAdmin(ctx)) return next();
        const state = adminState.get(ctx.from.id);
        if (!state) return next();

        const text = ctx.message.text.trim();

        if (text.toLowerCase() === 'cancel') {
            adminState.delete(ctx.from.id);
            return ctx.reply('❌ Scrape cancelled.', Markup.removeKeyboard());
        }

        if (state.step === 'ASK_PAGES') {
            const pages = parseInt(text, 10);
            if (isNaN(pages) || pages < 1 || pages > 10) {
                return ctx.reply('⚠️ Please enter a valid number between 1 and 10.');
            }
            state.pages = pages;
            state.step = 'ASK_CATEGORY';
            
            return ctx.reply(`✅ Pages set to ${pages}.\n\nWhich category? (e.g., business, development, or 'all')`,
                Markup.keyboard(['all', 'development', 'business', 'it-and-software', 'Cancel']).oneTime().resize()
            );
        }

        if (state.step === 'ASK_CATEGORY') {
            const category = text.toLowerCase() === 'all' ? null : text;
            const pages = state.pages;
            
            adminState.delete(ctx.from.id);
            ctx.reply(`🚀 Starting scrape for ${pages} page(s) in category: ${category || 'All'}...`, Markup.removeKeyboard());
            
            // Trigger actual scrape in index.js
            if (bot._onManualScrape) {
                try {
                    await bot._onManualScrape(ctx, pages, category);
                } catch (err) {
                    ctx.reply(`❌ Scrape failed: ${err.message}`);
                }
            }
            return;
        }

        return next();
    });

    // --- Inline Button Handlers ---

    // 1. Generate AI Post
    bot.action(/generate_ai_(.+)/, async (ctx) => {
        const slug = ctx.match[1];
        const postData = pendingPosts.get(slug);
        
        if (!postData) {
            return ctx.answerCbQuery('⚠️ Post data expired.', { show_alert: true });
        }

        await ctx.answerCbQuery('🪄 Generating AI post... please wait.');
        
        try {
            // Call the callback to generate the post via Gemini
            const aiText = await postData.onGenerateAI(postData.course);
            postData.text = aiText; // Update the stored text to the AI version
            
            const keyboard = Markup.inlineKeyboard([
                Markup.button.callback('✅ Approve & Post', `approve_${slug}`),
                Markup.button.callback('❌ Reject', `reject_${slug}`),
            ]);

            // Clean asterisks to HTML bold for Telegram
            const formattedText = cleanMarkdownForTelegram(aiText);

            await ctx.editMessageText(
                `✨ *AI Post Generated*\n\n${formattedText}`,
                {
                    parse_mode: 'HTML',
                    link_preview_options: { url: postData.course.udemyUrl, show_above_text: true },
                    ...keyboard
                }
            );
        } catch (err) {
            console.error('[Telegram] AI Generation failed:', err);
            await ctx.answerCbQuery('❌ AI Generation failed!', { show_alert: true });
        }
    });

    // 2. Send Directly (Raw text)
    bot.action(/send_direct_(.+)/, async (ctx) => {
        const slug = ctx.match[1];
        await ctx.answerCbQuery('Broadcasting raw text...');
        await broadcastPost(ctx, slug);
    });

    // 3. Approve AI Post
    bot.action(/approve_(.+)/, async (ctx) => {
        const slug = ctx.match[1];
        await ctx.answerCbQuery('Approving AI post...');
        await broadcastPost(ctx, slug);
    });

    // 4. Reject
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
 * Helper to broadcast the pending post to channels.
 */
async function broadcastPost(ctx, slug) {
    const postData = pendingPosts.get(slug);
    if (!postData) {
        return ctx.editMessageText('⚠️ Post data not found (may have expired). No action taken.');
    }

    try {
        // Formatted for Telegram
        const telegramText = cleanMarkdownForTelegram(postData.text);
        
        // 1. Post to Telegram Channel
        await sendToChannel(telegramText, postData.course.udemyUrl);
        console.log(`[Telegram] ✅ Posted to channel: ${slug}`);

        // 2. Post to WhatsApp (raw text with asterisks)
        if (whatsappModule) {
            try {
                await whatsappModule.sendToChannel(postData.text);
                console.log(`[Telegram] ✅ Posted to WhatsApp: ${slug}`);
            } catch (waErr) {
                console.error(`[Telegram] WhatsApp broadcast failed for ${slug}:`, waErr.message);
                await sendToAdmin(`⚠️ WhatsApp broadcast failed for "${postData.course.title}": ${waErr.message}`);
            }
        }

        // 3. Mark as posted
        if (postData.onApprove) {
            postData.onApprove(slug);
        }

        // 4. Update the admin message
        await ctx.editMessageText(`✅ Posted successfully!\n\n${telegramText}`, {
            parse_mode: 'HTML',
            link_preview_options: { url: postData.course.udemyUrl, show_above_text: true }
        });

        pendingPosts.delete(slug);
    } catch (err) {
        console.error(`[Telegram] Error broadcasting ${slug}:`, err.message);
        await ctx.editMessageText(`❌ Broadcast failed: ${err.message}`);
    }
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
 */
function isAdmin(ctx) {
    const adminId = process.env.ADMIN_CHAT_ID;
    return ctx.from && String(ctx.from.id) === String(adminId);
}

/**
 * Clean simple *bold* markdown into <b>bold</b> HTML for Telegram.
 * WhatsApp uses * so we keep it as is for WhatsApp.
 */
function cleanMarkdownForTelegram(text) {
    // Escape HTML symbols first to prevent Telegram parse errors
    let clean = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Convert *bold* to <b>bold</b>
    clean = clean.replace(/\*(.*?)\*/g, '<b>$1</b>');
    return clean;
}

/**
 * Send a raw course preview to the admin for approval/generation.
 * @param {Object} course - Course data { title, slug, ... }
 * @param {Function} onGenerateAI - Callback to generate AI text
 * @param {Function} onApprove - Callback when approved (receives slug)
 */
async function sendRawPreview(course, onGenerateAI, onApprove) {
    if (!bot) throw new Error('[Telegram] Bot not initialized.');

    const adminId = process.env.ADMIN_CHAT_ID;
    if (!adminId) throw new Error('[Telegram] ADMIN_CHAT_ID is not set.');

    const rawText = `📚 *${course.title}*\n📂 Category: ${course.category}\n\n${course.description}\n\n👉 Link: ${course.udemyUrl}`;

    // Store post data
    pendingPosts.set(course.slug, {
        course: course,
        text: rawText,
        onGenerateAI,
        onApprove,
    });

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🪄 Generate AI Post', `generate_ai_${course.slug}`)],
        [
            Markup.button.callback('📤 Send Directly', `send_direct_${course.slug}`),
            Markup.button.callback('❌ Reject', `reject_${course.slug}`)
        ]
    ]);

    const formattedText = cleanMarkdownForTelegram(rawText);

    await bot.telegram.sendMessage(
        adminId,
        `📝 *Raw Scraped Course*\n\n${formattedText}`,
        {
            parse_mode: 'HTML',
            link_preview_options: { url: course.udemyUrl, show_above_text: true },
            ...keyboard,
        }
    );

    console.log(`[Telegram] Sent raw preview: ${course.title}`);
}

/**
 * Send a text message to the public Telegram channel.
 */
async function sendToChannel(text, url) {
    if (!bot) throw new Error('[Telegram] Bot not initialized.');

    const channelId = process.env.TELEGRAM_CHANNEL_ID;
    if (!channelId) throw new Error('[Telegram] TELEGRAM_CHANNEL_ID is not set.');

    await bot.telegram.sendMessage(channelId, text, {
        parse_mode: 'HTML',
        link_preview_options: { url: url, show_above_text: true }
    });
    console.log('[Telegram] Message sent to channel.');
}

/**
 * Send a text message to the admin chat.
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
 */
function getBot() {
    return bot;
}

module.exports = {
    initTelegram,
    startBot,
    sendRawPreview,
    sendToChannel,
    sendToAdmin,
    sendImageToAdmin,
    sendDailyPoll,
    getBot,
};
