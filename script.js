document.addEventListener('DOMContentLoaded', () => {
    const searchBtn = document.getElementById('searchBtn');
    const gstinInput = document.getElementById('gstinInput');
    const loading = document.getElementById('loading');
    const resultDiv = document.getElementById('result');
    const errorDiv = document.getElementById('error');

    // Default API Key
    const DEFAULT_API_KEY = 'dd99e898afmsh0eebfd590d1b735p17e542jsn486882a029c3'; 
    
    // Auto-Switcher: List of APIs to try in order
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

    searchBtn.addEventListener('click', performSearch);
    gstinInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
    });

    async function performSearch() {
        const gstin = gstinInput.value.trim().toUpperCase();
        
        // Proper Indian GSTIN Validation Regex
        const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
        
        if (!gstin) {
            showError("Please enter a GSTIN number");
            return;
        }

        if (!gstinRegex.test(gstin)) {
            showError("Invalid GSTIN format. Please enter a valid 15-digit GSTIN.");
            return;
        }

        // Hide previous results and show loading
        errorDiv.classList.add('hidden');
        resultDiv.classList.add('hidden');
        loading.classList.remove('hidden');

        try {
            let data = null;
            let success = false;
            let lastError = null;
            let apiUsed = "";

            // Loop through our API list
            for (let i = 0; i < FALLBACK_APIS.length; i++) {
                const api = FALLBACK_APIS[i];
                console.log(`Trying ${api.name}...`);
                
                try {
                    const response = await fetch(api.getUrl(gstin), {
                        method: 'GET',
                        headers: {
                            'X-RapidAPI-Key': api.apiKey,
                            'X-RapidAPI-Host': api.host
                        }
                    });
                    
                    const responseData = await response.json();
                    
                    if (response.ok && responseData && !responseData.error) {
                        data = responseData;
                        success = true;
                        apiUsed = api.name;
                        break; // Stop looking, we found the data!
                    } else {
                        lastError = responseData.message || responseData.error || `Failed with status ${response.status}`;
                        console.warn(`${api.name} failed: ${lastError}`);
                        // Loop continues to the next API automatically...
                    }
                } catch (e) {
                    lastError = e.message;
                    console.warn(`${api.name} network error:`, e);
                }
            }

            if (!success) {
                throw new Error("API Limit Over! Please add more APIs. Last Error: " + lastError);
            }
            
            // The API might nest the actual GST data
            let gstData = data.data || data.taxpayerInfo || data;
            
            // If the data is returned inside an array, extract the first object
            if (Array.isArray(gstData) && gstData.length > 0) {
                gstData = gstData[0];
            }
            
            // Add a stamp so you can see which API did the job in the UI!
            gstData["Data Fetched From"] = apiUsed;
            
            renderResult(gstData, gstin);

        } catch (error) {
            showError(error.message || "An error occurred while fetching data.");
        } finally {
            loading.classList.add('hidden');
        }
    }

    function formatKey(key) {
        // Convert camelCase to Title Case
        return key.replace(/([A-Z])/g, " $1").replace(/^./, str => str.toUpperCase());
    }

    function formatValue(value) {
        if (value === null || value === undefined || value === "") {
            return "N/A";
        }
        if (Array.isArray(value)) {
            if (value.length === 0) return "N/A";
            if (typeof value[0] !== 'object') {
                return value.join(', ');
            }
            return value.map((item, i) => `
                <div style="margin-top: 5px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 8px; border-left: 3px solid #4facfe;">
                    <div style="color: #a8b2d1; font-size: 0.75rem; margin-bottom: 5px; letter-spacing: 1px;">ITEM #${i + 1}</div>
                    ${formatValue(item)}
                </div>
            `).join('');
        }
        if (typeof value === "object") {
            let html = '<div style="margin-top: 5px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 8px; border-left: 3px solid #00f2fe;">';
            for (const key in value) {
                html += `<div style="margin-bottom: 4px; font-size: 0.95rem;">
                            <strong style="color:#a8b2d1; font-weight: 400;">${formatKey(key)}:</strong> 
                            ${formatValue(value[key])}
                         </div>`;
            }
            html += '</div>';
            return html;
        }
        return String(value);
    }

    function renderResult(data, gstin) {
        let html = '';
        
        // Ensure GSTIN is always printed at the top
        html += `
            <div class="result-item">
                <div class="label">GSTIN Number</div>
                <div class="value" style="font-weight: 600; color: #fff;">${gstin}</div>
            </div>
        `;

        for (const key in data) {
            // Skip GSTIN since we already showed it at the top
            if (key.toLowerCase() === 'gstin' || key.toLowerCase() === 'gstnumber') continue;

            const value = data[key];
            const formattedKey = formatKey(key);
            const displayValue = formatValue(value);
            
            let extraClass = '';
            if (key.toLowerCase() === 'status' || key.toLowerCase() === 'sts') {
                extraClass = String(value).toLowerCase() === 'active' ? 'status-active' : 'status-inactive';
            }

            html += `
                <div class="result-item">
                    <div class="label">${formattedKey}</div>
                    <div class="value ${extraClass}">${displayValue}</div>
                </div>
            `;
        }

        resultDiv.innerHTML = html;
        resultDiv.classList.remove('hidden');
    }

    function showError(message) {
        errorDiv.textContent = message;
        errorDiv.classList.remove('hidden');
        resultDiv.classList.add('hidden');
    }
});
