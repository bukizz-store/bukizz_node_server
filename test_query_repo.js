const { getSupabase } = require('./src/db/index.js');
const OrderQueryRepository = require('./src/Repositories/orderQueryRepository.js');

(async () => {
    try {
        const supabase = getSupabase();
        const repo = new OrderQueryRepository(supabase);
        
        // Fetch one query to test
        const { data } = await supabase.from('order_queries').select('*').limit(1);
        
        if (data && data.length > 0) {
            console.log("=== LIST API ===");
            const res = await repo.adminFindAll({limit: 1});
            console.log(JSON.stringify(res.queries[0].order, null, 2));
            
            console.log("\n=== DETAILED API ===");
            const res2 = await repo.adminFindByIdDetailed(data[0].id);
            console.log(JSON.stringify(res2.order, null, 2));
        } else {
            console.log('No order queries found.');
        }
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
})();
