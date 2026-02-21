/**
 * Centralized API client with environment-based URL configuration,
 * consistent error handling, and in-memory response caching.
 */

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000';

const DEFAULT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// In-memory cache: key -> { data, timestamp, ttl }
const cache = new Map();

// Cross-resource invalidation dependencies
const INVALIDATION_DEPS = {
  '/api/events': ['/api/banners'],
  '/api/gallery': ['/api/events'],
};

function getCacheKey(endpoint, params) {
  const queryString = new URLSearchParams(params).toString();
  return queryString ? `${endpoint}?${queryString}` : endpoint;
}

function getCachedResponse(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > entry.ttl) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCachedResponse(key, data, ttl = DEFAULT_CACHE_TTL) {
  cache.set(key, { data, timestamp: Date.now(), ttl });
}

function invalidateCache(...prefixes) {
  const allPrefixes = new Set(prefixes);
  // Add cross-resource dependencies
  for (const prefix of prefixes) {
    const deps = INVALIDATION_DEPS[prefix];
    if (deps) {
      deps.forEach((dep) => allPrefixes.add(dep));
    }
  }

  for (const key of cache.keys()) {
    for (const prefix of allPrefixes) {
      if (key.startsWith(prefix)) {
        cache.delete(key);
        break;
      }
    }
  }
}

/**
 * Clear cache entries matching the given prefixes, or all entries if none provided.
 * @param {...string} prefixes - Resource prefixes to clear (e.g. '/api/events')
 */
export function clearApiCache(...prefixes) {
  if (prefixes.length === 0) {
    cache.clear();
  } else {
    invalidateCache(...prefixes);
  }
}

/**
 * Extract the resource prefix from an endpoint (e.g. '/api/events/5' -> '/api/events')
 */
function getResourcePrefix(endpoint) {
  const parts = endpoint.split('/').filter(Boolean); // ['api', 'events', '5']
  if (parts.length >= 2) {
    return '/' + parts.slice(0, 2).join('/'); // '/api/events'
  }
  return endpoint;
}

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/**
 * Base fetch wrapper with error handling
 * @param {string} endpoint - API endpoint (relative path)
 * @param {Object} options - Fetch options
 * @returns {Promise<any>} - Response data
 */
async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;

  const { headers: optionHeaders, ...restOptions } = options;

  const config = {
    ...restOptions,
    headers: {
      'Content-Type': 'application/json',
      ...optionHeaders,
    },
  };

  try {
    const response = await fetch(url, config);

    if (!response.ok) {
      let errorData = null;
      try {
        errorData = await response.json();
      } catch {
        // Response body is not JSON
      }
      throw new ApiError(
        errorData?.message || `Request failed with status ${response.status}`,
        response.status,
        errorData
      );
    }

    // Handle empty responses
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    }
    return await response.text();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    // Network error or other fetch error
    throw new ApiError(error.message || 'Network error', 0);
  }
}

/**
 * API client with convenience methods
 */
export const api = {
  /**
   * GET request with caching
   * @param {string} endpoint - API endpoint
   * @param {Object} params - Query parameters
   * @param {Object} headers - Additional headers
   * @param {Object} options - Cache options: { ttl, skipCache }
   * @returns {Promise<any>}
   */
  get: (endpoint, params = {}, headers = {}, options = {}) => {
    const { ttl = DEFAULT_CACHE_TTL, skipCache = false } = options;
    const cacheKey = getCacheKey(endpoint, params);

    if (!skipCache) {
      const cached = getCachedResponse(cacheKey);
      if (cached !== null) {
        return Promise.resolve(cached);
      }
    }

    const queryString = new URLSearchParams(params).toString();
    const url = queryString ? `${endpoint}?${queryString}` : endpoint;
    return request(url, { method: 'GET', headers }).then((data) => {
      setCachedResponse(cacheKey, data, ttl);
      return data;
    });
  },

  /**
   * POST request (invalidates related cache)
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request body
   * @param {Object} headers - Additional headers
   * @returns {Promise<any>}
   */
  post: (endpoint, data, headers = {}) => {
    return request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
      headers,
    }).then((result) => {
      invalidateCache(getResourcePrefix(endpoint));
      return result;
    });
  },

  /**
   * PUT request (invalidates related cache)
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request body
   * @param {Object} headers - Additional headers
   * @returns {Promise<any>}
   */
  put: (endpoint, data, headers = {}) => {
    return request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
      headers,
    }).then((result) => {
      invalidateCache(getResourcePrefix(endpoint));
      return result;
    });
  },

  /**
   * DELETE request (invalidates related cache)
   * @param {string} endpoint - API endpoint
   * @param {Object} headers - Additional headers
   * @returns {Promise<any>}
   */
  delete: (endpoint, headers = {}) => {
    return request(endpoint, { method: 'DELETE', headers }).then((result) => {
      invalidateCache(getResourcePrefix(endpoint));
      return result;
    });
  },
};

export default api;
