import { getSupabase } from "../db/index.js";
import { bannerSchemas } from "../models/schemas.js";
import { logger } from "../utils/logger.js";

/**
 * Banner Controller
 * Handles banner management operations
 */
export class BannerController {
  constructor() {
    this.supabase = getSupabase();
  }

  /**
   * Create a new banner
   */
  createBanner = async (req, res, next) => {
    try {
      const { error, value } = bannerSchemas.create.validate(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { data, error: dbError } = await this.supabase
        .from("banners")
        .insert({
          cities: value.cities,
          pages: value.pages,
          desktop_image_url: value.desktopImageUrl,
          mobile_image_url: value.mobileImageUrl,
          alt_text: value.altText,
          redirect_url: value.redirectUrl,
          sort_order: value.sortOrder,
          is_active: value.isActive,
        })
        .select()
        .single();

      if (dbError) throw dbError;

      res.status(201).json({
        message: "Banner created successfully",
        banner: data,
      });
    } catch (error) {
      logger.error("Create banner error:", error);
      next(error);
    }
  };

  /**
   * Update a banner
   */
  updateBanner = async (req, res, next) => {
    try {
      const { id } = req.params;
      const { error, value } = bannerSchemas.update.validate(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const updateData = {};
      if (value.cities !== undefined) updateData.cities = value.cities;
      if (value.pages !== undefined) updateData.pages = value.pages;
      if (value.desktopImageUrl !== undefined) updateData.desktop_image_url = value.desktopImageUrl;
      if (value.mobileImageUrl !== undefined) updateData.mobile_image_url = value.mobileImageUrl;
      if (value.altText !== undefined) updateData.alt_text = value.altText;
      if (value.redirectUrl !== undefined) updateData.redirect_url = value.redirectUrl;
      if (value.sortOrder !== undefined) updateData.sort_order = value.sortOrder;
      if (value.isActive !== undefined) updateData.is_active = value.isActive;

      updateData.updated_at = new Date().toISOString();

      const { data, error: dbError } = await this.supabase
        .from("banners")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (dbError) throw dbError;
      if (!data) return res.status(404).json({ error: "Banner not found" });

      res.json({
        message: "Banner updated successfully",
        banner: data,
      });
    } catch (error) {
      logger.error("Update banner error:", error);
      next(error);
    }
  };

  /**
   * Get all banners (Admin query)
   */
  getBanners = async (req, res, next) => {
    try {
      const { error, value } = bannerSchemas.query.validate(req.query);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      let query = this.supabase.from("banners").select("*");

      // For admin queries, we might want to see if the banner includes the requested city/page
      if (value.city) query = query.contains("cities", [value.city]);
      if (value.page) query = query.contains("pages", [value.page]);
      if (value.isActive !== undefined) query = query.eq("is_active", value.isActive);

      const ascending = value.sortOrder === "asc";
      const sortColumn = value.sortBy === "createdAt" ? "created_at" : "sort_order";
      query = query.order(sortColumn, { ascending });

      const { data, error: dbError } = await query;
      if (dbError) throw dbError;

      res.json({
        banners: data,
      });
    } catch (error) {
      logger.error("Get banners error:", error);
      next(error);
    }
  };

  /**
   * Get public active banners
   */
  getPublicBanners = async (req, res, next) => {
    try {
      const { city = "Kanpur", page = "home" } = req.query;
      
      // Support multiple pages separated by commas
      const pages = page.split(',').map(p => p.trim());

      // Fetch all active banners for the cities and pages
      // We'll filter them more precisely in code because building complex cross-array OR logic 
      // in PostgREST/Supabase client is non-trivial without RPC.
      const { data, error: dbError } = await this.supabase
        .from("banners")
        .select("id, cities, pages, desktop_image_url, mobile_image_url, alt_text, redirect_url, sort_order")
        .eq("is_active", true);
        
      if (dbError) throw dbError;

      const filteredBanners = data.filter(banner => {
        // Check if banner belongs to any of the requested pages
        const hasPage = banner.pages.some(p => pages.some(reqP => reqP.toLowerCase() === p.toLowerCase()));
        
        // Check if banner belongs to requested city or 'All'
        const hasCity = banner.cities.some(c => 
          c.toLowerCase() === city.toLowerCase() || 
          c.toLowerCase() === "all"
        );
        
        return hasPage && hasCity;
      }).sort((a, b) => a.sort_order - b.sort_order);

      res.json({
        banners: filteredBanners,
      });
    } catch (error) {
      logger.error("Get public banners error:", error);
      next(error);
    }
  };

  /**
   * Delete a banner
   */
  deleteBanner = async (req, res, next) => {
    try {
      const { id } = req.params;

      const { error: dbError, count } = await this.supabase
        .from("banners")
        .delete()
        .eq("id", id)
        .select();

      if (dbError) throw dbError;
      if (!count || count.length === 0) return res.status(404).json({ error: "Banner not found" });

      res.json({
        message: "Banner deleted successfully",
      });
    } catch (error) {
      logger.error("Delete banner error:", error);
      next(error);
    }
  };
}
