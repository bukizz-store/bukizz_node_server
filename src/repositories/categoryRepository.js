import { getSupabase, createServiceClient } from "../db/index.js";
import { logger } from "../utils/logger.js";

/**
 * Category Repository
 * Handles all category-related database operations with Supabase
 */
export class CategoryRepository {
    /**
     * Create a new category
     */
    async create(categoryData) {
        try {
            const supabase = getSupabase();

            const categoryPayload = {
                name: categoryData.name,
                slug: categoryData.slug,
                image: categoryData.image || null,
                description: categoryData.description,
                parent_id: categoryData.parentId || null,
                is_active: true,
            };

            const { data: category, error } = await supabase
                .from("categories")
                .insert(categoryPayload)
                .select()
                .single();

            if (error) throw error;

            return this.formatCategory(category);
        } catch (error) {
            logger.error("Error creating category:", error);
            throw error;
        }
    }

    /**
     * Update a category
     */
    async update(categoryId, updateData) {
        try {
            const supabase = getSupabase();

            const updatePayload = {};
            if (updateData.name !== undefined) updatePayload.name = updateData.name;
            if (updateData.slug !== undefined) updatePayload.slug = updateData.slug;
            if (updateData.image !== undefined) updatePayload.image = updateData.image;
            if (updateData.description !== undefined)
                updatePayload.description = updateData.description;
            if (updateData.parentId !== undefined)
                updatePayload.parent_id = updateData.parentId;
            if (updateData.isActive !== undefined)
                updatePayload.is_active = updateData.isActive;

            if (Object.keys(updatePayload).length === 0) {
                return this.findById(categoryId);
            }

            const { data: category, error } = await supabase
                .from("categories")
                .update(updatePayload)
                .eq("id", categoryId)
                .select()
                .single();

            if (error) throw error;

            return this.formatCategory(category);
        } catch (error) {
            logger.error("Error updating category:", error);
            throw error;
        }
    }

    /**
     * Delete a category (soft delete)
     */
    async delete(categoryId) {
        try {
            const supabase = getSupabase();

            const { error } = await supabase
                .from("categories")
                .update({ is_active: false })
                .eq("id", categoryId);

            if (error) throw error;

            return true;
        } catch (error) {
            logger.error("Error deleting category:", error);
            throw error;
        }
    }

    /**
     * Find category by ID
     */
    async findById(categoryId) {
        try {
            const supabase = getSupabase();

            const { data: category, error } = await supabase
                .from("categories")
                .select(`
          *,
          parent:categories!parent_id(id, name, slug)
        `)
                .eq("id", categoryId)
                .eq("is_active", true)
                .single();

            if (error) {
                // Return null if not found
                if (error.code === "PGRST116") return null;
                throw error;
            }

            return this.formatCategory(category);
        } catch (error) {
            logger.error("Error finding category by ID:", error);
            throw error;
        }
    }

    /**
     * Find category by slug
     */
    async findBySlug(slug) {
        try {
            const supabase = getSupabase();

            const { data: category, error } = await supabase
                .from("categories")
                .select("*")
                .eq("slug", slug)
                .eq("is_active", true)
                .single();

            if (error) {
                if (error.code === "PGRST116") return null;
                throw error;
            }

            return this.formatCategory(category);
        } catch (error) {
            logger.error("Error finding category by slug:", error);
            throw error;
        }
    }

    /**
     * Search/List categories
     */
    async search(filters) {
        try {
            const supabase = getSupabase();

            let query = supabase.from("categories").select(`
          *,
          parent:categories!parent_id(id, name, slug),
          children:categories!parent_id(id, name, slug, description)
      `, { count: "exact" });

            query = query.eq("is_active", true);

            if (filters.search) {
                query = query.or(`name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
            }

            if (filters.parentId) {
                query = query.eq("parent_id", filters.parentId);
            } else if (filters.rootOnly === "true" || filters.rootOnly === true) {
                query = query.is("parent_id", null);
            }

            // Sorting
            const sortBy = filters.sortBy || "name";
            const sortOrder = filters.sortOrder === "desc" ? false : true; // default asc

            // Handle snake_case mapping for sort
            const sortFieldMap = {
                name: "name",
                createdAt: "created_at"
            };

            query = query.order(sortFieldMap[sortBy] || sortBy, { ascending: sortOrder });

            // Pagination
            const page = Math.max(1, parseInt(filters.page) || 1);
            const limit = Math.min(100, Math.max(1, parseInt(filters.limit) || 20));
            const offset = (page - 1) * limit;

            query = query.range(offset, offset + limit - 1);

            const { data: categories, count, error } = await query;

            if (error) throw error;

            return {
                categories: (categories || []).map(c => this.formatCategory(c)),
                pagination: {
                    page,
                    limit,
                    total: count || 0,
                    totalPages: Math.ceil((count || 0) / limit),
                },
            };
        } catch (error) {
            logger.error("Error searching categories:", error);
            throw error;
        }
    }

    /**
     * Format category object
     */
    formatCategory(row) {
        if (!row) return null;

        return {
            id: row.id,
            name: row.name,
            slug: row.slug,
            image: row.image,
            description: row.description,
            parentId: row.parent_id,
            parent: row.parent ? {
                id: row.parent.id,
                name: row.parent.name,
                slug: row.parent.slug
            } : null,
            children: Array.isArray(row.children) ? row.children.map(c => ({
                id: c.id,
                name: c.name,
                slug: c.slug,
                description: c.description
            })) : [],
            isActive: row.is_active,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
    /**
     * Upload category image to Supabase Storage
     */
    async uploadImage(file) {
        try {
            const fileName = `categories/${Date.now()}-${file.originalname}`;

            // Use Service Client to bypass RLS policies for admin uploads
            const supabase = createServiceClient();

            const { data, error } = await supabase.storage
                .from("categories")
                .upload(fileName, file.buffer, {
                    contentType: file.mimetype,
                    upsert: true,
                });

            if (error) throw error;

            const {
                data: { publicUrl },
            } = this.supabase.storage.from("categories").getPublicUrl(fileName);

            return publicUrl;
        } catch (error) {
            logger.error("Error uploading category image:", error);
            throw error;
        }
    }
}

export default new CategoryRepository();
