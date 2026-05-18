// ============================================
// Scraper Module — couponami.com
// ============================================
// Extracts free Udemy courses from couponami.com
// using axios + cheerio (no browser required).
// ============================================

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.couponami.com';
const ALL_COURSES_URL = `${BASE_URL}/all`;
const POSTED_FILE = path.join(__dirname, '..', 'data', 'posted.json');

// Delay helper to avoid rate limiting
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Load the set of already-posted course slugs from disk.
 * @returns {Set<string>}
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
 * @param {Set<string>} slugs
 */
function savePostedSlugs(slugs) {
    const dir = path.dirname(POSTED_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(POSTED_FILE, JSON.stringify([...slugs], null, 2), 'utf-8');
}

/**
 * Extract the slug from a couponami course URL.
 * e.g. "https://www.couponami.com/business/some-course" -> "some-course"
 * @param {string} url
 * @returns {string}
 */
function extractSlug(url) {
    const parts = url.replace(/\/$/, '').split('/');
    return parts[parts.length - 1];
}

/**
 * Fetch the listing page and extract course links + categories.
 * @param {number} [page=1] - Page number to scrape
 * @param {string} [category] - Specific category slug (optional)
 * @returns {Promise<Array<{name: string, detailUrl: string, category: string}>>}
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
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            },
            timeout: 15000,
        });

        const $ = cheerio.load(html);
        const courses = [];

        // Each course card has an a.card-header with the course name and link
        $('a.card-header').each((_, el) => {
            const name = $(el).text().trim();
            const href = $(el).attr('href');
            if (!name || !href) return;

            const detailUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;

            // Find the category link near this card
            const card = $(el).closest('.card') || $(el).parent();
            const categoryEl = card.find('a[href*="/category/"]').first();
            const courseCategory = categoryEl.length ? categoryEl.text().trim() : 'General';

            courses.push({ name, detailUrl, category: courseCategory });
        });

        console.log(`[Scraper] Found ${courses.length} courses on page ${page}`);
        return courses;
    } catch (err) {
        console.error(`[Scraper] Error fetching list page ${page}:`, err.message);
        return [];
    }
}

/**
 * Fetch an individual course detail page to get full description + enrollment link.
 * @param {string} detailUrl
 * @returns {Promise<{description: string, goUrl: string} | null>}
 */
async function fetchCourseDetail(detailUrl) {
    try {
        console.log(`[Scraper] Fetching detail: ${detailUrl}`);
        const { data: html } = await axios.get(detailUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            },
            timeout: 15000,
        });

        const $ = cheerio.load(html);

        // Extract description — text blocks in the main content area
        let description = '';
        const descSection = $('div.ui.segment, div.content, div.description, article').first();
        if (descSection.length) {
            // Get all paragraph text within the content area
            description = descSection.find('p').map((_, p) => $(p).text().trim()).get().join(' ');
        }

        // Fallback: grab the meta description
        if (!description || description.length < 20) {
            description = $('meta[name="description"]').attr('content') || '';
        }

        // If still empty, try getting all text after "Description" heading
        if (!description || description.length < 20) {
            const allText = $('body').text();
            const descIndex = allText.indexOf('Description');
            if (descIndex !== -1) {
                description = allText.substring(descIndex + 11, descIndex + 511).trim();
            }
        }

        // Find the "Take Course" button — links to /go/slug
        const goBtn = $('a.discBtn, a[href*="/go/"]').first();
        const goUrl = goBtn.length ? goBtn.attr('href') : null;

        if (!goUrl) {
            console.log(`[Scraper] No enrollment link found on ${detailUrl}`);
            return null;
        }

        const fullGoUrl = goUrl.startsWith('http') ? goUrl : `${BASE_URL}${goUrl}`;

        return {
            description: description.substring(0, 500), // Cap at 500 chars for Gemini
            goUrl: fullGoUrl,
        };
    } catch (err) {
        console.error(`[Scraper] Error fetching detail ${detailUrl}:`, err.message);
        return null;
    }
}

/**
 * Follow the /go/ redirect page to extract the final Udemy enrollment URL.
 * @param {string} goUrl - The couponami /go/ URL
 * @returns {Promise<string | null>} - The final Udemy URL
 */
async function fetchUdemyUrl(goUrl) {
    try {
        console.log(`[Scraper] Fetching enrollment URL: ${goUrl}`);
        const { data: html } = await axios.get(goUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            },
            timeout: 15000,
        });

        const $ = cheerio.load(html);

        // The Udemy link is in an a.ui.green.button or any anchor linking to udemy.com
        const udemyLink = $('a[href*="udemy.com"]').first();
        if (udemyLink.length) {
            return udemyLink.attr('href');
        }

        // Fallback: look for any link with "enroll" or "coupon" in the URL
        const fallbackLink = $('a[href*="couponCode"], a[href*="enroll"]').first();
        if (fallbackLink.length) {
            return fallbackLink.attr('href');
        }

        console.log(`[Scraper] No Udemy URL found on ${goUrl}`);
        return null;
    } catch (err) {
        console.error(`[Scraper] Error fetching Udemy URL from ${goUrl}:`, err.message);
        return null;
    }
}

/**
 * Main scrape function — orchestrates the full pipeline.
 * Returns an array of new (not yet posted) course objects.
 * @param {number} [maxCourses] - Maximum courses to process overall
 * @param {number} [pagesToScrape=1] - Number of pages to scan
 * @param {string} [category=null] - Specific category
 * @returns {Promise<Array<{title: string, category: string, description: string, udemyUrl: string, slug: string}>>}
 */
async function scrapeCourses(maxCourses, pagesToScrape = 1, category = null) {
    const limit = maxCourses || parseInt(process.env.MAX_COURSES_PER_RUN, 10) || 5;
    const postedSlugs = loadPostedSlugs();
    const results = [];

    console.log(`[Scraper] Starting scrape. Max courses: ${limit}, Pages: ${pagesToScrape}, Category: ${category || 'All'}. Already posted: ${postedSlugs.size}`);

    let allListings = [];
    for (let p = 1; p <= pagesToScrape; p++) {
        const listings = await fetchCourseList(p, category);
        allListings = allListings.concat(listings);
        await delay(1000);
    }

    for (const course of allListings) {
        if (results.length >= limit) break;

        const slug = extractSlug(course.detailUrl);

        // Skip already posted courses
        if (postedSlugs.has(slug)) {
            console.log(`[Scraper] Skipping (already posted): ${slug}`);
            continue;
        }

        await delay(1500); // Rate limiting

        // Fetch full details
        const detail = await fetchCourseDetail(course.detailUrl);
        if (!detail || !detail.goUrl) continue;

        await delay(1500); // Rate limiting

        // Fetch the actual Udemy URL
        const udemyUrl = await fetchUdemyUrl(detail.goUrl);
        if (!udemyUrl) continue;

        results.push({
            title: course.name,
            category: course.category,
            description: detail.description,
            udemyUrl,
            slug,
        });

        console.log(`[Scraper] ✅ Scraped: ${course.name}`);
    }

    console.log(`[Scraper] Scrape complete. Found ${results.length} new courses.`);
    return results;
}

/**
 * Mark a course slug as posted (persists to disk).
 * @param {string} slug
 */
function markAsPosted(slug) {
    const slugs = loadPostedSlugs();
    slugs.add(slug);
    savePostedSlugs(slugs);
    console.log(`[Scraper] Marked as posted: ${slug}`);
}

module.exports = { scrapeCourses, markAsPosted };
