const xlsx = require('xlsx');

// 15-character GSTIN regex with word boundaries
const GSTIN_REGEX = /\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}\b/gi;
const STRICT_GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i;

/**
 * Validates whether a single string is an exact 15-character GSTIN.
 * @param {string} gstin 
 * @returns {boolean}
 */
function isValidGSTIN(gstin) {
    if (typeof gstin !== 'string') return false;
    return STRICT_GSTIN_REGEX.test(gstin.trim());
}

/**
 * Extracts and deduplicates all valid 15-character GSTINs from a text string,
 * preserving appearance order.
 * @param {string} text 
 * @returns {string[]} Array of unique uppercase GSTIN strings
 */
function extractGSTINsFromText(text) {
    if (typeof text !== 'string' || !text.trim()) {
        return [];
    }

    const matches = text.match(GSTIN_REGEX);
    if (!matches) {
        return [];
    }

    const uppercaseMatches = matches.map(m => m.toUpperCase());
    return [...new Set(uppercaseMatches)];
}

/**
 * Extracts and deduplicates valid 15-character GSTINs from an uploaded file buffer.
 * Supports .xlsx, .xls, .csv, and .txt formats.
 * @param {Buffer} buffer 
 * @param {string} fileName 
 * @returns {string[]} Array of unique uppercase GSTIN strings
 */
function extractGSTINsFromFile(buffer, fileName = '') {
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
        return [];
    }

    const ext = String(fileName).trim().toLowerCase().split('.').pop();

    if (ext === 'txt' || ext === 'csv') {
        try {
            const content = buffer.toString('utf8');
            return extractGSTINsFromText(content);
        } catch (err) {
            console.error('Error reading text/csv buffer:', err.message);
            return [];
        }
    }

    if (ext === 'xlsx' || ext === 'xls') {
        try {
            const workbook = xlsx.read(buffer, { type: 'buffer' });
            const collected = [];

            for (const sheetName of workbook.SheetNames) {
                const sheet = workbook.Sheets[sheetName];
                if (!sheet) continue;

                const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
                for (const row of rows) {
                    if (Array.isArray(row)) {
                        for (const cell of row) {
                            if (cell !== null && cell !== undefined) {
                                const cellMatches = extractGSTINsFromText(String(cell));
                                if (cellMatches.length > 0) {
                                    collected.push(...cellMatches);
                                }
                            }
                        }
                    }
                }
            }

            return [...new Set(collected)];
        } catch (err) {
            console.error('Error reading excel buffer:', err.message);
            return [];
        }
    }

    // Fallback: attempt text extraction if extension unrecognized
    try {
        const textFallback = buffer.toString('utf8');
        return extractGSTINsFromText(textFallback);
    } catch {
        return [];
    }
}

module.exports = {
    GSTIN_REGEX,
    STRICT_GSTIN_REGEX,
    isValidGSTIN,
    extractGSTINsFromText,
    extractGSTINsFromFile
};
