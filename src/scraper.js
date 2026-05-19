// ============================================
// Scraper Module — couponami.com -> udemy.com
// ============================================
// Extracts free Udemy courses from couponami.com,
// and gracefully attempts to scrape Udemy directly 
// for the star rating.
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
 * Extract the slug from a couponami course URL.
 */
function extractSlug(url) {
    const parts = url.replace(/\/$/, '').split('/');
    return parts[parts.length - 1];
}

/**
 * Fetch the listing page and extract course links + categories.
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
        const courses = [];

        // Each course card has an a.card-header
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
 */
async function fetchCourseDetail(detailUrl) {
    try {
        console.log(`[Scraper] Fetching detail: ${detailUrl}`);
        const { data: html } = await axios.get(detailUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 15000,
        });

        const $ = cheerio.load(html);

        // Extract description
        let description = '';
        const descSection = $('div.ui.segment, div.content, div.description, article').first();
        if (descSection.length) {
            description = descSection.find('p').map((_, p) => $(p).text().trim()).get().join(' ');
        }
        if (!description || description.length < 20) {
            description = $('meta[name="description"]').attr('content') || '';
        }

        // Find the "Take Course" button — links to /go/slug
        const goBtn = $('a.discBtn, a[href*="/go/"]').first();
        const goUrl = goBtn.length ? goBtn.attr('href') : null;

        if (!goUrl) return null;
        const fullGoUrl = goUrl.startsWith('http') ? goUrl : `${BASE_URL}${goUrl}`;

        return {
            description: description.substring(0, 500),
            goUrl: fullGoUrl,
        };
    } catch (err) {
        console.error(`[Scraper] Error fetching detail ${detailUrl}:`, err.message);
        return null;
    }
}

/**
 * Follow the /go/ redirect page to extract the final Udemy enrollment URL.
 */
async function fetchUdemyUrl(goUrl) {
    try {
        console.log(`[Scraper] Fetching enrollment URL: ${goUrl}`);
        const { data: html } = await axios.get(goUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 15000,
        });

        const $ = cheerio.load(html);
        let udemyLink = $('a[href*="udemy.com"]').first().attr('href');
        if (!udemyLink) udemyLink = $('a[href*="couponCode"], a[href*="enroll"]').first().attr('href');

        return udemyLink || null;
    } catch (err) {
        console.error(`[Scraper] Error fetching Udemy URL from ${goUrl}:`, err.message);
        return null;
    }
}

/**
 * Fetch the exact metadata directly from Udemy.com (Graceful fallback)
 */
async function extractUdemyData(udemyUrl) {
    try {
        console.log(`[Scraper] Scraping Udemy directly for rating: ${udemyUrl}`);
        const { data: html } = await axios.get(udemyUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.128 Safari/537.36 Edg/89.0.774.77',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
                'Accept-Language': 'en-US,en;q=0.9',
            },
            timeout: 15000,
        });

        const $ = cheerio.load(html);

        let rate = "N/A";
        const rateEl = $('span.star-rating-module--rating-number--2-qA2, span[data-purpose="rating-number"]').first();
        if (rateEl.length) {
            rate = rateEl.text().trim();
        }

        return { rate };
    } catch (err) {
        console.log(`[Scraper] Udemy 403 blocked direct fetch. Using Couponami fallback data.`);
        return { rate: "N/A" };
    }
}

/**
 * Main scrape function — orchestrates the full pipeline.
 */
async function scrapeCourses(maxCourses, pagesToScrape = 1, category = null, onCourseScraped = null) {
    const limit = maxCourses || parseInt(process.env.MAX_COURSES_PER_RUN, 10) || 100;
    const postedSlugs = loadPostedSlugs();
    const results = [];

    const categoryList = Array.isArray(category) ? category : [category || 'all'];

    console.log(`[Scraper] Starting scrape. Max courses: ${limit}, Pages: ${pagesToScrape}, Sub-Categories: ${categoryList.length}. Already posted: ${postedSlugs.size}`);

    let allListings = [];
    for (const cat of categoryList) {
        console.log(`[Scraper] Batch scraping category: ${cat}`);
        for (let p = 1; p <= pagesToScrape; p++) {
            const listings = await fetchCourseList(p, cat);
            allListings = allListings.concat(listings);
            await delay(1000);
        }
    }

    // Filter out already-posted courses before processing
    const newListings = allListings.filter(course => {
        const slug = extractSlug(course.detailUrl);
        if (postedSlugs.has(slug)) {
            console.log(`[Scraper] Skipping (already posted): ${slug}`);
            return false;
        }
        return true;
    });

    // Process courses in parallel batches of 5
    const BATCH_SIZE = 5;
    for (let i = 0; i < newListings.length; i += BATCH_SIZE) {
        if (results.length >= limit) break;

        const batch = newListings.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map(async (course) => {
            try {
                const detail = await fetchCourseDetail(course.detailUrl);
                if (!detail || !detail.goUrl) return null;

                const udemyUrl = await fetchUdemyUrl(detail.goUrl);
                if (!udemyUrl) return null;

                const udemyData = await extractUdemyData(udemyUrl);

                return {
                    title: course.name,
                    category: course.category,
                    description: detail.description,
                    rate: udemyData.rate,
                    udemyUrl,
                    slug: extractSlug(course.detailUrl),
                };
            } catch (err) {
                console.error(`[Scraper] Error processing ${course.name}:`, err.message);
                return null;
            }
        });

        const batchResults = await Promise.all(batchPromises);

        for (const courseData of batchResults) {
            if (!courseData) continue;
            if (results.length >= limit) break;

            results.push(courseData);
            console.log(`[Scraper] ✅ Scraped: ${courseData.title} [Rating: ${courseData.rate}]`);

            // Stream the course directly if a callback is provided
            if (onCourseScraped) {
                try {
                    await onCourseScraped(courseData);
                } catch (cbErr) {
                    console.error(`[Scraper] onCourseScraped callback error for ${courseData.title}:`, cbErr.message);
                }
            }
        }

        // Small delay between batches to be polite to the server
        await delay(1000);
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
