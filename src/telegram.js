// ============================================
// Telegram Module — Bot, Admin Approval & Channel
// ============================================
// Handles Telegram bot setup, admin approval flow
// with inline keyboards, channel posting, and
// daily polls (with winner tracking for smart scraping).
// ============================================

const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');

const POLL_WINNER_FILE = path.join(__dirname, '..', 'data', 'poll_winner.json');
let bot = null;
let whatsappModule = null; // Injected at runtime to avoid circular deps

// In-memory store for pending approval posts (shortId -> post data)
const pendingPosts = new Map();

// In-memory store for admin conversation state
const adminState = new Map();

// ─── Poll State ────────────────────────────────────────────────────────────────
// Stores the last sent poll's message_id and the most recent vote counts.
// Updated via Telegram's `poll` update events (fires when vote totals change).
const pollState = {
    messageId: null,       // message_id of the last sent poll
    chatId: null,          // chat where the poll was sent
    options: [],           // Array of option texts (in order)
    voteCounts: [],        // Array of vote counts aligned with options[]
    winnerCategory: null,  // Resolved MERGED_CATEGORIES key (set when poll closes / at 8 AM)
};

// ─── Merged Categories ────────────────────────────────────────────────────────
// Maps poll option labels → sub-category slug arrays for the scraper.
const MERGED_CATEGORIES = {
    '💻 Development': ['android', 'angularjs', 'bootstrap', 'c', 'cpp', 'csharp', 'css', 'data-structure', 'debug-test', 'development-tools', 'django', 'drupal', 'game-development', 'git', 'html', 'ios', 'java', 'javascript', 'jquery', 'json', 'machine-learning', 'matlab', 'mobile-development-other', 'nodejs', 'php', 'programming-other', 'python', 'r-programming', 'react-redux', 'robotics', 'ruby', 'software', 'system-programming', 'web-development-other', 'wordpress', 'vue'],
    '🎨 Design & Video': ['3d-model', 'after-effects', 'animation', 'graphic-design', 'photography', 'photoshop', 'premiere-pro', 'video-design', 'ux'],
    '⚙️ IT & Software': ['aws', 'hardware', 'hosting', 'linux', 'mac', 'network-security', 'windows', 'windows-server', 'mysql', 'nosql', 'sql', 'ethical-hacking'],
    '📈 Business & Marketing': ['business', 'e-commerce', 'marketing', 'seo', 'social-media', 'office-productivity'],
    '🧘 Lifestyle & Other': ['academic', 'blockchain', 'certification', 'health-fitness', 'languages', 'lifestyle', 'music', 'personal-development'],
    '🌍 All': ['all'],
};

// Poll option labels (order must match the poll sent to Telegram)
const POLL_OPTIONS = [
    '💻 Development',
    '🎨 Design & Video',
    '⚙️ IT & Software',
    '📈 Business & Marketing',
    '🧘 Lifestyle & Other',
    '🌍 All Categories',
];

// Maps poll option text → MERGED_CATEGORIES key
const POLL_OPTION_MAP = {
    '💻 Development': '💻 Development',
    '🎨 Design & Video': '🎨 Design & Video',
    '⚙️ IT & Software': '⚙️ IT & Software',
    '📈 Business & Marketing': '📈 Business & Marketing',
    '🧘 Lifestyle & Other': '🧘 Lifestyle & Other',
    '🌍 All Categories': '🌍 All',
};

function getCategoryKeyboard() {
    const keys = Object.keys(MERGED_CATEGORIES);
    const res = [];
    for (let i = 0; i < keys.length; i += 2) {
        res.push(keys.slice(i, i + 2));
    }
    res.push(['Cancel']);
    return Markup.keyboard(res).resize();
}

