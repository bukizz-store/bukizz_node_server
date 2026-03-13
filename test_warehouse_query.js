import 'dotenv/config'; // Make sure process.env is populated
import warehouseRepository from './src/repositories/warehouseRepository.js';

async function test() {
  try {
    const data = await warehouseRepository.getWarehousesWithShippedOrders(null);
    console.log(JSON.stringify(data, null, 2));
  } catch(e) {
    console.error(e);
  }
}
test();
