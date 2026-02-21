import cron from 'node-cron';
import { generateSitemap } from '../utils/sitemapGenerator.js';
import { logger } from '../utils/logger.js';

export function setupCronJobs() {
    logger.info("Setting up CRON jobs...");

    // Run every day at midnight
    cron.schedule('0 0 * * *', async () => {
        logger.info("Executing daily sitemap generation cron job...");
        await generateSitemap();
    });

    // Also run once immediately on startup asynchronously
    generateSitemap().catch(e => logger.error("Startup sitemap generation failed:", e));
}
