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

    const prompt = `You are an expert social media copywriter for an educational Telegram and WhatsApp channel sharing free Udemy courses.

Your task is to write a highly engaging, creative promotional post for the course provided below. 

CRITICAL REQUIREMENT: The output MUST be in two sections:
1. First section: A captivating English post.
2. Second section: A natural, friendly, and persuasive Egyptian Arabic post (كلام مصري عامي كأنك بتكلم صحابك).
Separate the two sections with this exact divider: ➖➖➖➖➖➖➖➖

Guidelines for BOTH sections:
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
