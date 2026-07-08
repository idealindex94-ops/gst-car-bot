const TelegramBot = require('node-telegram-bot-api').default || require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');
// Replace with the user's token
const token = '8967113990:AAEef83DPSQuQsWaZd8wlDf7CVS1m0h5USU';
const bot = new TelegramBot(token, {polling: true});

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

// Helper to format keys properly
function formatKey(key) {
    return key.replace(/([A-Z])/g, " $1").replace(/^./, str => str.toUpperCase());
}

// Helper to escape HTML to prevent parse errors
function escapeHTML(str) {
    if (str === null || str === undefined) return "";
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Function to format the object recursively for Telegram HTML
function formatToHTML(data, level = 0) {
    let html = "";
    const indent = "  ".repeat(level);
    
    // First, push priority keys to the top if level is 0
    let keys = Object.keys(data);
    if (level === 0) {
        const priority = ['legalname', 'tradename', 'status', 'sts', 'taxtype', 'type', 'taxpayertype', 'registrationdate'];
        keys.sort((a, b) => {
            const cleanA = a.toLowerCase().replace(/[^a-z0-9]/g, '');
            const cleanB = b.toLowerCase().replace(/[^a-z0-9]/g, '');
            const indexA = priority.indexOf(cleanA);
            const indexB = priority.indexOf(cleanB);
            
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return 0;
        });
    }

    for (const key of keys) {
        // Skip metadata keys
        if (key.toLowerCase() === 'gstnumber' || key.toLowerCase() === 'gstin' || key === 'Data Fetched From') continue;
        
        const value = data[key];
        
        // Skip empty or N/A values to keep the report super clean!
        if (value === null || value === undefined || value === "" || value === "N/A" || value === "NA") continue;
        
        const formattedKey = escapeHTML(formatKey(key));
        
        // Add specific emojis for common keys
        let emoji = "🔹";
        if (formattedKey.toLowerCase().includes('name') || formattedKey.toLowerCase().includes('business')) emoji = "🏢";
        else if (formattedKey.toLowerCase().includes('status')) emoji = "🟢";
        else if (formattedKey.toLowerCase().includes('date')) emoji = "📅";
        else if (formattedKey.toLowerCase().includes('address') || formattedKey.toLowerCase().includes('location') || formattedKey.toLowerCase().includes('jurisdiction') || formattedKey.toLowerCase().includes('pin')) emoji = "📍";
        
        if (level > 0) emoji = "🔸"; // Sub-items
        
        if (Array.isArray(value)) {
            if (value.length === 0) continue; // Skip empty arrays
            
            if (typeof value[0] !== 'object') {
                html += `${indent}${emoji} <b>${formattedKey}:</b> ${escapeHTML(value.join(', '))}\n`;
            } else {
                html += `${indent}${emoji} <b>${formattedKey}:</b>\n`;
                value.forEach((item, i) => {
                    html += `${indent}  📑 <i>Item ${i + 1}</i>\n`;
                    html += formatToHTML(item, level + 1);
                });
            }
        } else if (typeof value === 'object') {
            html += `${indent}${emoji} <b>${formattedKey}:</b>\n`;
            html += formatToHTML(value, level + 1);
        } else {
            html += `${indent}${emoji} <b>${formattedKey}:</b> ${escapeHTML(value)}\n`;
        }
    }
    return html;
}


bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "Welcome to the PRO Search Bot! 🚀\n\nSend me a **15-digit GSTIN** to get company details, OR send a **17-character VIN** to get vehicle details.");
});

