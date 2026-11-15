const defaultAxios = require('axios');

const DEFAULT_API_KEY = 'dd99e898afmsh0eebfd590d1b735p17e542jsn486882a029c3';

// 8 RapidAPI endpoints for fallback cascade
const FALLBACK_APIS = [
    {
        name: "GST Insights API",
        host: "gst-insights-api.p.rapidapi.com",
        apiKey: DEFAULT_API_KEY,
        getUrl: (gstin) => `https://gst-insights-api.p.rapidapi.com/getGSTDetailsUsingGST/${gstin}`
    },
    {
        name: "Powerful GSTIN Tool",
        host: "powerful-gstin-tool.p.rapidapi.com",
        apiKey: DEFAULT_API_KEY,
        getUrl: (gstin) => `https://powerful-gstin-tool.p.rapidapi.com/v1/gstin/${gstin}/details`
    },
    {
        name: "India GSTIN Validator API (Key 1)",
        host: "india-gstin-validator-api.p.rapidapi.com",
        apiKey: "92740febe3mshecc878f0bcbc83ap163558jsn480eb9aa11bb",
        getUrl: (gstin) => `https://india-gstin-validator-api.p.rapidapi.com/api/gstin/validate?gstin=${gstin}`
    },
    {
        name: "India GSTIN Validator API (Key 2)",
        host: "india-gstin-validator-api.p.rapidapi.com",
        apiKey: "eb2132357amsh4b54033564e8f4ep137ea1jsnc1862f21767e",
        getUrl: (gstin) => `https://india-gstin-validator-api.p.rapidapi.com/api/gstin/validate?gstin=${gstin}`
    },
    {
        name: "India GSTIN Validator API (Key 3)",
        host: "india-gstin-validator-api.p.rapidapi.com",
        apiKey: "e491f1eafcmshce29c007113837bp186710jsnca3a9ec430eb",
        getUrl: (gstin) => `https://india-gstin-validator-api.p.rapidapi.com/api/gstin/validate?gstin=${gstin}`
    },
    {
        name: "India GSTIN Validator API (Key 4)",
        host: "india-gstin-validator-api.p.rapidapi.com",
        apiKey: "7be02d357dmsh0dcf20f63e29252p15e9c9jsnd2d08834b5de",
        getUrl: (gstin) => `https://india-gstin-validator-api.p.rapidapi.com/api/gstin/validate?gstin=${gstin}`
    },
    {
        name: "India GSTIN Validator",
        host: "india-gstin-validator.p.rapidapi.com",
        apiKey: DEFAULT_API_KEY,
        getUrl: (gstin) => `https://india-gstin-validator.p.rapidapi.com/validate?gstin=${gstin}`
    },
    {
        name: "GST API",
        host: "gst-api2.p.rapidapi.com",
        apiKey: DEFAULT_API_KEY,
        getUrl: (gstin) => `https://gst-api2.p.rapidapi.com/api/gst/${gstin}`
    }
];

/**
 * Extracts address string recursively from nested object or array structures
 * @param {any} val 
 * @returns {string} Flattened comma-separated address
 */
function extractAddress(val) {
    if (!val) return 'N/A';
    if (typeof val === 'string') {
        const trimmed = val.trim();
        return (trimmed && trimmed !== 'NA' && trimmed !== 'N/A') ? trimmed : 'N/A';
    }

    const parts = [];
    function recurse(node) {
        if (node === null || node === undefined) return;
        if (typeof node === 'string') {
            const clean = node.trim();
            if (clean && clean !== 'NA' && clean !== 'N/A') {
                parts.push(clean);
            }
        } else if (typeof node === 'number') {
            parts.push(String(node));
        } else if (Array.isArray(node)) {
            node.forEach(recurse);
        } else if (typeof node === 'object') {
            Object.values(node).forEach(recurse);
        }
    }

    recurse(val);
    return parts.length > 0 ? parts.join(', ') : 'N/A';
}

/**
 * Normalizes API response data into the exact 7 required fields:
 * GSTIN, Legal Name, Trade Name, Status, Registration Date, Taxpayer Type, Address.
 * @param {string} gstin 
 * @param {object|null} apiData 
 * @param {boolean} isSuccess 
 * @returns {object} Normalized record object with the 7 exact keys
 */
