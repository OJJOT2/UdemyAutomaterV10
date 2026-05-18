// ============================================
// Scraper Module — discudemy.com -> udemy.com
// ============================================
// Extracts free Udemy courses from discudemy.com,
// then scrapes Udemy directly for accurate metadata.
// ============================================

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.discudemy.com';
const ALL_COURSES_URL = `${BASE_URL}/all`;
const POSTED_FILE = path.join(__dirname, '..', 'data', 'posted.json');

// Delay helper to avoid rate limiting
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Load the set of already-posted course slugs from disk.
 */
function loadPostedSlugs() {
    try {
        const data = fs.readFileSync(POSTED_FILE, 'utf-8');
        return new Set(JSON.parse(data));
    } catch {
        return new Set();
    }
}

/**
 * Save the updated set of posted slugs to disk.
 */
function savePostedSlugs(slugs) {
    const dir = path.dirname(POSTED_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(POSTED_FILE, JSON.stringify([...slugs], null, 2), 'utf-8');
}

/**
 * Fetch the listing page and extract /go/ URLs to bypass detail pages.
 * @param {number} page - Page number
 * @param {string} category - Specific category
 * @returns {Promise<string[]>} - Array of /go/ URLs
 */
async function fetchCourseList(page = 1, category = null) {
    let baseUrl = ALL_COURSES_URL;
    if (category && category.toLowerCase() !== 'all') {
        baseUrl = `${BASE_URL}/category/${category.toLowerCase()}`;
    }
    const url = page === 1 ? baseUrl : `${baseUrl}/${page}`;
    console.log(`[Scraper] Fetching listing page: ${url}`);

    try {
        const { data: html } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            },
            timeout: 15000,
        });

        const $ = cheerio.load(html);
        const goUrls = [];

        // In discudemy, section.card contains a.card-header
        $('section.card').each((_, el) => {
            const href = $(el).find('a.card-header').attr('href');
            if (href) {
                // Convert https://www.discudemy.com/Language/course-slug to /go/course-slug
                const parts = href.replace(/\/$/, '').split('/');
                const slug = parts[parts.length - 1];
                const goUrl = `${BASE_URL}/go/${slug}`;
                goUrls.push(goUrl);
            }
        });

        console.log(`[Scraper] Found ${goUrls.length} courses on page ${page}`);
        return goUrls;
    } catch (err) {
        console.error(`[Scraper] Error fetching list page ${page}:`, err.message);
        return [];
    }
}

/**
 * Follow the /go/ redirect page to extract the final Udemy enrollment URL.
 */
async function fetchUdemyUrl(goUrl) {
    try {
        console.log(`[Scraper] Fetching enrollment URL: ${goUrl}`);
        const { data: html } = await axios.get(goUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            },
            timeout: 15000,
        });

        const $ = cheerio.load(html);

        // Find the udemy link inside div.ui.segment or generic anchor
        let udemyLink = $('div.ui.segment a').attr('href');
        if (!udemyLink) {
            udemyLink = $('a[href*="udemy.com"]').attr('href');
        }

        if (!udemyLink) {
            console.log(`[Scraper] No Udemy URL found on ${goUrl}`);
            return null;
        }

        return udemyLink;
    } catch (err) {
        console.error(`[Scraper] Error fetching Udemy URL from ${goUrl}:`, err.message);
        return null;
    }
}

/**
 * Fetch the exact metadata directly from Udemy.com.
 * @param {string} udemyUrl 
 * @returns {Promise<Object>}
 */
async function extractUdemyData(udemyUrl) {
    try {
        console.log(`[Scraper] Scraping Udemy directly: ${udemyUrl}`);
        const { data: html } = await axios.get(udemyUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
            },
            timeout: 15000,
        });

        const $ = cheerio.load(html);

        let name = "Unknown Title";
        const titleEl = $('h1.ud-heading-xxl, h1.clp-lead__title, h1.clp-lead__title--small').first();
        if (titleEl.length) name = titleEl.text().trim();

        let description = "No description available.";
        const descEl = $('div.ud-text-lg, div.clp-lead__headline').first();
        if (descEl.length) description = descEl.text().trim();

        let category = "General";
        const categoryLinks = $('div.course-landing-page__topic-menu a.ud-heading-sm, div.dark-background-inner-text-container a.ud-heading-sm');
        if (categoryLinks.length > 1) {
            category = $(categoryLinks[1]).text().trim();
        } else if (categoryLinks.length === 1) {
            category = $(categoryLinks[0]).text().trim();
        }

        let rate = "New";
        const rateEl = $('span.star-rating-module--rating-number--2-qA2, span[data-purpose="rating-number"]').first();
        if (rateEl.length) {
            rate = rateEl.text().trim();
        }

        return { name, description, category, rate };
    } catch (err) {
        console.error(`[Scraper] Error extracting Udemy data:`, err.message);
        return null;
    }
}

/**
 * Main scrape function — orchestrates the full pipeline.
 */
async function scrapeCourses(maxCourses, pagesToScrape = 1, category = null) {
    const limit = maxCourses || parseInt(process.env.MAX_COURSES_PER_RUN, 10) || 5;
    const postedSlugs = loadPostedSlugs();
    const results = [];

    console.log(`[Scraper] Starting scrape. Max courses: ${limit}, Pages: ${pagesToScrape}, Category: ${category || 'All'}. Already posted: ${postedSlugs.size}`);

    let allGoUrls = [];
    for (let p = 1; p <= pagesToScrape; p++) {
        const urls = await fetchCourseList(p, category);
        allGoUrls = allGoUrls.concat(urls);
        await delay(1000);
    }

    for (const goUrl of allGoUrls) {
        if (results.length >= limit) break;

        const parts = goUrl.split('/');
        const slug = parts[parts.length - 1];

        // Skip already posted courses
        if (postedSlugs.has(slug)) {
            console.log(`[Scraper] Skipping (already posted): ${slug}`);
            continue;
        }

        await delay(1500); // Rate limiting

        // Fetch the actual Udemy URL from the /go/ page
        const udemyUrl = await fetchUdemyUrl(goUrl);
        if (!udemyUrl) continue;

        await delay(1500); // Rate limiting

        // Fetch precise data from Udemy
        const udemyData = await extractUdemyData(udemyUrl);
        if (!udemyData) continue;

        results.push({
            title: udemyData.name,
            category: udemyData.category,
            description: udemyData.description,
            rate: udemyData.rate,
            udemyUrl,
            slug,
        });

        console.log(`[Scraper] ✅ Scraped: ${udemyData.name}`);
    }

    console.log(`[Scraper] Scrape complete. Found ${results.length} new courses.`);
    return results;
}

/**
 * Mark a course slug as posted (persists to disk).
 */
function markAsPosted(slug) {
    const slugs = loadPostedSlugs();
    slugs.add(slug);
    savePostedSlugs(slugs);
    console.log(`[Scraper] Marked as posted: ${slug}`);
}

module.exports = { scrapeCourses, markAsPosted };
