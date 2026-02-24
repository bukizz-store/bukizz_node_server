import { createDependencies } from "./src/config/dependencies.js";
const deps = createDependencies();
console.log(
  "ledgerRepository defined in settlementService:",
  !!deps.settlementService.ledgerRepository,
);
console.log(
  "getDashboardSummary type:",
  typeof deps.settlementService.ledgerRepository?.getDashboardSummary,
);
