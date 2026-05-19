// ============================================
// Gemini AI Module — Post Generation
// ============================================
// Uses Google Gemini API to generate engaging
// promotional posts for free Udemy courses.
// Supports API key rotation on exhaustion (429/403).
// ============================================

const { GoogleGenerativeAI } = require('@google/generative-ai');

let apiKeys = [];
let currentKeyIndex = 0;
let genAI = null;
let model = null;

/**
 * Initialize the Gemini client with the current key from the pool.
 */
function initGemini() {
    const keysRaw = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY; // fallback for backwards compatibility
    if (!keysRaw) {
        throw new Error('[Gemini] GEMINI_API_KEYS is not set in environment variables.');
    }

    // Parse comma-separated keys
    apiKeys = keysRaw.split(',').map(k => k.trim()).filter(k => k.length > 0);

    if (apiKeys.length === 0) {
        throw new Error('[Gemini] No valid API keys found in GEMINI_API_KEYS.');
    }

    _setupClientForCurrentKey();
}

/**
 * Internal helper to apply the current API key to the generative model.
 */
function _setupClientForCurrentKey() {
    const activeKey = apiKeys[currentKeyIndex];
    genAI = new GoogleGenerativeAI(activeKey);
    model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    console.log(`[Gemini] Initialized with model: gemini-2.5-flash (Using Key ${currentKeyIndex + 1}/${apiKeys.length})`);
}

/**
 * Rotate to the next API key in the pool. Returns false if all keys have been exhausted in one cycle.
 */
function rotateKey() {
    if (apiKeys.length <= 1) {
        console.log('[Gemini] Cannot rotate — only 1 key available in pool.');
        return false;
    }

    currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
    console.log(`[Gemini] 🔄 Rotating to next API key (Key ${currentKeyIndex + 1}/${apiKeys.length})...`);
    _setupClientForCurrentKey();
    return true;
}

/**
 * Delay helper.
 */
const delay = (ms) => new Promise(res => setTimeout(res, ms));

/**
 * Generate an engaging promotional post for a free Udemy course.
 * @param {Object} course - The course data
 * @param {string} course.title - Course name
 * @param {string} course.category - Course category
 * @param {string} course.description - Course description
 * @param {string} course.udemyUrl - Udemy enrollment URL
 * @returns {Promise<string>} - The generated post text
 */
async function generatePost(course) {
    if (!model) initGemini();


    const prompt = `
You are a viral Telegram/WhatsApp copywriter for FREE Udemy courses.

Write ONE engaging bilingual post using this structure:

🎓 Free Course: *[Course Title]*

- Short English promo:
  - mention category
  - what users learn
  - rating if available
  - emphasize FREE for limited time

- Short natural Egyptian Arabic promo:
  - casual Egyptian slang only
  - no cringe intros like "بص يا معلم" or "يا جدعان"
  - create urgency naturally

- Short CTA

Then append EXACTLY:

👉 Enroll Now: ${course.udemyUrl}
📱 Telegram: https://t.me/+cHifWbMnUNFmYjE0
🟢 WhatsApp: https://whatsapp.com/channel/0029Vay6zUG4SpkQ1CRZvw2s

Rules:
- One cohesive post only
- No greetings
- No hashtags
- Use only *bold*
- Use emojis naturally
- Keep it short, catchy, human, and non-repetitive

Course:
Title: ${course.title}
Category: ${course.category}
Rating: ${course.rate || 'New'}
Description: ${course.description}
Link: ${course.udemyUrl}
`;



    // Retry loop for API key rotation
    let attempts = 0;
    const maxAttempts = Math.min(4, apiKeys.length); // Try up to 4 times (or max keys)

    while (attempts < maxAttempts) {
        try {
            const result = await model.generateContent(prompt);
            const response = result.response;
            const text = response.text();

            if (!text || text.length < 20) {
                throw new Error('Generated post is too short or empty.');
            }

            console.log(`[Gemini] ✅ Generated post for "${course.title}" (${text.length} chars)`);
            return text.trim();
        } catch (err) {
            const errMsg = err.message || '';
            console.error(`[Gemini] Error generating post (Key ${currentKeyIndex + 1}):`, errMsg);

            // Check if it's a rate limit, quota exceeded, or invalid key
            const shouldRotate = errMsg.includes('429') || errMsg.includes('403') || errMsg.includes('400') || errMsg.includes('quota') || errMsg.includes('Too Many Requests') || errMsg.includes('API_KEY_INVALID');

            if (shouldRotate && apiKeys.length > 1) {
                console.log('[Gemini] ⚠️ API Key exhausted or invalid. Attempting rotation...');
                rotateKey();
                attempts++;
                await delay(1000); // small backoff before trying next key
            } else {
                // If it's a completely different error, or only 1 key, break
                break;
            }
        }
    }

    console.log(`[Gemini] ❌ All generation attempts failed. Using fallback template for "${course.title}"`);
    return generateFallbackPost(course);
}

/**
 * Fallback post template if Gemini API fails entirely.
 * @param {Object} course
 * @returns {string}
 */
function generateFallbackPost(course) {
    return `🔥 Free Course: *${course.title}*

📂 Category / القسم: ${course.category}
⭐ Rating / التقييم: ${course.rate || 'N/A'}

${course.description ? course.description.substring(0, 200) + '...' : ''}

🆓 This course is 100% FREE for a LIMITED TIME! Grab it before the coupon expires!
🆓 الكورس ده مجاني 100% لفترة محدودة جداً! الحق سجل فيه قبل ما الكوبون يخلص! 🚀

👉 Enroll Now: ${course.udemyUrl}
📱 Telegram: https://t.me/+cHifWbMnUNFmYjE0
🟢 WhatsApp: https://whatsapp.com/channel/0029Vay6zUG4SpkQ1CRZvw2s`;
}

module.exports = { initGemini, generatePost };
