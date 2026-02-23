import { create } from 'xmlbuilder2';
import fs from 'fs';
import path from 'path';
import { getSupabase } from '../db/index.js';
import { logger } from './logger.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function generateSitemap() {
    try {
        logger.info("Starting sitemap generation...");
        const supabase = getSupabase();

        // Standard domain, adjust as need for different environments
        const baseUrl = "https://www.bukizz.in";

        const root = create({ version: '1.0', encoding: 'UTF-8' })
            .ele('urlset', { xmlns: 'http://www.sitemaps.org/schemas/sitemap/0.9' });

        const staticRoutes = ['/', '/school', '/cart', '/products', '/contact-us', '/payment-policy', '/shipping-policy', '/cancellation-refund', '/terms-of-use', '/privacy-policy'];
        for (const route of staticRoutes) {
            root.ele('url')
                .ele('loc').txt(`${baseUrl}${route}`).up()
                .ele('changefreq').txt('daily').up()
                .ele('priority').txt(route === '/' ? '1.0' : '0.8').up();
        }

        const { data: products, error: pError } = await supabase
            .from('products')
            .select('id, updated_at')
            .eq('is_deleted', false);

        if (!pError && products) {
            for (const product of products) {
                root.ele('url')
                    .ele('loc').txt(`${baseUrl}/product/${product.id}`).up()
                    .ele('changefreq').txt('weekly').up()
                    .ele('lastmod').txt(new Date(product.updated_at || Date.now()).toISOString()).up()
                    .ele('priority').txt('0.9').up();
            }
        }

        const { data: schools, error: sError } = await supabase
            .from('schools')
            .select('id, updated_at');

        if (!sError && schools) {
            for (const school of schools) {
                root.ele('url')
                    .ele('loc').txt(`${baseUrl}/school/${school.id}`).up()
                    .ele('changefreq').txt('weekly').up()
                    .ele('priority').txt('0.8').up();
            }
        }

        const { data: categories, error: cError } = await supabase
            .from('categories')
            .select('slug');

        if (!cError && categories) {
            for (const cat of categories) {
                if (cat.slug) {
                    root.ele('url')
                        .ele('loc').txt(`${baseUrl}/category?categorySlug=${cat.slug}`).up()
                        .ele('changefreq').txt('weekly').up()
                        .ele('priority').txt('0.7').up();
                }
            }
        }

        const xml = root.end({ prettyPrint: true });

        // Save to various folders to ensure it's accessible
        const serverPublicPath = path.join(__dirname, '../../public/sitemap.xml');
        const frontendPublicPath = path.join(__dirname, '../../../public/sitemap.xml');
        const frontendBuildPath = path.join(__dirname, '../../../build/sitemap.xml');

        const writeXml = (filePath) => {
            try {
                const dir = path.dirname(filePath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                fs.writeFileSync(filePath, xml);
            } catch (err) {
                logger.error(`Failed to write sitemap to ${filePath}:`, err);
            }
        };

        writeXml(serverPublicPath);
        writeXml(frontendPublicPath);

        // Write to build folder if it exists
        if (fs.existsSync(path.dirname(frontendBuildPath))) {
            writeXml(frontendBuildPath);
        }

        logger.info(`Sitemap generated successfully with ${staticRoutes.length + (products?.length || 0) + (schools?.length || 0) + (categories?.length || 0)} URLs`);

    } catch (err) {
        logger.error("Error generating sitemap:", err);
    }
}
