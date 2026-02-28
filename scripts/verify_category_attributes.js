import { createClient } from "@supabase/supabase-js";
import { config } from "../src/config/index.js";
import CategoryRepository from "../src/repositories/categoryRepository.js";
import { logger } from "../src/utils/logger.js";
import { getSupabase } from "../src/db/index.js";

// Mock config if needed or ensure environment variables are loaded
// Assuming this script is run with `node -r dotenv/config server/scripts/verify_category_attributes.js`

async function verifyCategoryAttributes() {
    console.log("Starting verification...");

    try {
        // 1. Create a category with product_attributes
        const testData = {
            name: "Test Attribute Category " + Date.now(),
            slug: "test-attr-cat-" + Date.now(),
            description: "Test category for product attributes",
            productAttributes: {
                material: "cotton",
                size: ["S", "M", "L"],
                care_instructions: {
                    wash: "cold",
                    dry: "low"
                }
            }
        };

        console.log("Creating category...");
        const createdCategory = await CategoryRepository.create(testData);
        console.log("Created Category:", JSON.stringify(createdCategory, null, 2));

        if (!createdCategory.productAttributes || createdCategory.productAttributes.material !== "cotton") {
            throw new Error("Product attributes not saved correctly during creation.");
        }

        // 2. Update the category attributes
        const updateData = {
            productAttributes: {
                material: "polyester",
                size: ["L", "XL"],
                new_field: "added"
            }
        };

        console.log("Updating category...");
        const updatedCategory = await CategoryRepository.update(createdCategory.id, updateData);
        console.log("Updated Category:", JSON.stringify(updatedCategory, null, 2));

        if (updatedCategory.productAttributes.material !== "polyester") {
            throw new Error("Product attributes not updated correctly.");
        }

        // 3. Clean up
        console.log("Cleaning up...");
        await CategoryRepository.delete(createdCategory.id);
        console.log("Category deleted.");

        console.log("Verification SUCCESSFUL!");
    } catch (error) {
        console.error("Verification FAILED:", error);
    } finally {
        // Close connection? internal pool management
        process.exit(0);
    }
}

// Ensure remote DB connection is initialized
import { connectDB } from "../src/db/index.js";
connectDB().then(() => {
    verifyCategoryAttributes();
});