// ─── Init ─────────────────────────────────────────────────────────────────────

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

    // ── Admin Commands ──────────────────────────────────────────────────────────

    bot.command('start', (ctx) => {
        if (!isAdmin(ctx)) return;
        ctx.reply(
            '🤖 *Udemy Automater V10* is running!\n\n' +
            'Commands:\n' +
            '/scrape — Interactive manual scrape\n' +
            '/status — Check bot & WhatsApp status\n' +
            '/qr — Re-send WhatsApp QR code\n' +
            '/poll — Send next-day poll now\n' +
            '/winner — Show current poll winner\n\n' +
            '🛠️ *Testing Commands*\n' +
            '/test_morning — Run the 8 AM automated flow\n' +
            '/test_deadline — Run the 4 PM auto-post flow\n',
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
        const winner = pollState.winnerCategory || '(no poll yet / no votes)';
        ctx.reply(
            `📊 *Bot Status*\n\n` +
            `🤖 Telegram: ✅ Running\n` +
            `📱 WhatsApp: ${waStatus}\n` +
            `🗳️ Poll Winner: ${winner}\n` +
            `📅 Last check: ${new Date().toLocaleString('en-US', { timeZone: process.env.TZ || 'Africa/Cairo' })}`,
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

    // Manual poll trigger
    bot.command('poll', async (ctx) => {
        if (!isAdmin(ctx)) return;
        try {
            await sendDailyPoll();
            ctx.reply('✅ Poll sent to channel!');
        } catch (err) {
            console.error('[Telegram] /poll command failed:', err.message);
            ctx.reply(
                `❌ Failed to send poll!\n\n` +
                `Error: ${err.message}\n\n` +
                `Common fixes:\n` +
                `• Make sure the bot is an *admin* in your channel\n` +
                `• The bot needs \'Post Messages\' permission\n` +
                `• Check TELEGRAM_CHANNEL_ID in your .env`,
                { parse_mode: 'Markdown' }
            );
        }
    });

    // Show current poll winner
    bot.command('winner', (ctx) => {
        if (!isAdmin(ctx)) return;
        let winner = resolvePollWinner();
        if (!winner) {
            winner = loadPollWinner();
        }
        
        if (!winner) {
            return ctx.reply('🗳️ No poll data available yet. Send a poll first.');
        }
        const subcats = MERGED_CATEGORIES[winner] || ['all'];
        ctx.reply(
            `🏆 Current Poll Winner: *${winner}*\n` +
            `📂 Sub-categories: ${subcats.join(', ')}`,
            { parse_mode: 'Markdown' }
        );
    });

    // Debug commands to trigger cron jobs manually
    bot.command('test_morning', async (ctx) => {
        if (!isAdmin(ctx)) return;
        if (bot._onTestMorning) await bot._onTestMorning(ctx);
    });

    bot.command('test_deadline', async (ctx) => {
        if (!isAdmin(ctx)) return;
        if (bot._onTestDeadline) await bot._onTestDeadline(ctx);
    });

    // ── Text Handler for Conversation State ─────────────────────────────────────
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

            return ctx.reply(`✅ Pages set to ${pages}.\n\nWhich category?`, getCategoryKeyboard());
        }

        if (state.step === 'ASK_CATEGORY') {
            let categoryList = null;
            if (MERGED_CATEGORIES[text]) {
                categoryList = MERGED_CATEGORIES[text];
            } else if (text.toLowerCase() === 'all' || text === '🌍 All') {
                categoryList = ['all'];
            } else {
                categoryList = [text.toLowerCase()]; // Fallback
            }

            const pages = state.pages;

            adminState.delete(ctx.from.id);
            ctx.reply(`🚀 Starting batch scrape for ${pages} page(s) across ${categoryList.length} sub-categories...`, Markup.removeKeyboard());

            // Trigger actual scrape in index.js
            if (bot._onManualScrape) {
                try {
                    await bot._onManualScrape(ctx, pages, categoryList);
                } catch (err) {
                    ctx.reply(`❌ Scrape failed: ${err.message}`);
                }
            }
            return;
        }

        return next();
    });

    // ── Poll Update Handler ─────────────────────────────────────────────────────
    // Telegram fires a `poll` update whenever vote totals change (for non-anonymous
    // polls). For anonymous polls in channels, we get the final snapshot via this event.
    bot.on('poll', (ctx) => {
        const p = ctx.poll;
        if (!p) return;

        console.log('[Telegram] Poll update received, storing vote counts.');
        pollState.options = p.options.map((o) => o.text);
        pollState.voteCounts = p.options.map((o) => o.voter_count);

        // Resolve winner immediately on each update
        const winner = resolvePollWinner();
        if (winner) {
            pollState.winnerCategory = winner;
            savePollWinner(winner);
            console.log(`[Telegram] Poll winner updated: ${winner}`);
        }
    });

    // ── Inline Button Handlers ──────────────────────────────────────────────────

    // 1. Generate AI Post
    bot.action(/generate_ai_(.+)/, async (ctx) => {
        const shortId = ctx.match[1];
        const postData = pendingPosts.get(shortId);

        if (!postData) {
            return ctx.answerCbQuery('⚠️ Post data expired.', { show_alert: true });
        }

        await ctx.answerCbQuery('🪄 Generating AI post... please wait.');

        try {
            const aiText = await postData.onGenerateAI(postData.course);
            postData.text = aiText;

            const keyboard = Markup.inlineKeyboard([
                Markup.button.callback('✅ Approve & Post', `approve_${shortId}`),
                Markup.button.callback('❌ Reject', `reject_${shortId}`),
            ]);

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
        const shortId = ctx.match[1];
        await ctx.answerCbQuery('Broadcasting raw text...');
        await broadcastPost(ctx, shortId);
    });

    // 3. Approve AI Post
    bot.action(/approve_(.+)/, async (ctx) => {
        const shortId = ctx.match[1];
        await ctx.answerCbQuery('Approving AI post...');
        await broadcastPost(ctx, shortId);
    });

    // 4. Reject
    bot.action(/reject_(.+)/, async (ctx) => {
        const shortId = ctx.match[1];
        const postData = pendingPosts.get(shortId);
        const title = postData ? postData.course.title : shortId;
        await ctx.answerCbQuery('Rejected.');
        pendingPosts.delete(shortId);
        await ctx.editMessageText(`❌ Course rejected: ${title}`);
        console.log(`[Telegram] ❌ Rejected: ${title}`);
    });

    // ── Error Handler ───────────────────────────────────────────────────────────
    bot.catch((err) => {
        console.error('[Telegram] Bot error:', err.message);
    });

    console.log('[Telegram] Bot initialized.');
    return bot;
}

// ─── Broadcast ────────────────────────────────────────────────────────────────

/**
 * Helper to broadcast the pending post to channels.
 * Also calls _onPostApproved hook (set by index.js) to track approved count.
 */
async function broadcastPost(ctx, shortId) {
    const postData = pendingPosts.get(shortId);
    if (!postData) {
        return ctx.editMessageText('⚠️ Post data not found (may have expired). No action taken.');
    }

    try {
        const telegramText = cleanMarkdownForTelegram(postData.text);
        const originalSlug = postData.course.slug;

        // 1. Post to Telegram Channel
        await sendToChannel(telegramText, postData.course.udemyUrl);
        console.log(`[Telegram] ✅ Posted to channel: ${originalSlug}`);

        // 2. Post to WhatsApp
        if (whatsappModule) {
            try {
                await whatsappModule.sendToChannel(postData.text);
                console.log(`[Telegram] ✅ Posted to WhatsApp: ${originalSlug}`);
            } catch (waErr) {
                console.error(`[Telegram] WhatsApp broadcast failed for ${originalSlug}:`, waErr.message);
                await sendToAdmin(`⚠️ WhatsApp broadcast failed for "${postData.course.title}": ${waErr.message}`);
            }
        }

        // 3. Mark as posted
        if (postData.onApprove) {
            postData.onApprove(originalSlug);
        }

        // 4. Notify index.js that a post was approved (for deadline counter)
        if (bot._onPostApproved) {
            bot._onPostApproved();
        }

        // 5. Update the admin message
        await ctx.editMessageText(`✅ Posted successfully!\n\n${telegramText}`, {
            parse_mode: 'HTML',
            link_preview_options: { url: postData.course.udemyUrl, show_above_text: true }
        });

        pendingPosts.delete(shortId);
    } catch (err) {
        console.error(`[Telegram] Error broadcasting ${shortId}:`, err.message);
        await ctx.editMessageText(`❌ Broadcast failed: ${err.message}`);
    }
}

// ─── Auto-Post ────────────────────────────────────────────────────────────────

/**
 * Auto-post up to `count` courses directly to the channel WITHOUT admin review.
 * Used by the 4 PM deadline job.
 * @param {Array} courses - Array of course objects from the scraper
 * @param {number} count - Max number to post
 * @param {Function} onGenerateAI - Callback to generate AI text
 * @param {Function} onApprove - markAsPosted callback
 */
async function autoPostCourses(courses, count, onGenerateAI, onApprove) {
    if (!bot) throw new Error('[Telegram] Bot not initialized.');
    const tz = process.env.TZ || 'Africa/Cairo';

    console.log(`[Telegram] ⏰ Auto-posting up to ${count} courses (deadline reached).`);
    await sendToAdmin(`⏰ *4 PM Deadline Reached!*\nNo posts were approved today.\nAuto-posting ${Math.min(count, courses.length)} courses with AI now...`);

    let posted = 0;
    for (const course of courses) {
        if (posted >= count) break;

        try {
            // Generate the AI post
            const aiText = await onGenerateAI(course);
            const telegramText = cleanMarkdownForTelegram(aiText);

            // Post to channel
            await sendToChannel(telegramText, course.udemyUrl);

            // Post to WhatsApp
            if (whatsappModule) {
                try {
                    await whatsappModule.sendToChannel(aiText);
                } catch (waErr) {
                    console.error(`[Telegram] WhatsApp auto-post failed for "${course.title}":`, waErr.message);
                }
            }

            // Mark as posted
            if (onApprove) onApprove(course.slug);

            console.log(`[Telegram] ✅ Auto-posted (AI): ${course.title}`);
            posted++;

            // 5-second delay between AI generation/posts to avoid rate limits and keep stable
            await new Promise((r) => setTimeout(r, 5000));
        } catch (err) {
            console.error(`[Telegram] Auto-post failed for "${course.title}":`, err.message);
        }
    }

    await sendToAdmin(`✅ Auto-posted ${posted} course(s).\nSending next-day poll now...`);
    console.log(`[Telegram] Auto-post complete. Posted ${posted} course(s).`);
}

// ─── Poll Helpers ─────────────────────────────────────────────────────────────

function savePollWinner(winnerStr) {
    try {
        const dir = path.dirname(POLL_WINNER_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(POLL_WINNER_FILE, JSON.stringify({ winner: winnerStr }));
    } catch (e) {
        console.error('[Telegram] Failed to save poll winner to disk:', e.message);
    }
}

function loadPollWinner() {
    try {
        if (fs.existsSync(POLL_WINNER_FILE)) {
            const data = JSON.parse(fs.readFileSync(POLL_WINNER_FILE, 'utf-8'));
            return data.winner;
        }
    } catch (e) {
        console.error('[Telegram] Failed to load poll winner from disk:', e.message);
    }
    return null;
}

/**
 * Resolve the winning MERGED_CATEGORIES key from the current pollState.
 * Returns null if no poll data is available.
 */
function resolvePollWinner() {
    if (!pollState.voteCounts || pollState.voteCounts.length === 0) return null;

    let maxVotes = -1;
    let winnerIndex = 0;
    for (let i = 0; i < pollState.voteCounts.length; i++) {
        if (pollState.voteCounts[i] > maxVotes) {
            maxVotes = pollState.voteCounts[i];
            winnerIndex = i;
        }
    }

    const winnerLabel = pollState.options[winnerIndex] || POLL_OPTIONS[winnerIndex];
    return POLL_OPTION_MAP[winnerLabel] || '🌍 All';
}

/**
 * Get the winning poll category's subcategory list.
 * Falls back to ['all'] if no poll data available.
 */
function getPollWinnerCategory() {
    let winner = pollState.winnerCategory || resolvePollWinner();
    if (!winner) {
        winner = loadPollWinner(); // fallback to disk if bot restarted
    }
    
    if (!winner) {
        console.log('[Telegram] No poll winner found, defaulting to All categories.');
        return ['all'];
    }
    const subcats = MERGED_CATEGORIES[winner] || ['all'];
    console.log(`[Telegram] Poll winner: ${winner} → ${subcats.length} sub-categories`);
    return subcats;
}

// ─── Core Bot Functions ───────────────────────────────────────────────────────

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
    let clean = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    clean = clean.replace(/\*(.*?)\*/g, '<b>$1</b>');
    return clean;
}

/**
 * Send a raw course preview to the admin for approval/generation.
 */
async function sendRawPreview(course, onGenerateAI, onApprove) {
    if (!bot) throw new Error('[Telegram] Bot not initialized.');

    const adminId = process.env.ADMIN_CHAT_ID;
    if (!adminId) throw new Error('[Telegram] ADMIN_CHAT_ID is not set.');

    const rawText =
        `📚 *${course.title}*\n` +
        `📂 Category: ${course.category}\n` +
        `⭐ Rating: ${course.rate || 'N/A'}\n\n` +
        `${course.description}\n\n` +
        `👉 Link: ${course.udemyUrl}`;

    const shortId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);

    pendingPosts.set(shortId, {
        course: course,
        text: rawText,
        onGenerateAI,
        onApprove,
    });

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🪄 Generate AI Post', `generate_ai_${shortId}`)],
        [
            Markup.button.callback('📤 Send Directly', `send_direct_${shortId}`),
            Markup.button.callback('❌ Reject', `reject_${shortId}`)
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
        await bot.telegram.sendMessage(adminId, text, { parse_mode: 'Markdown' });
    } catch (err) {
        // Fallback without markdown if parse fails
        try {
            await bot.telegram.sendMessage(adminId, text);
        } catch (e) {
            console.error('[Telegram] Failed to send to admin:', e.message);
        }
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
 * Send a daily poll to the Telegram channel asking what courses to show tomorrow.
 * Stores pollState so we can read the winner the next morning.
 */
async function sendDailyPoll() {
    if (!bot) throw new Error('Bot not initialized.');

    const channelId = process.env.TELEGRAM_CHANNEL_ID;
    if (!channelId) {
        throw new Error('TELEGRAM_CHANNEL_ID is not set in .env');
    }

    // sendPoll throws on Telegram API errors — let the caller handle them
    const sentPoll = await bot.telegram.sendPoll(
        channelId,
        'What kind of courses do you want to see tomorrow? 📚🤔\nيا ترى إيه نوع الكورسات اللي حابب تشوفها بكرة؟',
        POLL_OPTIONS,
        {
            is_anonymous: true,
            allows_multiple_answers: false,
        }
    );

    // Store poll metadata so we can correlate poll updates
    pollState.messageId = sentPoll.message_id;
    pollState.chatId = channelId;
    pollState.options = POLL_OPTIONS.slice(); // snapshot
    pollState.voteCounts = new Array(POLL_OPTIONS.length).fill(0);
    pollState.winnerCategory = null;

    console.log(`[Telegram] Daily poll sent to channel (message_id: ${sentPoll.message_id}).`);
}

/**
 * Send a poll on-demand (e.g., after finishing review or after auto-post).
 * Alias kept for clarity at call sites.
 */
async function sendPollAfterPosting() {
    await sendDailyPoll();
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
    sendPollAfterPosting,
    autoPostCourses,
    getPollWinnerCategory,
    getBot,
};
