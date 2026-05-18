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

    const prompt = `You are an expert social media copywriter for an educational Telegram and WhatsApp channel sharing free Udemy courses.

Your task is to write a highly engaging, creative promotional post for the course provided below. 

CRITICAL REQUIREMENT: The output MUST be in two sections:
1. First section: A captivating English post.
2. Second section: A natural, friendly, and persuasive Egyptian Arabic post (كلام مصري عامي كأنك بتكلم صحابك).
Separate the two sections with this exact divider: ➖➖➖➖➖➖➖➖

Guidelines for BOTH sections:
- Keep the intro/greeting VERY SHORT (1-3 words max). Just get straight to the point (e.g. "Free Course!", "كورس مجاني!"). Do not write long greetings.
- Be creative and conversational! Do not just spit out a rigid template.
- Hook the reader immediately and highlight the value of the course.
- Emphasize strongly that the course is 100% FREE for a LIMITED TIME (create urgency/FOMO).
- Include the course title prominently and wrap it in asterisks so it bolds (e.g., *Course Name*).
- Briefly mention the category.
- Use relevant and fun emojis throughout to make the text pop.
- Provide the enrollment link clearly at the end of each section (or once at the bottom).
- Format as plain text suitable for WhatsApp/Telegram (ONLY use * for bold, no other markdown, no HTML, no hashtags).
- Do NOT include any placeholder text.

Course Details:
- Title: ${course.title}
- Category: ${course.category}
- Rating: ${course.rate || 'New'}
- Description: ${course.description}
- Enrollment Link: ${course.udemyUrl}

Write the posts now:`;

    // Retry loop for API key rotation
    let attempts = 0;
    const maxAttempts = apiKeys.length; // Try each key once before giving up

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

            // Check if it's a rate limit (429) or quota exceeded (403/Quota)
            const isExhausted = errMsg.includes('429') || errMsg.includes('403') || errMsg.includes('quota') || errMsg.includes('Too Many Requests');
            
            if (isExhausted && apiKeys.length > 1) {
                console.log('[Gemini] ⚠️ API Key exhausted or rate-limited. Attempting rotation...');
                rotateKey();
                attempts++;
                await delay(1000); // small backoff before trying next key
            } else {
                // If it's not a rate limit error, or we only have 1 key, break out and use fallback
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
    return `🎓 FREE Course Alert! 🔥

📚 *${course.title}*

📂 Category: ${course.category}
⭐ Rating: ${course.rate || 'N/A'}

${course.description ? course.description.substring(0, 200) + '...' : ''}

🆓 This course is 100% FREE for a LIMITED TIME!
⏰ Grab it before the coupon expires!

👉 Enroll Now: ${course.udemyUrl}

➖➖➖➖➖➖➖➖

🎓 كورس مجاني الحق بسرعة! 🔥

📚 *${course.title}*

📂 القسم: ${course.category}
⭐ التقييم: ${course.rate || 'N/A'}

🆓 الكورس ده مجاني 100% لفترة محدودة جداً!
⏰ الحق سجل فيه قبل ما الكوبون يخلص!

👉 رابط التسجيل: ${course.udemyUrl}

ماتفوتش الفرصة! 🚀`;
}

module.exports = { initGemini, generatePost };
