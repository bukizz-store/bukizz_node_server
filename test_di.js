import { createDependencies } from "./src/config/dependencies.js";

async function run() {
  const deps = await createDependencies();
  console.log(
    "ledgerRepository defined in settlementService:",
    !!deps.settlementService.ledgerRepository,
  );
  console.log(
    "getDashboardSummary type:",
    typeof deps.settlementService.ledgerRepository?.getDashboardSummary,
  );
  console.log("accessService defined:", !!deps.accessService);
  process.exit(0);
}

run();
