// backend/utils/query-builder.js
import pool from '../db/index.js';

/**
 * Optimized Query Builder for EMR Database Performance
 * Provides pre-optimized queries for common EMR operations
 * Includes caching, batching, and N+1 query prevention
 */
class QueryBuilder {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Build optimized patient search query with full-text search
   * @param {Object} searchParams - Search parameters
   * @returns {Object} - Query object with SQL and parameters
   */
  buildPatientSearchQuery(searchParams = {}) {
    const {
      search,
      limit = 100,
      offset = 0,
      includeProvider = false,
      includeInsurance = false,
      includeVitals = false,
      dateFrom,
      dateTo,
      providerId,
      mrn
    } = searchParams;

    let selectFields = `
      p.id, p.first_name, p.last_name, p.dob, p.insurance_id, 
      p.provider_id, p.mrn, p.identifiers, p.created_at
    `;

    let fromClause = 'FROM patients p';
    const joins = [];
    const conditions = [];
    const params = [];
    let paramCount = 0;

    // Add JOINs based on includes to prevent N+1 queries
    if (includeProvider) {
      joins.push('LEFT JOIN providers prov ON p.provider_id = prov.id');
      selectFields += `, 
        prov.first_name as provider_first_name,
        prov.last_name as provider_last_name,
        prov.specialty as provider_specialty,
        prov.npi as provider_npi`;
    }

    if (includeInsurance) {
      joins.push('LEFT JOIN insurance ins ON p.insurance_id = ins.id');
      selectFields += `,
        ins.plan_name as insurance_plan_name,
        ins.group_number as insurance_group_number,
        ins.copay as insurance_copay`;
    }

    if (includeVitals) {
      joins.push(`LEFT JOIN (
        SELECT DISTINCT ON (patient_id) patient_id, vitals, created_at as last_vitals_date
        FROM encounters 
        WHERE vitals IS NOT NULL
        ORDER BY patient_id, created_at DESC
      ) latest_vitals ON p.id = latest_vitals.patient_id`);
      selectFields += `,
        latest_vitals.vitals as latest_vitals,
        latest_vitals.last_vitals_date`;
    }

    // Build WHERE conditions
    if (search) {
      paramCount++;
      conditions.push(`(
        to_tsvector('english', COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) @@ plainto_tsquery('english', $${paramCount})
        OR p.mrn ILIKE $${paramCount + 1}
        OR CONCAT(p.first_name, ' ', p.last_name) ILIKE $${paramCount + 2}
      )`);
      params.push(search, `%${search}%`, `%${search}%`);
      paramCount += 2;
    }

    if (mrn) {
      paramCount++;
      conditions.push(`p.mrn = $${paramCount}`);
      params.push(mrn);
    }

    if (providerId) {
      paramCount++;
      conditions.push(`p.provider_id = $${paramCount}`);
      params.push(providerId);
    }

    if (dateFrom) {
      paramCount++;
      conditions.push(`p.created_at >= $${paramCount}`);
      params.push(dateFrom);
    }

    if (dateTo) {
      paramCount++;
      conditions.push(`p.created_at <= $${paramCount}`);
      params.push(dateTo);
    }

    // Build complete query
    if (joins.length > 0) {
      fromClause += ' ' + joins.join(' ');
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    
    paramCount++;
    const offsetParam = paramCount;
    paramCount++;
    const limitParam = paramCount;
    params.push(offset, limit);

    const orderClause = 'ORDER BY p.last_name, p.first_name, p.id';
    const limitClause = `OFFSET $${offsetParam} LIMIT $${limitParam}`;

    const query = `
      SELECT ${selectFields}
      ${fromClause}
      ${whereClause}
      ${orderClause}
      ${limitClause}
    `;

    return {
      query: query.trim(),
      params,
      cacheKey: this.generateCacheKey('patient_search', searchParams)
    };
  }

  /**
   * Build optimized encounter query with date range optimization
   * @param {Object} filters - Query filters
   * @returns {Object} - Query object with SQL and parameters
   */
  buildEncounterQuery(filters = {}) {
    const {
      patientId,
      providerId,
      status,
      dateFrom,
      dateTo,
      includeVitals = false,
      includePatient = false,
      includeProvider = false,
      limit = 50,
      offset = 0
    } = filters;

    let selectFields = `
      e.id, e.patient_id, e.provider_id, e.reason, e.status, 
      e.created_at, e.hpi, e.ros, e.intake
    `;

    let fromClause = 'FROM encounters e';
    const joins = [];
    const conditions = [];
    const params = [];
    let paramCount = 0;

    // Add vitals if requested
    if (includeVitals) {
      selectFields += ', e.vitals';
    }

    // Add patient info to prevent N+1 queries
    if (includePatient) {
      joins.push('LEFT JOIN patients p ON e.patient_id = p.id');
      selectFields += `,
        p.first_name as patient_first_name,
        p.last_name as patient_last_name,
        p.mrn as patient_mrn,
        p.dob as patient_dob`;
    }

    // Add provider info to prevent N+1 queries
    if (includeProvider) {
      joins.push('LEFT JOIN providers prov ON e.provider_id = prov.id');
      selectFields += `,
        prov.first_name as provider_first_name,
        prov.last_name as provider_last_name,
        prov.specialty as provider_specialty`;
    }

    // Build WHERE conditions with optimal indexing
    if (patientId) {
      paramCount++;
      conditions.push(`e.patient_id = $${paramCount}`);
      params.push(patientId);
    }

    if (providerId) {
      paramCount++;
      conditions.push(`e.provider_id = $${paramCount}`);
      params.push(providerId);
    }

    if (status) {
      paramCount++;
      conditions.push(`e.status = $${paramCount}`);
      params.push(status);
    }

    // Date range with index-friendly conditions
    if (dateFrom || dateTo) {
      if (dateFrom && dateTo) {
        paramCount++;
        conditions.push(`e.created_at >= $${paramCount}`);
        params.push(dateFrom);
        paramCount++;
        conditions.push(`e.created_at <= $${paramCount}`);
        params.push(dateTo);
      } else if (dateFrom) {
        paramCount++;
        conditions.push(`e.created_at >= $${paramCount}`);
        params.push(dateFrom);
      } else if (dateTo) {
        paramCount++;
        conditions.push(`e.created_at <= $${paramCount}`);
        params.push(dateTo);
      }
    }

    // Build complete query
    if (joins.length > 0) {
      fromClause += ' ' + joins.join(' ');
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    
    paramCount++;
    const offsetParam = paramCount;
    paramCount++;
    const limitParam = paramCount;
    params.push(offset, limit);

    const orderClause = 'ORDER BY e.created_at DESC, e.id DESC';
    const limitClause = `OFFSET $${offsetParam} LIMIT $${limitParam}`;

    const query = `
      SELECT ${selectFields}
      ${fromClause}
      ${whereClause}
      ${orderClause}
      ${limitClause}
    `;

    return {
      query: query.trim(),
      params,
      cacheKey: this.generateCacheKey('encounter_query', filters)
    };
  }

  /**
   * Build clinical notes query with optimized JOINs
   * @param {Object} filters - Query filters
   * @returns {Object} - Query object with SQL and parameters
   */
  buildClinicalNotesQuery(filters = {}) {
    const {
      patientId,
      providerId,
      templateId,
      version,
      limit = 20,
      offset = 0,
      includeTemplate = false,
      includePatient = false,
      includeProvider = false
    } = filters;

    let selectFields = `
      cn.id, cn.patient_id, cn.provider_id, cn.template_id,
      cn.content, cn.version, cn.created_at, cn.created_by,
      cn.updated_at, cn.updated_by
    `;

    let fromClause = 'FROM clinical_notes cn';
    const joins = [];
    const conditions = [];
    const params = [];
    let paramCount = 0;

    // Optimized JOINs to prevent N+1 queries
    if (includeTemplate) {
      joins.push('LEFT JOIN clinical_templates ct ON cn.template_id = ct.id');
      selectFields += `,
        ct.name as template_name,
        ct.category as template_category`;
    }

    if (includePatient) {
      joins.push('LEFT JOIN patients p ON cn.patient_id = p.id');
      selectFields += `,
        p.first_name as patient_first_name,
        p.last_name as patient_last_name,
        p.mrn as patient_mrn`;
    }

    if (includeProvider) {
      joins.push('LEFT JOIN providers prov ON cn.provider_id = prov.id');
      selectFields += `,
        prov.first_name as provider_first_name,
        prov.last_name as provider_last_name`;
    }

    // Build WHERE conditions
    if (patientId) {
      paramCount++;
      conditions.push(`cn.patient_id = $${paramCount}`);
      params.push(patientId);
    }

    if (providerId) {
      paramCount++;
      conditions.push(`cn.provider_id = $${paramCount}`);
      params.push(providerId);
    }

    if (templateId) {
      paramCount++;
      conditions.push(`cn.template_id = $${paramCount}`);
      params.push(templateId);
    }

    if (version) {
      paramCount++;
      conditions.push(`cn.version = $${paramCount}`);
      params.push(version);
    }

    // Build complete query
    if (joins.length > 0) {
      fromClause += ' ' + joins.join(' ');
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    
    paramCount++;
    const offsetParam = paramCount;
    paramCount++;
    const limitParam = paramCount;
    params.push(offset, limit);

    const orderClause = 'ORDER BY cn.version DESC, cn.created_at DESC';
    const limitClause = `OFFSET $${offsetParam} LIMIT $${limitParam}`;

    const query = `
      SELECT ${selectFields}
      ${fromClause}
      ${whereClause}
      ${orderClause}
      ${limitClause}
    `;

    return {
      query: query.trim(),
      params,
      cacheKey: this.generateCacheKey('clinical_notes', filters)
    };
  }

  /**
   * Build batch query for loading related data (prevents N+1 queries)
   * @param {string} table - Target table name
   * @param {string} keyField - Foreign key field name
   * @param {Array} ids - Array of IDs to load
   * @param {Array} selectFields - Fields to select
   * @returns {Object} - Query object
   */
  buildBatchQuery(table, keyField, ids, selectFields = ['*']) {
    if (!ids || ids.length === 0) {
      return null;
    }

    const placeholders = ids.map((_, index) => `$${index + 1}`).join(', ');
    const fields = selectFields.join(', ');

    const query = `
      SELECT ${fields}
      FROM ${table}
      WHERE ${keyField} IN (${placeholders})
      ORDER BY ${keyField}
    `;

    return {
      query: query.trim(),
      params: ids,
      cacheKey: this.generateCacheKey(`batch_${table}_${keyField}`, { ids: ids.sort() })
    };
  }

  /**
   * Execute query with optional caching
   * @param {Object} queryObj - Query object from build methods
   * @param {boolean} useCache - Whether to use caching
   * @returns {Promise} - Query results
   */
  async executeQuery(queryObj, useCache = false) {
    const { query, params, cacheKey } = queryObj;
    
    // Check cache first if enabled
    if (useCache && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        console.log(`[QueryBuilder] Cache hit: ${cacheKey}`);
        return cached.data;
      } else {
        this.cache.delete(cacheKey);
      }
    }

    // Execute query with timing
    const startTime = Date.now();
    try {
      const result = await pool.query(query, params);
      const executionTime = Date.now() - startTime;

      // Log slow queries
      if (executionTime > 100) {
        console.warn(`[QueryBuilder] Slow query (${executionTime}ms): ${query.substring(0, 100)}...`);
      }

      // Cache result if enabled
      if (useCache && result.rows) {
        this.cache.set(cacheKey, {
          data: result,
          timestamp: Date.now()
        });
      }

      return result;
    } catch (error) {
      console.error('[QueryBuilder] Query error:', error);
      console.error('[QueryBuilder] Query:', query);
      console.error('[QueryBuilder] Params:', params);
      throw error;
    }
  }

  /**
   * Batch load related data to prevent N+1 queries
   * @param {Array} records - Primary records
   * @param {Object} config - Batch loading configuration
   * @returns {Promise} - Records with related data
   */
  async batchLoadRelated(records, config) {
    if (!records || records.length === 0) {
      return records;
    }

    const { 
      table, 
      localKey, 
      foreignKey, 
      targetKey = 'id', 
      selectFields = ['*'],
      single = false // true if one-to-one relationship
    } = config;

    // Extract unique foreign keys
    const foreignKeys = [...new Set(
      records
        .map(record => record[localKey])
        .filter(key => key !== null && key !== undefined)
    )];

    if (foreignKeys.length === 0) {
      return records;
    }

    // Build and execute batch query
    const queryObj = this.buildBatchQuery(table, targetKey, foreignKeys, selectFields);
    const result = await this.executeQuery(queryObj, true);

    // Create lookup map
    const lookup = new Map();
    result.rows.forEach(row => {
      const key = row[targetKey];
      if (single) {
        lookup.set(key, row);
      } else {
        if (!lookup.has(key)) {
          lookup.set(key, []);
        }
        lookup.get(key).push(row);
      }
    });

    // Attach related data to records
    return records.map(record => ({
      ...record,
      [foreignKey]: lookup.get(record[localKey]) || (single ? null : [])
    }));
  }

  /**
   * Generate cache key from parameters
   * @private
   */
  generateCacheKey(prefix, params) {
    return `${prefix}:${JSON.stringify(params)}`;
  }

  /**
   * Clear query cache
   */
  clearCache() {
    this.cache.clear();
    console.log('[QueryBuilder] Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys())
    };
  }
}

// Export singleton instance
const queryBuilder = new QueryBuilder();
export default queryBuilder;