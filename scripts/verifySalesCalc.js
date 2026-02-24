
// Mock data and logic from dashboardController.js
const activeStatuses = new Set([
    'initialized',
    'processed',
    'shipped',
    'out_for_delivery',
]);

const allItems = [
    { status: 'initialized', total_price: '100.00' },
    { status: 'processed', total_price: '50.00' },
    { status: 'shipped', total_price: '25.50' },
    { status: 'delivered', total_price: '200.00' }, // Should be excluded
    { status: 'cancelled', total_price: '30.00' },   // Should be excluded
    { status: 'refunded', total_price: '15.00' },    // Should be excluded
];

const totalSales = allItems.reduce(
    (sum, item) => {
        if (activeStatuses.has(item.status)) {
            return sum + parseFloat(item.total_price || 0);
        }
        return sum;
    },
    0,
);

const expectedSales = 100.00 + 50.00 + 25.50;
console.log(`Expected: ${expectedSales}`);
console.log(`Actual: ${totalSales}`);

if (Math.abs(totalSales - expectedSales) < 0.001) {
    console.log('✅ totalSales calculation logic is CORRECT.');
} else {
    console.log('❌ totalSales calculation logic is INCORRECT.');
    process.exit(1);
}
