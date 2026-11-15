const xlsx = require('xlsx');

const REQUIRED_HEADERS = [
    'GSTIN',
    'Legal Name',
    'Trade Name',
    'Status',
    'Registration Date',
    'Taxpayer Type',
    'Address'
];

/**
 * Generates an Excel (.xlsx) file buffer from an array of GSTIN records.
 * The workbook contains a single sheet with the 7 required columns and formatted widths.
 * @param {object[]} records 
 * @returns {Buffer} Excel workbook buffer
 */
function generateExcelReport(records = []) {
    const rows = [REQUIRED_HEADERS];

    for (const record of records) {
        if (!record) continue;

        const gstin = record['GSTIN'] || record.gstin || record.GSTIN || '';
        const legalName = record['Legal Name'] || record.legalName || record.legal_name || 'N/A';
        const tradeName = record['Trade Name'] || record.tradeName || record.trade_name || 'N/A';
        const status = record['Status'] || record.status || 'N/A';
        const registrationDate = record['Registration Date'] || record.registrationDate || record.reg_date || 'N/A';
        const taxpayerType = record['Taxpayer Type'] || record.taxpayerType || record.tax_type || 'N/A';
        const address = record['Address'] || record.address || 'N/A';

        rows.push([
            String(gstin),
            String(legalName),
            String(tradeName),
            String(status),
            String(registrationDate),
            String(taxpayerType),
            String(address)
        ]);
    }

    const ws = xlsx.utils.aoa_to_sheet(rows);

    // Set clean column widths
    ws['!cols'] = [
        { wch: 20 }, // GSTIN
        { wch: 35 }, // Legal Name
        { wch: 30 }, // Trade Name
        { wch: 18 }, // Status
        { wch: 20 }, // Registration Date
        { wch: 22 }, // Taxpayer Type
        { wch: 60 }  // Address
    ];

    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'GSTIN Verification Report');

    return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
    REQUIRED_HEADERS,
    generateExcelReport
};
