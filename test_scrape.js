const scraper = require('./src/scraper');
async function test() {
    console.log('Testing scraper...');
    const results = await scraper.scrapeCourses(2, 1, 'all');
    console.log(JSON.stringify(results, null, 2));
}
test();
