
import { BannerController } from '../src/controllers/bannerController.js';

// Mock Supabase
const mockSupabase = {
    from: () => ({
        select: () => ({
            eq: () => Promise.resolve({
                data: [
                    { id: 1, cities: ['Kanpur'], pages: ['home'], is_active: true, sort_order: 1 },
                    { id: 2, cities: ['Kanpur'], pages: ['order_placed'], is_active: true, sort_order: 2 },
                    { id: 3, cities: ['All'], pages: ['order_confirmation'], is_active: true, sort_order: 3 },
                    { id: 4, cities: ['Lucknow'], pages: ['order_placed'], is_active: true, sort_order: 4 },
                ],
                error: null
            })
        })
    })
};

const controller = new BannerController();
controller.supabase = mockSupabase;

async function test() {
    console.log("Testing multiple pages: order_confirmation,order_placed for Kanpur");
    const req = { query: { city: 'Kanpur', page: 'order_confirmation,order_placed' } };
    const res = { json: (data) => console.log("Result:", JSON.stringify(data.banners.map(b => b.id), null, 2)) };
    const next = (err) => console.error("Error:", err);

    await controller.getPublicBanners(req, res, next);

    console.log("\nTesting single page: home for Kanpur");
    const req2 = { query: { city: 'Kanpur', page: 'home' } };
    const res2 = { json: (data) => console.log("Result:", JSON.stringify(data.banners.map(b => b.id), null, 2)) };
    await controller.getPublicBanners(req2, res2, next);

    console.log("\nTesting 'All' cities for order_confirmation");
    const req3 = { query: { city: 'Lucknow', page: 'order_confirmation' } };
    const res3 = { json: (data) => console.log("Result:", JSON.stringify(data.banners.map(b => b.id), null, 2)) };
    await controller.getPublicBanners(req3, res3, next);
}

test();
