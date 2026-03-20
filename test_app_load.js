import { createDependencies } from "./src/config/dependencies.js";
import { setupRoutes } from "./src/routes/index.js";
import express from "express";

async function verify() {
  try {
    const app = express();
    const deps = createDependencies();
    setupRoutes(app, deps);
    console.log("App loaded successfully!");
    process.exit(0);
  } catch (error) {
    console.error("App failed to load:", error);
    process.exit(1);
  }
}

verify();
