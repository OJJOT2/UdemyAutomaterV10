const scraper = require('./src/scraper');

async function test() {
    console.log("Testing scraper independently...");
    // Override max courses to 2 for a quick test
    try {
        const results = await scraper.scrapeCourses(2);
        console.log("\nScrape Results:");
        console.log(JSON.stringify(results, null, 2));
    } catch (e) {
        console.error("Test failed:", e);
    }
}

test();