function normalizeGSTRecord(gstin, apiData, isSuccess = true) {
    const cleanGSTIN = (gstin || '').toUpperCase().trim();

    if (!isSuccess || !apiData) {
        return {
            "GSTIN": cleanGSTIN,
            "Legal Name": "N/A",
            "Trade Name": "N/A",
            "Status": "Failed / Not Found",
            "Registration Date": "N/A",
            "Taxpayer Type": "N/A",
            "Address": "N/A"
        };
    }

    // Unwrap data envelope if present
    let raw = apiData.data || apiData.taxpayerInfo || apiData.result || apiData;
    if (Array.isArray(raw) && raw.length > 0) {
        raw = raw[0];
    }
    if (!raw || typeof raw !== 'object') {
        raw = {};
    }

    // 1. Legal Name
    const legalName = raw.lgnm || raw.legalName || raw.legal_name || raw.trade_nam || raw.tradeName || "N/A";

    // 2. Trade Name
    const tradeName = raw.tradeNam || raw.tradeName || raw.trade_name || raw.businessName || raw.lgnm || "N/A";

    // 3. Status
    const status = raw.sts || raw.status || raw.status_desc || raw.gstin_status || "Active";

    // 4. Registration Date
    const registrationDate = raw.rgdt || raw.registrationDate || raw.reg_date || raw.registration_date || "N/A";

    // 5. Taxpayer Type
    const taxpayerType = raw.dty || raw.taxpayerType || raw.tax_type || raw.taxtype || raw.type || "N/A";

    // 6. Address
    let addressValue = 'N/A';
    if (raw.pradr) {
        addressValue = extractAddress(raw.pradr.addr || raw.pradr);
    } else if (raw.address) {
        addressValue = extractAddress(raw.address);
    } else if (raw.adadr) {
        addressValue = extractAddress(raw.adadr);
    } else if (raw.location) {
        addressValue = extractAddress(raw.location);
    } else if (raw.principal_place_of_business) {
        addressValue = extractAddress(raw.principal_place_of_business);
    }

    return {
        "GSTIN": cleanGSTIN,
        "Legal Name": String(legalName).trim(),
        "Trade Name": String(tradeName).trim(),
        "Status": String(status).trim(),
        "Registration Date": String(registrationDate).trim(),
        "Taxpayer Type": String(taxpayerType).trim(),
        "Address": addressValue
    };
}

/**
 * Queries RapidAPI endpoints using sequential fallback cascade.
 * @param {string} gstin 
 * @param {object} options 
 * @returns {Promise<{success: boolean, data?: object, error?: string, apiUsed?: string}>}
 */
async function fetchGSTDetails(gstin, options = {}) {
    const axiosClient = options.axiosInstance || defaultAxios;
    const apis = options.apis || FALLBACK_APIS;
    const timeout = options.timeout || 10000;

    let data = null;
    let success = false;
    let apiUsed = "";
    let lastError = "";

    for (let i = 0; i < apis.length; i++) {
        const api = apis[i];
        try {
            const response = await axiosClient.get(api.getUrl(gstin), {
                headers: {
                    'X-RapidAPI-Key': api.apiKey,
                    'X-RapidAPI-Host': api.host
                },
                timeout
            });

            const responseData = response.data;
            if (response.status === 200 && responseData && !responseData.error) {
                data = responseData;
                success = true;
                apiUsed = api.name;
                break;
            }
        } catch (err) {
            lastError = err.message;
        }
    }

    if (success) {
        return { success: true, data, apiUsed };
    }

    return {
        success: false,
        error: lastError || "All API servers failed or limit exceeded",
        apiUsed: ""
    };
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Executes bulk GST lookups with sequential rate limiting, batch safeguards,
 * and error isolation per GSTIN.
 * @param {string[]} gstinList 
 * @param {(current: number, total: number, record: object) => void} [onProgress] 
 * @param {object} [options]
 * @param {number} [options.delayMs=750] Delay between API calls in ms
 * @param {number} [options.maxBatch=100] Maximum batch cap
 * @param {Function} [options.fetcher] Custom fetcher function for testing
 * @returns {Promise<object[]>} Array of normalized records
 */
async function executeBulkGSTLookup(gstinList, onProgress, options = {}) {
    const delayMs = typeof options.delayMs === 'number' ? options.delayMs : 750;
    const maxBatch = typeof options.maxBatch === 'number' ? options.maxBatch : 100;
    const fetcher = options.fetcher || ((gstin) => fetchGSTDetails(gstin, options));

    const targetList = (gstinList || []).slice(0, maxBatch);
    const total = targetList.length;
    const results = [];

    for (let i = 0; i < total; i++) {
        const gstin = targetList[i];
        let normalizedRecord;

        try {
            const res = await fetcher(gstin);
            if (res && res.success && res.data) {
                normalizedRecord = normalizeGSTRecord(gstin, res.data, true);
            } else {
                normalizedRecord = normalizeGSTRecord(gstin, null, false);
            }
        } catch (err) {
            console.error(`Error querying GSTIN ${gstin}:`, err.message);
            normalizedRecord = normalizeGSTRecord(gstin, null, false);
        }

        results.push(normalizedRecord);

        if (typeof onProgress === 'function') {
            try {
                onProgress(i + 1, total, normalizedRecord);
            } catch (pErr) {
                console.error('Error in onProgress callback:', pErr.message);
            }
        }

        // Apply rate-limiting delay between items if there are more items to query
        if (i < total - 1 && delayMs > 0) {
            await sleep(delayMs);
        }
    }

    return results;
}

module.exports = {
    FALLBACK_APIS,
    DEFAULT_API_KEY,
    extractAddress,
    normalizeGSTRecord,
    fetchGSTDetails,
    executeBulkGSTLookup,
    sleep
};
