import { getSupabase, createServiceClient } from "../db/index.js";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../utils/logger.js";

/**
 * School Inquiry Repository
 * Handles database operations for school lead / partnership queries
 */
export class SchoolInquiryRepository {
  constructor(db = null) {
    this.db = db;
  }

  getSupabase() {
    return this.db?.supabase ? this.db.supabase() : createServiceClient() || getSupabase();
  }

  /**
   * Create a new school inquiry
   * @param {Object} inquiryData
   * @returns {Promise<Object>} Created inquiry
   */
  async create(inquiryData) {
    try {
      const supabase = this.getSupabase();
      const id = uuidv4();

      const insertPayload = {
        id,
        school_name: inquiryData.school_name || inquiryData.schoolName,
        city: inquiryData.city,
        contact_person: inquiryData.contact_person || inquiryData.contactPerson,
        contact_number: inquiryData.contact_number || inquiryData.contactNumber || inquiryData.phone,
        designation: inquiryData.designation || null,
        query: inquiryData.query || null,
        status: "pending",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("school_inquiries")
        .insert([insertPayload])
        .select()
        .single();

      if (error) {
        logger.error("Error inserting school inquiry:", error);
        throw error;
      }

      return data;
    } catch (error) {
      logger.error("SchoolInquiryRepository.create error:", error);
      throw error;
    }
  }

  /**
   * List school inquiries with pagination and filters
   * @param {Object} filters - { page, limit, status, city }
   * @returns {Promise<{ inquiries: Array, total: number, page: number, totalPages: number }>}
   */
  async getInquiries(filters = {}) {
    try {
      const supabase = this.getSupabase();
      const page = Math.max(1, parseInt(filters.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(filters.limit, 10) || 20));
      const offset = (page - 1) * limit;

      let query = supabase
        .from("school_inquiries")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });

      if (filters.status) {
        query = query.eq("status", filters.status);
      }

      if (filters.city) {
        query = query.ilike("city", `%${filters.city}%`);
      }

      query = query.range(offset, offset + limit - 1);

      const { data, count, error } = await query;

      if (error) {
        logger.error("Error querying school inquiries:", error);
        throw error;
      }

      return {
        inquiries: data || [],
        total: count || 0,
        page,
        totalPages: Math.ceil((count || 0) / limit),
      };
    } catch (error) {
      logger.error("SchoolInquiryRepository.getInquiries error:", error);
      throw error;
    }
  }

  /**
   * Update inquiry status
   * @param {string} id
   * @param {string} status
   * @returns {Promise<Object>}
   */
  async updateStatus(id, status) {
    try {
      const supabase = this.getSupabase();
      const { data, error } = await supabase
        .from("school_inquiries")
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        logger.error(`Error updating school inquiry status for ${id}:`, error);
        throw error;
      }

      return data;
    } catch (error) {
      logger.error("SchoolInquiryRepository.updateStatus error:", error);
      throw error;
    }
  }
}

export const schoolInquiryRepository = new SchoolInquiryRepository();
export default schoolInquiryRepository;
