// ============================================
// Gemini AI Module — Post Generation
// ============================================
// Uses Google Gemini API to generate engaging
// promotional posts for free Udemy courses.
// ============================================

const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI = null;
let model = null;

/**
 * Initialize the Gemini client.
 */
function initGemini() {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error('[Gemini] GEMINI_API_KEY is not set in environment variables.');
    }
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    console.log('[Gemini] Initialized with model: gemini-2.5-flash');
}

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

    const prompt = `You are a social media copywriter for an educational Telegram and WhatsApp channel that shares free Udemy courses.

Write a short, engaging promotional post (UNDER 150 words) for the following free Udemy course. The post must:
- Use relevant emojis throughout to make it eye-catching
- Emphasize that the course is 100% FREE for a LIMITED TIME
- Include the course title prominently and MUST wrap it in asterisks to bold it (e.g. *Course Name*)
- Mention the category briefly
- Create urgency (limited time, grab it now, etc.)
- End with the enrollment link
- Be formatted as plain text suitable for both Telegram and WhatsApp (no markdown other than * for bold, no HTML)
- Do NOT include any placeholders — this must be ready to post immediately
- Do NOT add hashtags

Course Details:
- Title: ${course.title}
- Category: ${course.category}
- Rating: ${course.rate || 'New'}
- Description: ${course.description}
- Enrollment Link: ${course.udemyUrl}

Write the post now:`;

    try {
        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();

        if (!text || text.length < 20) {
            throw new Error('Generated post is too short or empty.');
        }

        console.log(`[Gemini] Generated post for "${course.title}" (${text.length} chars)`);
        return text.trim();
    } catch (err) {
        console.error(`[Gemini] Error generating post for "${course.title}":`, err.message);

        // Fallback: generate a simple template post
        return generateFallbackPost(course);
    }
}

/**
 * Fallback post template if Gemini API fails.
 * @param {Object} course
 * @returns {string}
 */
function generateFallbackPost(course) {
    console.log(`[Gemini] Using fallback template for "${course.title}"`);
    return `🎓 FREE Course Alert! 🔥

📚 *${course.title}*

📂 Category: ${course.category}
⭐ Rating: ${course.rate || 'N/A'}

${course.description ? course.description.substring(0, 200) + '...' : ''}

🆓 This course is 100% FREE for a LIMITED TIME!
⏰ Grab it before the coupon expires!

👉 Enroll Now: ${course.udemyUrl}

Don't miss out! 🚀`;
}

module.exports = { initGemini, generatePost };
