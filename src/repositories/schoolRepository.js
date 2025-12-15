import { getSupabase } from "../db/index.js";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../utils/logger.js";

/**
 * School Repository
 * Handles all school-related database operations using Supabase
 */
export class SchoolRepository {
  constructor() {
    this.supabase = getSupabase();
  }

  /**
   * Create a new school
   * @param {Object} schoolData - School data object
   * @returns {Promise<Object>} Created school
   */
  async create(schoolData) {
    try {
      const {
        name,
        type,
        board,
        address,
        city,
        state,
        country,
        postalCode,
        contact,
        phone,
        email,
      } = schoolData;
      const schoolId = uuidv4();

      const { data, error } = await this.supabase
        .from("schools")
        .insert([
          {
            id: schoolId,
            name: name.trim(),
            type,
            board,
            address: JSON.stringify(address),
            city: city.trim(),
            state: state.trim(),
            country: country || "India",
            postal_code: postalCode,
            contact: JSON.stringify(contact || {}),
            phone: phone || null,
            email: email || null,
            is_active: true,
            created_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (error) throw error;

      return this._formatSchool(data);
    } catch (error) {
      logger.error("Error creating school:", error);
      throw error;
    }
  }

  /**
   * Find school by ID
   * @param {string} schoolId - School ID
   * @returns {Promise<Object|null>} School object or null
   */
  async findById(schoolId) {
    try {
      const { data, error } = await this.supabase
        .from("schools")
        .select("*")
        .eq("id", schoolId)
        .eq("is_active", true)
        .single();

      if (error) {
        if (error.code === "PGRST116") return null; // Not found
        throw error;
      }

      return this._formatSchool(data);
    } catch (error) {
      logger.error("Error finding school by ID:", error);
      throw error;
    }
  }

  /**
   * Find school by name and city
   * @param {string} name - School name
   * @param {string} city - City name
   * @returns {Promise<Object|null>} School object or null
   */
  async findByNameAndCity(name, city) {
    try {
      const { data, error } = await this.supabase
        .from("schools")
        .select("*")
        .ilike("name", name.trim())
        .ilike("city", city.trim())
        .eq("is_active", true)
        .single();

      if (error) {
        if (error.code === "PGRST116") return null; // Not found
        throw error;
      }

      return this._formatSchool(data);
    } catch (error) {
      logger.error("Error finding school by name and city:", error);
      throw error;
    }
  }

  /**
   * Search schools with filters
   * @param {Object} filters - Search filters
   * @returns {Promise<Object>} Search results with pagination
   */
  async search(filters) {
    try {
      const {
        page = 1,
        limit = 20,
        search,
        city,
        state,
        type,
        board,
        sortBy = "name",
        sortOrder = "asc",
      } = filters;

      // Validate pagination parameters
      const validPage = Math.max(1, parseInt(page));
      const validLimit = Math.min(Math.max(1, parseInt(limit)), 100); // Cap at 100
      const offset = (validPage - 1) * validLimit;

      let query = this.supabase
        .from("schools")
        .select("*", { count: "exact" })
        .eq("is_active", true);

      // Apply search filter (escape special characters)
      if (search && search.trim()) {
        const searchTerm = search.trim().replace(/[%_]/g, "\\$&");
        query = query.or(
          `name.ilike.%${searchTerm}%,city.ilike.%${searchTerm}%,state.ilike.%${searchTerm}%`
        );
      }

      // Apply additional filters (only if search is not provided or as additional constraints)
      if (city && city.trim()) {
        const cityTerm = city.trim().replace(/[%_]/g, "\\$&");
        query = query.ilike("city", `%${cityTerm}%`);
      }

      if (state && state.trim()) {
        const stateTerm = state.trim().replace(/[%_]/g, "\\$&");
        query = query.ilike("state", `%${stateTerm}%`);
      }

      if (type) {
        query = query.eq("type", type);
      }

      if (board) {
        query = query.eq("board", board.toUpperCase());
      }

      // Apply sorting with validation
      const validSortBy = [
        "created_at",
        "name",
        "city",
        "state",
        "type",
      ].includes(sortBy)
        ? sortBy
        : "name";
      const validSortOrder = sortOrder.toLowerCase() === "desc";

      query = query.order(validSortBy, { ascending: !validSortOrder });

      // Apply pagination
      query = query.range(offset, offset + validLimit - 1);

      const { data, error, count } = await query;

      if (error) throw error;

      const schools = (data || []).map((row) => this._formatSchool(row));
      const totalCount = count || 0;
      const totalPages = Math.ceil(totalCount / validLimit);

      return {
        schools,
        pagination: {
          page: validPage,
          limit: validLimit,
          total: totalCount,
          totalPages,
          hasNext: validPage < totalPages,
          hasPrev: validPage > 1,
        },
      };
    } catch (error) {
      logger.error("Error searching schools:", error);
      throw error;
    }
  }

  /**
   * Update school
   * @param {string} schoolId - School ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object>} Updated school
   */
  async update(schoolId, updateData) {
    try {
      const updates = {};

      if (updateData.name !== undefined) {
        updates.name = updateData.name.trim();
      }
      if (updateData.type !== undefined) {
        updates.type = updateData.type;
      }
      if (updateData.board !== undefined) {
        updates.board = updateData.board;
      }
      if (updateData.address !== undefined) {
        updates.address = JSON.stringify(updateData.address);
        updates.city = updateData.address.city;
        updates.state = updateData.address.state;
        updates.postal_code = updateData.address.postalCode;
      }
      if (updateData.city !== undefined) {
        updates.city = updateData.city.trim();
      }
      if (updateData.state !== undefined) {
        updates.state = updateData.state.trim();
      }
      if (updateData.country !== undefined) {
        updates.country = updateData.country;
      }
      if (updateData.postalCode !== undefined) {
        updates.postal_code = updateData.postalCode;
      }
      if (updateData.contact !== undefined) {
        updates.contact = JSON.stringify(updateData.contact);
      }
      if (updateData.phone !== undefined) {
        updates.phone = updateData.phone;
      }
      if (updateData.email !== undefined) {
        updates.email = updateData.email;
      }
      if (updateData.isActive !== undefined) {
        updates.is_active = updateData.isActive;
      }

      if (Object.keys(updates).length === 0) {
        return this.findById(schoolId);
      }

      updates.updated_at = new Date().toISOString();

      const { data, error } = await this.supabase
        .from("schools")
        .update(updates)
        .eq("id", schoolId)
        .select()
        .single();

      if (error) throw error;

      return this._formatSchool(data);
    } catch (error) {
      logger.error("Error updating school:", error);
      throw error;
    }
  }

  /**
   * Get schools by city
   * @param {string} city - City name
   * @returns {Promise<Array>} Array of schools
   */
  async getByCity(city) {
    try {
      const { data, error } = await this.supabase
        .from("schools")
        .select("*")
        .ilike("city", city)
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (error) throw error;

      return (data || []).map(this._formatSchool);
    } catch (error) {
      logger.error("Error getting schools by city:", error);
      throw error;
    }
  }

  /**
   * Associate product with school
   * @param {string} productId - Product ID
   * @param {string} schoolId - School ID
   * @param {Object} associationData - Association data with grade and mandatory info
   * @returns {Promise<Object>} Created association
   */
  async associateProduct(productId, schoolId, associationData) {
    try {
      const { grade, mandatory = false } = associationData;

      const { data, error } = await this.supabase
        .from("product_schools")
        .upsert({
          product_id: productId,
          school_id: schoolId,
          grade,
          mandatory,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      return data;
    } catch (error) {
      logger.error("Error associating product with school:", error);
      throw error;
    }
  }

  /**
   * Get product association
   * @param {string} productId - Product ID
   * @param {string} schoolId - School ID
   * @param {string} grade - Grade level
   * @returns {Promise<Object|null>} Association or null
   */
  async getProductAssociation(productId, schoolId, grade) {
    try {
      const { data, error } = await this.supabase
        .from("product_schools")
        .select("*")
        .eq("product_id", productId)
        .eq("school_id", schoolId)
        .eq("grade", grade)
        .single();

      if (error) {
        if (error.code === "PGRST116") return null; // Not found
        throw error;
      }

      return data;
    } catch (error) {
      logger.error("Error getting product association:", error);
      throw error;
    }
  }

  /**
   * Update product association
   * @param {string} productId - Product ID
   * @param {string} schoolId - School ID
   * @param {string} grade - Grade level
   * @param {Object} updateData - Update data
   * @returns {Promise<Object>} Updated association
   */
  async updateProductAssociation(productId, schoolId, grade, updateData) {
    try {
      const { data, error } = await this.supabase
        .from("product_schools")
        .update({
          ...updateData,
          updated_at: new Date().toISOString(),
        })
        .eq("product_id", productId)
        .eq("school_id", schoolId)
        .eq("grade", grade)
        .select()
        .single();

      if (error) throw error;

      return data;
    } catch (error) {
      logger.error("Error updating product association:", error);
      throw error;
    }
  }

  /**
   * Remove product association with school
   * @param {string} productId - Product ID
   * @param {string} schoolId - School ID
   * @param {string} grade - Grade level (optional)
   * @returns {Promise<boolean>} Success status
   */
  async removeProductAssociation(productId, schoolId, grade = null) {
    try {
      let query = this.supabase
        .from("product_schools")
        .delete()
        .eq("product_id", productId)
        .eq("school_id", schoolId);

      if (grade) {
        query = query.eq("grade", grade);
      }

      const { error } = await query;

      if (error) throw error;

      return true;
    } catch (error) {
      logger.error("Error removing product association:", error);
      throw error;
    }
  }

  /**
   * Get school products
   * @param {string} schoolId - School ID
   * @returns {Promise<Array>} Array of products
   */
  async getSchoolProducts(schoolId) {
    try {
      const { data, error } = await this.supabase
        .from("product_schools")
        .select(
          `
          grade,
          mandatory,
          products!inner(*)
        `
        )
        .eq("school_id", schoolId)
        .eq("products.is_active", true);

      if (error) throw error;

      return (data || []).map((item) => ({
        ...item.products,
        schoolInfo: {
          grade: item.grade,
          mandatory: item.mandatory,
        },
      }));
    } catch (error) {
      logger.error("Error getting school products:", error);
      throw error;
    }
  }

  /**
   * Get school analytics
   * @param {string} schoolId - School ID
   * @returns {Promise<Object>} Analytics data
   */
  async getSchoolAnalytics(schoolId) {
    try {
      // This would include various analytics queries
      const analytics = {
        totalProducts: 0,
        totalStudents: 0,
        totalOrders: 0,
        // Add more analytics as needed
      };

      return analytics;
    } catch (error) {
      logger.error("Error getting school analytics:", error);
      throw error;
    }
  }

  /**
   * Get school partnerships
   * @param {string} schoolId - School ID
   * @returns {Promise<Array>} Array of partnerships
   */
  async getSchoolPartnerships(schoolId) {
    try {
      // This would query partnerships table when implemented
      return [];
    } catch (error) {
      logger.error("Error getting school partnerships:", error);
      throw error;
    }
  }

  /**
   * Get nearby schools using geolocation
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @param {number} radiusKm - Radius in kilometers
   * @param {Object} filters - Additional filters
   * @returns {Promise<Array>} Array of nearby schools
   */
  async findNearby(lat, lng, radiusKm, filters = {}) {
    try {
      // For now, return schools from same city/state as geospatial queries need PostGIS
      const { data, error } = await this.supabase
        .from("schools")
        .select("*")
        .eq("is_active", true)
        .limit(filters.limit || 20);

      if (error) throw error;

      return (data || []).map(this._formatSchool);
    } catch (error) {
      logger.error("Error finding nearby schools:", error);
      throw error;
    }
  }

  /**
   * Get popular schools
   * @param {number} limit - Number of schools to return
   * @param {string} city - City filter
   * @returns {Promise<Array>} Array of popular schools
   */
  async getPopularSchools(limit = 10, city = null) {
    try {
      let query = this.supabase
        .from("schools")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (city) {
        query = query.ilike("city", city);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map(this._formatSchool);
    } catch (error) {
      logger.error("Error getting popular schools:", error);
      throw error;
    }
  }

  /**
   * Get school catalog with products and pricing
   * @param {string} schoolId - School ID
   * @param {Object} filters - Catalog filters
   * @returns {Promise<Object>} Catalog with products
   */
// Assumes `this.supabase` is a configured supabase-js client instance
// and `logger` is available in this scope (or change to console).

async getSchoolCatalog(schoolId, filters = {}) {
  // Helper: Validate UUID v4 (case-insensitive)
  const isUUID = (s) =>
    typeof s === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

  try {
    if (!isUUID(schoolId)) {
      const err = new Error("Invalid schoolId (not a UUID)");
      err.status = 400;
      throw err;
    }

    // --- Parse & normalize filters ---
    const {
      page = 1,
      limit = 20,
      grade = null,
      mandatory = null,
      category = null, // category id or slug (we treat as id if UUID)
      productType = null, // alias for category if used
      priceMin = null,
      priceMax = null,
      search = null,
      sortBy = "name",
      sortOrder = "asc",
      onlyAvailable = false,
    } = filters;

    const filterCategory = category || productType || null;
    const validPage = Math.max(1, Number.parseInt(page, 10) || 1);
    const validLimit = Math.min(Math.max(1, Number.parseInt(limit, 10) || 1), 200);
    const offset = (validPage - 1) * validLimit;
    const isDescending = String(sortOrder || "asc").toLowerCase() === "desc";

    // Mapping of UI sort keys to how we'll sort (some done DB-side, some in-memory)
    const sortKeyMap = {
      name: "title", // product.title
      price: "min_price",
      category: "category",
      created_at: "created_at",
      grade: "grade",
      mandatory: "mandatory",
    };
    const mappedSortBy = sortKeyMap[sortBy] || "title";

    // --- 1) Fetch product_schools rows joined with products (server-side join)
    // We rely on Supabase relationship: product_schools -> products (named 'products').
    // Request exact count for pagination.
    let baseQuery = this.supabase
      .from("product_schools")
      .select(
        `
        grade,
        mandatory,
        products!inner(
          id,
          sku,
          title,
          description,
          base_price,
          currency,
          product_type,
          is_active,
          created_at,
          updated_at
        )
      `,
        { count: "exact" }
      )
      .eq("school_id", schoolId)
      .eq("products.is_active", true);

    // grade filter (product_schools.grade)
    // if (grade && String(grade).trim()) baseQuery = baseQuery.eq("grade", String(grade).trim());

    // mandatory filter (product_schools.mandatory)
    if (mandatory !== null && mandatory !== undefined) baseQuery = baseQuery.eq("mandatory", !!mandatory);

    // product-level price filtering (on products.base_price)
    if (priceMin !== null && priceMin !== undefined && !Number.isNaN(Number(priceMin)))
      baseQuery = baseQuery.gte("products.base_price", Number(priceMin));
    if (priceMax !== null && priceMax !== undefined && !Number.isNaN(Number(priceMax)))
      baseQuery = baseQuery.lte("products.base_price", Number(priceMax));

    // search on product title/description (use ilike)
    if (search && String(search).trim()) {
      const term = String(search).trim().replace(/[%_]/g, "\\$&");
      // Supabase .or(...) syntax takes comma-separated conditions
      baseQuery = baseQuery.or(`products.title.ilike.%${term}%,products.description.ilike.%${term}%`);
    }

    // Attempt some DB ordering where possible (grade/mandatory can be sorted DB-side)
    let dbOrderAttempted = false;
    try {
      if (mappedSortBy === "grade" || mappedSortBy === "mandatory") {
        baseQuery = baseQuery.order(mappedSortBy, { ascending: !isDescending });
        dbOrderAttempted = true;
      } else if (mappedSortBy === "title" || mappedSortBy === "created_at") {
        // sort by product fields (via foreign table)
        baseQuery = baseQuery.order(mappedSortBy, { foreignTable: "products", ascending: !isDescending });
        dbOrderAttempted = true;
      } else {
        dbOrderAttempted = false;
      }
    } catch (err) {
      // ordering by foreignTable sometimes throws; fallback to in-memory
      dbOrderAttempted = false;
    }

    baseQuery = baseQuery.range(offset, offset + validLimit - 1);
    const { data: baseRows, error: baseErr, count } = await baseQuery;
    if (baseErr) {
      logger?.error("Supabase: failed fetching product_schools + products", baseErr);
      throw baseErr;
    }

    const schoolRows = baseRows || [];
    const totalCountFromDB = Number.isFinite(count) ? count : null;

    // If no products found, return early with pagination metadata
    if (schoolRows.length === 0) {
      const totalCount = totalCountFromDB ?? 0;
      const totalPages = Math.ceil(totalCount / validLimit || 0);
      return {
        schoolId,
        products: [],
        pagination: {
          page: validPage,
          limit: validLimit,
          total: totalCount,
          totalPages,
          hasNext: totalPages ? validPage < totalPages : false,
          hasPrev: validPage > 1,
        },
        filters: { grade, mandatory, category: filterCategory, priceMin, priceMax, search, sortBy, sortOrder, onlyAvailable },
        meta: {
          appliedFilters: {
            hasGradeFilter: !!grade,
            hasMandatoryFilter: mandatory !== null && mandatory !== undefined,
            hasCategoryFilter: !!filterCategory,
            hasPriceFilter: priceMin !== null || priceMax !== null,
            hasSearchFilter: !!search,
            hasOnlyAvailable: !!onlyAvailable,
          },
        },
      };
    }

    // --- Build product map & ids list
    const productMap = new Map();
    const productIds = [];
    for (const row of schoolRows) {
      const prod = row.products;
      productMap.set(prod.id, {
        id: prod.id,
        sku: prod.sku || null,
        title: prod.title,
        description: prod.description || null,
        base_price: Number(prod.base_price ?? 0),
        currency: prod.currency ?? "INR",
        product_type: prod.product_type ?? null,
        primary_image: prod.image_url ?? null,
        variants: [],
        min_price: null,
        schoolInfo: { grade: row.grade, mandatory: !!row.mandatory },
        created_at: prod.created_at,
        updated_at: prod.updated_at,
      });
      productIds.push(prod.id);
    }

    // --- 2) Fetch variants for these products (bulk)
    let variantQuery = this.supabase
      .from("product_variants")
      .select("id, product_id, sku, price, stock, option_value_1, option_value_2, option_value_3");

      // console.log({productIds});


    // Avoid calling .in() with empty array (Supabase error). productIds is non-empty here.
    variantQuery = variantQuery.in("product_id", productIds);

    const { data: variantRows, error: variantErr } = await variantQuery;
    if (variantErr) {
      logger?.error("Supabase: failed fetching product_variants", variantErr);
      throw variantErr;
    }
    const allVariants = variantRows || [];
    // Optionally keep only available variants
    const variants = onlyAvailable ? allVariants.filter((v) => Number(v.stock) > 0) : allVariants;

    // --- 3) Collect option_value ids present and bulk fetch them
    const optionValueIdsSet = new Set();
    for (const v of variants) {
      if (v.option_value_1) optionValueIdsSet.add(v.option_value_1);
      if (v.option_value_2) optionValueIdsSet.add(v.option_value_2);
      if (v.option_value_3) optionValueIdsSet.add(v.option_value_3);
    }
    const optionValueIds = Array.from(optionValueIdsSet);

    // Bulk fetch option values (includes price_modifier or price if you added)
    let optionValues = [];
    if (optionValueIds.length > 0) {
      const { data: ovData, error: ovErr } = await this.supabase
        .from("product_option_values")
        .select("id, value, attribute_id, price_modifier")
        .in("id", optionValueIds);

      if (ovErr) {
        logger?.error("Supabase: failed fetching product_option_values", ovErr);
        throw ovErr;
      }
      optionValues = ovData || [];
    }
    const optionValueMap = new Map(optionValues.map((o) => [o.id, o]));

    // --- 4) Fetch attributes used by those option values
    const attributeIds = Array.from(new Set(optionValues.map((o) => o.attribute_id).filter(Boolean)));
    let attributes = [];
    if (attributeIds.length > 0) {
      const { data: attrData, error: attrErr } = await this.supabase
        .from("product_option_attributes")
        .select("id, name, position")
        .in("id", attributeIds);

      if (attrErr) {
        logger?.error("Supabase: failed fetching product_option_attributes", attrErr);
        throw attrErr;
      }
      attributes = attrData || [];
    }
    const attributeMap = new Map(attributes.map((a) => [a.id, a]));

    // --- 5) Fetch categories (product_categories -> categories) and brands in bulk
    // categories
    let pcData = [];
    if (productIds.length > 0) {
      const { data: _pcData, error: pcErr } = await this.supabase
        .from("product_categories")
        .select("product_id, categories(id, name)")
        .in("product_id", productIds);
      if (pcErr) {
        logger?.error("Supabase: failed fetching product_categories", pcErr);
        throw pcErr;
      }
      pcData = _pcData || [];
    }
    const categoriesMap = new Map();
    for (const r of pcData) {
      const pid = r.product_id;
      const cat = r.categories;
      if (!categoriesMap.has(pid)) categoriesMap.set(pid, []);
      if (cat) categoriesMap.get(pid).push({ id: cat.id, name: cat.name });
    }

    // brands
    let pbData = [];
    if (productIds.length > 0) {
      const { data: _pbData, error: pbErr } = await this.supabase
        .from("product_brands")
        .select("product_id, brands(id, name)")
        .in("product_id", productIds);
      if (pbErr) {
        logger?.error("Supabase: failed fetching product_brands", pbErr);
        throw pbErr;
      }
      pbData = _pbData || [];
    }
    const brandsMap = new Map();
    for (const r of pbData) {
      const pid = r.product_id;
      const b = r.brands;
      if (!brandsMap.has(pid)) brandsMap.set(pid, []);
      if (b) brandsMap.get(pid).push({ id: b.id, name: b.name });
    }

    // images (optional: primary image fallback)
    let piData = [];
    if (productIds.length > 0) {
      const { data: _piData, error: piErr } = await this.supabase
        .from("product_images")
        .select("product_id, url, is_primary")
        .in("product_id", productIds);
      if (piErr) {
        logger?.error("Supabase: failed fetching product_images", piErr);
        throw piErr;
      }
      piData = _piData || [];
    }
    const imagesMap = new Map();
    for (const r of piData) {
      const pid = r.product_id;
      if (!imagesMap.has(pid)) imagesMap.set(pid, []);
      imagesMap.get(pid).push(r);
    }

    // --- 6) Assemble variants into productMap and compute final price per variant
    for (const v of variants) {
      const product = productMap.get(v.product_id);
      if (!product) continue; // variant for product outside our page (shouldn't happen)

      // Build option list and sum modifiers
      const optionList = [];
      let optionModifiersSum = 0;
      const optionIds = [v.option_value_1, v.option_value_2, v.option_value_3];

      for (const optId of optionIds) {
        if (!optId) continue;
        const ov = optionValueMap.get(optId);
        if (!ov) continue;
        const attr = attributeMap.get(ov.attribute_id) || {};
        const modifier = Number(ov.price_modifier ?? ov.price ?? 0);
        optionModifiersSum += modifier;
        optionList.push({
          attribute_id: ov.attribute_id,
          attribute_name: attr.name ?? null,
          option_value_id: ov.id,
          option_value_label: ov.value,
          option_value_price: modifier,
        });
      }

      // Base price for variant (variant.price preferred, fallback to product.base_price)
      const basePrice = v.price !== null && v.price !== undefined ? Number(v.price) : Number(product.base_price || 0);
      const finalPrice = Number((basePrice || 0) + optionModifiersSum);

      const variantObj = {
        variant_id: v.id,
        sku: v.sku || null,
        price: finalPrice,
        base_price: basePrice,
        option_modifier_sum: optionModifiersSum,
        stock: Number(v.stock || 0),
        options: optionList,
      };

      product.variants.push(variantObj);
      if (product.min_price === null || finalPrice < product.min_price) product.min_price = finalPrice;
    }

    // Attach categories, brands, images and finalize products array
    const products = [];
    for (const row of schoolRows) {
      const prod = row.products;
      const pid = prod.id;
      const p = productMap.get(pid);
      if (!p) continue;

      // choose primary image: prefer product.primary_image, otherwise product_images is checked
      let primaryImage = p.primary_image;
      if (!primaryImage) {
        const imgs = imagesMap.get(pid) || [];
        const primary = imgs.find((i) => i.is_primary) || imgs[0];
        primaryImage = primary ? primary.url : null;
      }

      products.push({
        product_id: pid,
        sku: p.sku,
        title: p.title,
        description: p.description,
        product_type: p.product_type,
        base_price: p.base_price,
        currency: p.currency,
        mandatory_for_school: !!row.mandatory,
        primary_image: primaryImage,
        categories: categoriesMap.get(pid) || [],
        brands: brandsMap.get(pid) || [],
        min_price: p.min_price !== null ? Number(p.min_price) : null,
        variants: p.variants,
        schoolInfo: p.schoolInfo,
        created_at: p.created_at,
        updated_at: p.updated_at,
      });
    }

    // --- 7) In-memory sorting when DB ordering wasn't applied or for price/category sorts
    if (!dbOrderAttempted || mappedSortBy === "min_price" || mappedSortBy === "category") {
      const dir = isDescending ? -1 : 1;
      products.sort((a, b) => {
        let aValue, bValue;
        if (mappedSortBy === "min_price" || mappedSortBy === "price") {
          aValue = Number(a.min_price ?? a.base_price ?? 0);
          bValue = Number(b.min_price ?? b.base_price ?? 0);
        } else if (mappedSortBy === "category") {
          aValue = (a.categories?.[0]?.name || "").toLowerCase();
          bValue = (b.categories?.[0]?.name || "").toLowerCase();
        } else if (mappedSortBy === "title") {
          aValue = (a.title || "").toLowerCase();
          bValue = (b.title || "").toLowerCase();
        } else {
          aValue = (a.title || "").toLowerCase();
          bValue = (b.title || "").toLowerCase();
        }

        if (aValue < bValue) return -1 * dir;
        if (aValue > bValue) return 1 * dir;
        return 0;
      });
    }

    // totalCount: use DB-provided count if available, else fallback to products.length
    const totalCount = totalCountFromDB ?? products.length;
    const totalPages = Math.ceil((totalCount || 0) / validLimit);

    return {
      schoolId,
      products,
      pagination: {
        page: validPage,
        limit: validLimit,
        total: totalCount,
        totalPages,
        hasNext: validPage < totalPages,
        hasPrev: validPage > 1,
      },
      filters: {
        grade,
        mandatory,
        category: filterCategory,
        priceMin: priceMin !== null ? Number(priceMin) : null,
        priceMax: priceMax !== null ? Number(priceMax) : null,
        search,
        sortBy,
        sortOrder,
        onlyAvailable,
      },
      meta: {
        appliedFilters: {
          hasGradeFilter: !!grade,
          hasMandatoryFilter: mandatory !== null && mandatory !== undefined,
          hasCategoryFilter: !!filterCategory,
          hasPriceFilter: priceMin !== null || priceMax !== null,
          hasSearchFilter: !!search,
          hasOnlyAvailable: !!onlyAvailable,
        },
      },
    };
  } catch (error) {
    logger?.error("Error getting school catalog:", error);
    if (!error.status) error.status = 500;
    throw error;
  }
}

  
  

  /**
   * Deactivate school (soft delete)
   * @param {string} schoolId - School ID
   * @param {string} reason - Deactivation reason
   * @returns {Promise<boolean>} Success status
   */
  async deactivate(schoolId, reason = null) {
    try {
      const { error } = await this.supabase
        .from("schools")
        .update({
          is_active: false,
          deactivated_at: new Date().toISOString(),
          deactivation_reason: reason,
        })
        .eq("id", schoolId);

      if (error) throw error;

      return true;
    } catch (error) {
      logger.error("Error deactivating school:", error);
      throw error;
    }
  }

  /**
   * Reactivate school
   * @param {string} schoolId - School ID
   * @returns {Promise<boolean>} Success status
   */
  async reactivate(schoolId) {
    try {
      const { error } = await this.supabase
        .from("schools")
        .update({
          is_active: true,
          deactivated_at: null,
          deactivation_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", schoolId);

      if (error) throw error;

      return true;
    } catch (error) {
      logger.error("Error reactivating school:", error);
      throw error;
    }
  }

  /**
   * Format school object for response
   * @param {Object} row - Database row
   * @returns {Object} Formatted school object
   */
  _formatSchool(row) {
    if (!row) return null;

    // Helper function to safely parse JSON fields
    const safeJsonParse = (field, defaultValue = null) => {
      if (!field) return defaultValue;

      // If it's already an object, return it
      if (typeof field === "object") return field;

      // If it's a string that looks like "[object Object]", return default
      if (field === "[object Object]") return defaultValue;

      try {
        return JSON.parse(field);
      } catch (error) {
        logger.warn(`Failed to parse JSON field: ${field}`, error);
        return defaultValue;
      }
    };

    return {
      id: row.id,
      name: row.name,
      type: row.type,
      board: row.board,
      address: safeJsonParse(row.address, null),
      city: row.city,
      state: row.state,
      country: row.country,
      postalCode: row.postal_code,
      contact: safeJsonParse(row.contact, {}),
      phone: row.phone,
      email: row.email,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deactivatedAt: row.deactivated_at,
      deactivationReason: row.deactivation_reason,
    };
  }
}