// Helper for Vehicle formatting
function formatVehicleToHTML(data) {
    if (!data || !data.specs) return "N/A";
    let html = "";
    if (data.make) html += `🚗 <b>Make:</b> ${escapeHTML(data.make)}\n`;
    if (data.model) html += `🚙 <b>Model:</b> ${escapeHTML(data.model)}\n`;
    if (data.year) html += `📅 <b>Year:</b> ${escapeHTML(data.year)}\n`;
    if (data.trim) html += `🏷️ <b>Trim:</b> ${escapeHTML(data.trim)}\n`;
    
    const specs = data.specs;
    if (specs.body_class) html += `🚘 <b>Body Class:</b> ${escapeHTML(specs.body_class)}\n`;
    if (specs.engine_model) html += `⚙️ <b>Engine:</b> ${escapeHTML(specs.engine_model)}\n`;
    if (specs.displacement_l) html += `⛽ <b>Displacement:</b> ${escapeHTML(specs.displacement_l)}L\n`;
    if (specs.drive_type) html += `🛣️ <b>Drive Type:</b> ${escapeHTML(specs.drive_type)}\n`;
    if (specs.transmission_style) html += `🕹️ <b>Transmission:</b> ${escapeHTML(specs.transmission_style)} (${escapeHTML(specs.transmission_speeds)} speed)\n`;
    if (specs.fuel_type_primary) html += `🛢️ <b>Fuel:</b> ${escapeHTML(specs.fuel_type_primary)}\n`;
    if (specs.plant_city && specs.plant_country) html += `🏭 <b>Plant:</b> ${escapeHTML(specs.plant_city)}, ${escapeHTML(specs.plant_country)}\n`;
    return html;
}

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text ? msg.text.trim().toUpperCase() : "";
    
    // Ignore commands
    if (text.startsWith('/')) return;

    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    const vinRegex = /^[A-HJ-NPR-Z0-9]{17}$/i;
    
    if (gstinRegex.test(text)) {
        const waitMsg = await bot.sendMessage(chatId, "⏳ Fetching GST details from servers, please wait...");
    
    let data = null;
    let success = false;
    let apiUsed = "";

    try {
        for (let i = 0; i < FALLBACK_APIS.length; i++) {
            const api = FALLBACK_APIS[i];
            
            try {
                const response = await axios.get(api.getUrl(text), {
                    headers: {
                        'X-RapidAPI-Key': api.apiKey,
                        'X-RapidAPI-Host': api.host
                    },
                    timeout: 10000 // 10 seconds timeout per API
                });
                
                const responseData = response.data;
                
                if (response.status === 200 && responseData && !responseData.error) {
                    data = responseData;
                    success = true;
                    apiUsed = api.name;
                    break;
                }
            } catch (e) {
                // Silently continue to next API
                console.log(`API ${api.name} failed:`, e.message);
            }
        }

        if (!success) {
            bot.editMessageText("❌ All API servers failed or limit exceeded. Please try again later.", {
                chat_id: chatId,
                message_id: waitMsg.message_id
            });
            return;
        }

        let gstData = data.data || data.taxpayerInfo || data;
        if (Array.isArray(gstData) && gstData.length > 0) {
            gstData = gstData[0];
        }

        let replyMessage = `🏢 <b>GSTIN FULL REPORT</b>\n`;
        replyMessage += `━━━━━━━━━━━━━━━━━━━━\n`;
        replyMessage += `🏷️ <b>GSTIN:</b> <code>${escapeHTML(text)}</code>\n\n`;
        
        replyMessage += formatToHTML(gstData);
        
        replyMessage += `\n━━━━━━━━━━━━━━━━━━━━\n`;
        replyMessage += `📚 <i>ONLY EDUCATION PURPOSE</i>`;

        bot.editMessageText(replyMessage, {
            chat_id: chatId,
            message_id: waitMsg.message_id,
            parse_mode: "HTML"
        });

    } catch (error) {
        bot.editMessageText("⚠️ An unexpected error occurred while processing.", {
            chat_id: chatId,
            message_id: waitMsg.message_id
        });
    }
    } else if (vinRegex.test(text)) {
        const waitMsg = await bot.sendMessage(chatId, "⏳ Decoding VIN from servers, please wait...");
        try {
            const response = await axios.get(`https://car-api2.p.rapidapi.com/api/vin/${encodeURIComponent(text)}`, {
                headers: {
                    'X-RapidAPI-Key': DEFAULT_API_KEY,
                    'X-RapidAPI-Host': 'car-api2.p.rapidapi.com'
                },
                timeout: 10000
            });
            const carData = response.data;
            if (carData.error || !carData.make) {
                bot.editMessageText(`❌ API Error or Invalid VIN.`, { chat_id: chatId, message_id: waitMsg.message_id });
                return;
            }
            let replyMessage = `🚗 <b>VEHICLE (VIN) DETAILS</b>\n━━━━━━━━━━━━━━━━━━━━\n`;
            replyMessage += `🏷️ <b>VIN:</b> <code>${escapeHTML(text)}</code>\n\n`;
            replyMessage += formatVehicleToHTML(carData);
            replyMessage += `\n━━━━━━━━━━━━━━━━━━━━\n📚 <i>ONLY EDUCATION PURPOSE</i>`;
            
            bot.editMessageText(replyMessage, { chat_id: chatId, message_id: waitMsg.message_id, parse_mode: "HTML" });
        } catch(e) {
            bot.editMessageText("⚠️ Failed to fetch vehicle details. " + e.message, { chat_id: chatId, message_id: waitMsg.message_id });
        }
    } else {
        bot.sendMessage(chatId, "⚠️ Invalid format! Please send a valid 15-digit GSTIN or a 17-character VIN.");
    }
});

console.log("🤖 Telegram Bot is running...");

// Express web server for Render.com Health Checks
const app = express();
app.get('/', (req, res) => {
    res.send("Bot is alive and running!");
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Web server listening on port ${port}`);
});
