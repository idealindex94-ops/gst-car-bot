const TelegramBot = require('node-telegram-bot-api').default || require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');

const {
    isValidGSTIN,
    extractGSTINsFromText,
    extractGSTINsFromFile
} = require('./services/parserService');

const {
    FALLBACK_APIS,
    fetchGSTDetails,
    executeBulkGSTLookup
} = require('./services/gstService');

const {
    generateExcelReport
} = require('./services/excelService');

// Replace with the user's token
const token = '8967113990:AAEef83DPSQuQsWaZd8wlDf7CVS1m0h5USU';

// --- ADMIN SETTINGS ---
const ADMIN_CHAT_ID = '6189119577'; // Admin Chat ID
let totalSearches = 0;
const uniqueUsers = new Set();
const userState = {};
// ----------------------

// Helper to format keys properly
function formatKey(key) {
    return key.replace(/([A-Z])/g, " $1").replace(/^./, str => str.toUpperCase());
}

// Helper to escape HTML to prevent parse errors
function escapeHTML(str) {
    if (str === null || str === undefined) return "";
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Function to format the object recursively for Telegram HTML (Single GSTIN rich report)
function formatToHTML(data, level = 0) {
    let html = "";
    const indent = "  ".repeat(level);
    
    // First, push priority keys to the top if level is 0
    let keys = Object.keys(data || {});
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
            const isAddressKey = formattedKey.toLowerCase().includes('address') || 
                                 formattedKey.toLowerCase().includes('pradr') || 
                                 formattedKey.toLowerCase().includes('adadr') || 
                                 formattedKey.toLowerCase().includes('location');
                                 
            if (isAddressKey) {
                let addressParts = [];
                function extractRecursive(val) {
                    if (typeof val === 'string' && val.trim() !== '' && val !== 'NA' && val !== 'N/A') {
                        addressParts.push(val.trim());
                    } else if (typeof val === 'number') {
                        addressParts.push(String(val));
                    } else if (Array.isArray(val)) {
                        val.forEach(extractRecursive);
                    } else if (val !== null && typeof val === 'object') {
                        Object.values(val).forEach(extractRecursive);
                    }
                }
                extractRecursive(value);
                
                if (addressParts.length > 0) {
                    html += `\n🏠 <b>${formattedKey}:</b>\n`;
                    html += `    ╰─ <code>${escapeHTML(addressParts.join(', '))}</code>\n\n`;
                }
            } else {
                html += `${indent}${emoji} <b>${formattedKey}:</b>\n`;
                html += formatToHTML(value, level + 1);
            }
        } else {
            html += `${indent}${emoji} <b>${formattedKey}:</b> ${escapeHTML(value)}\n`;
        }
    }
    return html;
}

// Progress bar helper for visual feedback in chats
function renderProgressBar(percent, length = 10) {
    const filled = Math.min(length, Math.max(0, Math.round((percent / 100) * length)));
    return '█'.repeat(filled) + '░'.repeat(length - filled);
}

// Send long text safely split into chunks respecting Telegram's 4096 char limit
async function sendChunkedMessages(botInstance, chatId, header, items, maxLen = 3800) {
    let currentMessage = header;
    for (const item of items) {
        if ((currentMessage + item).length > maxLen) {
            await botInstance.sendMessage(chatId, currentMessage, { parse_mode: 'HTML' }).catch(() => {});
            currentMessage = item;
        } else {
            currentMessage += item;
        }
    }
    if (currentMessage.trim()) {
        await botInstance.sendMessage(chatId, currentMessage, { parse_mode: 'HTML' }).catch(() => {});
    }
}

function sendAdminPanel(botInstance, chatId) {
    const options = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "📊 View Live Stats", callback_data: "admin_stats" }],
                [{ text: "📢 Broadcast Message", callback_data: "admin_broadcast" }],
                [{ text: "🔍 Test Search (As User)", callback_data: "search_gstin" }]
            ]
        }
    };
    botInstance.sendMessage(chatId, "👑 **Admin Control Panel**\nWelcome back, Boss! What would you like to do?", options);
}

/**
 * Handles uploaded document files (.xlsx, .xls, .csv, .txt)
 * @param {object} botInstance
 * @param {object} msg 
 */
async function handleDocumentUpload(botInstance, msg) {
    const chatId = msg.chat.id;
    const doc = msg.document;
    if (!doc) return;

    const fileName = doc.file_name || 'document.xlsx';
    const ext = fileName.toLowerCase().split('.').pop();

    if (!['xlsx', 'xls', 'csv', 'txt'].includes(ext)) {
        return botInstance.sendMessage(
            chatId,
            "⚠️ <b>Unsupported file format!</b>\nPlease upload a <code>.xlsx</code>, <code>.xls</code>, <code>.csv</code>, or <code>.txt</code> file containing GSTINs.",
            { parse_mode: 'HTML' }
        );
    }

    if (doc.file_size && doc.file_size > 10 * 1024 * 1024) {
        return botInstance.sendMessage(chatId, "⚠️ File size exceeds 10MB limit. Please upload a smaller file.");
    }

    uniqueUsers.add(chatId);
    totalSearches++;

    const statusMsg = await botInstance.sendMessage(chatId, `📥 <b>Downloading and reading ${escapeHTML(fileName)}...</b>`, { parse_mode: 'HTML' });

    try {
        const fileLink = await botInstance.getFileLink(doc.file_id);
        const fileResponse = await axios.get(fileLink, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(fileResponse.data);

        const extracted = extractGSTINsFromFile(buffer, fileName);
        if (extracted.length === 0) {
            return botInstance.editMessageText("⚠️ No valid 15-character GSTINs found in the uploaded file.", {
                chat_id: chatId,
                message_id: statusMsg.message_id
            });
        }

        let listToProcess = extracted;
        let limitNotice = "";
        if (extracted.length > 100) {
            listToProcess = extracted.slice(0, 100);
            limitNotice = "\n⚠️ <i>Batch limit: Processing first 100 GSTINs.</i>\n";
        }

        await botInstance.editMessageText(
            `📄 <b>File Loaded:</b> ${escapeHTML(fileName)}\n` +
            `Found <b>${extracted.length}</b> unique GSTINs.${limitNotice}\n` +
            `⏳ Starting bulk verification...`,
            { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML' }
        );

        let lastEditTime = Date.now();
        const onProgress = (current, totalCount) => {
            const now = Date.now();
            const isFinal = current === totalCount;
            // Throttle progress edits to minimum 2000ms to avoid Telegram 429
            if (isFinal || now - lastEditTime >= 2000) {
                lastEditTime = now;
                const percent = Math.round((current / totalCount) * 100);
                const bar = renderProgressBar(percent, 10);
                botInstance.editMessageText(
                    `🔄 <b>Processing File: ${escapeHTML(fileName)}</b>\n\n` +
                    `Progress: ${bar} ${percent}% (${current}/${totalCount})\n` +
                    `⏳ Verifying records against servers...`,
                    { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML' }
                ).catch(() => {});
            }
        };

        const records = await executeBulkGSTLookup(listToProcess, onProgress, { delayMs: 750 });
        const excelBuffer = generateExcelReport(records);

        const successCount = records.filter(r => r.Status && !r.Status.includes('Failed')).length;
        const failedCount = records.length - successCount;

        const caption = `📊 <b>GSTIN Verification Report</b>\n` +
                        `📁 <b>Source File:</b> ${escapeHTML(fileName)}\n` +
                        `📝 <b>Processed:</b> ${records.length} GSTINs\n` +
                        `✅ <b>Success:</b> ${successCount} | ❌ <b>Failed / Not Found:</b> ${failedCount}\n\n` +
                        `<i>Download the attached .xlsx file to view complete details.</i>`;

        await botInstance.sendDocument(chatId, excelBuffer, {
            caption,
            parse_mode: 'HTML'
        }, {
            filename: `GSTIN_Verification_Report_${Date.now()}.xlsx`,
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });

        await botInstance.editMessageText(`✅ Processing complete! Verified report generated and sent below.`, {
            chat_id: chatId,
            message_id: statusMsg.message_id
        }).catch(() => {});

    } catch (err) {
        console.error('Error handling document upload:', err);
        botInstance.editMessageText("⚠️ An error occurred while processing the uploaded file. Please ensure the file is valid.", {
            chat_id: chatId,
            message_id: statusMsg.message_id
        }).catch(() => {});
    }
}

/**
 * Registers all Telegram bot commands and message/callback handlers
 * @param {object} botInstance 
 */
function registerBotHandlers(botInstance) {
    // Persistent Menu Button for normal users
    botInstance.setMyCommands([
        { command: '/start', description: '🚀 Start Bot & Show Menu' }
    ]).catch(() => {});

    // Menu Button for ADMIN only
    botInstance.setMyCommands([
        { command: '/start', description: '🚀 Start Bot & Show Menu' },
        { command: '/admin', description: '👑 Open Admin Dashboard' },
        { command: '/myid', description: '🆔 Check your Chat ID' }
    ], { scope: { type: 'chat', chat_id: ADMIN_CHAT_ID } }).catch(() => {});

    botInstance.onText(/\/(start|menu|search)/, (msg) => {
        if (String(msg.chat.id) === String(ADMIN_CHAT_ID)) {
            return sendAdminPanel(botInstance, msg.chat.id);
        }
        
        const options = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🔍 Search GSTIN", callback_data: "search_gstin" }],
                    [{ text: "ℹ️ Help / How to Use", callback_data: "help" }, { text: "📞 Contact Support", callback_data: "contact" }]
                ]
            }
        };
        botInstance.sendMessage(
            msg.chat.id,
            "Welcome to the **PRO Search Bot**! 🚀\n\nYou can search a single GSTIN, multiple GSTINs separated by spaces/commas/newlines, or upload an Excel (.xlsx/.xls), CSV, or TXT file.\n\nPlease choose an option below:",
            options
        );
    });

    botInstance.onText(/\/admin/, (msg) => {
        if (String(msg.chat.id) !== String(ADMIN_CHAT_ID)) return botInstance.sendMessage(msg.chat.id, "⛔ Unauthorized.");
        sendAdminPanel(botInstance, msg.chat.id);
    });

    botInstance.onText(/\/myid/, (msg) => {
        botInstance.sendMessage(msg.chat.id, `🆔 Your Chat ID is: <code>${msg.chat.id}</code>\n\n(Admin ID in code is: <code>${ADMIN_CHAT_ID}</code>)`, { parse_mode: 'HTML' });
    });

    botInstance.on('callback_query', (callbackQuery) => {
        const message = callbackQuery.message;
        const data = callbackQuery.data;
        const chatId = message.chat.id;
        
        botInstance.answerCallbackQuery(callbackQuery.id).catch(() => {});

        if (data === 'search_gstin') {
            userState[chatId] = 'awaiting_gstin';
            botInstance.sendMessage(chatId, "👇 **Please enter the 15-digit GSTIN number(s) or upload an Excel/CSV/TXT file:**");
        } else if (data === 'help') {
            botInstance.sendMessage(chatId, "ℹ️ **Help / How to Use**\n\n" +
                "1️⃣ **Single GSTIN**: Send any 15-digit GSTIN (e.g. <code>27AAPFU0939F1ZV</code>) for full rich HTML report.\n" +
                "2️⃣ **Bulk Text Search**: Send multiple GSTINs separated by spaces, commas, or new lines for consolidated summary.\n" +
                "3️⃣ **Bulk File Upload**: Upload <code>.xlsx</code>, <code>.xls</code>, <code>.csv</code>, or <code>.txt</code> files to automatically verify all GSTINs and receive a structured Excel (.xlsx) report.",
                { parse_mode: 'HTML' }
            );
        } else if (data === 'contact') {
            botInstance.sendMessage(chatId, "📞 **Contact Support**\n\nIf you are facing issues or need bulk access, please contact the Admin.");
        } else if (data === 'admin_stats') {
            if (String(chatId) !== String(ADMIN_CHAT_ID)) return;
            botInstance.sendMessage(chatId, `📊 <b>Live Bot Statistics</b>\n━━━━━━━━━━━━━━━━\n👥 <b>Unique Users:</b> ${uniqueUsers.size}\n🔍 <b>Total Searches:</b> ${totalSearches}\n\n<i>Note: Stats reset when the server restarts.</i>`, { parse_mode: 'HTML' });
        } else if (data === 'admin_broadcast') {
            if (String(chatId) !== String(ADMIN_CHAT_ID)) return;
            userState[chatId] = 'awaiting_broadcast';
            botInstance.sendMessage(chatId, "📢 **Broadcast Mode**\n\nPlease type the message you want to send to ALL users.\n*(Or type 'cancel' to abort)*");
        }
    });

    botInstance.on('message', async (msg) => {
        // Intercept document uploads directly to avoid duplicate processing or text regex mismatch
        if (msg.document) {
            return handleDocumentUpload(botInstance, msg);
        }

        const chatId = msg.chat.id;
        let text = msg.text ? msg.text.trim() : "";
        
        // Ignore commands
        if (text.startsWith('/')) return;

        // State Management for Broadcast
        if (userState[chatId] === 'awaiting_broadcast' && String(chatId) === String(ADMIN_CHAT_ID)) {
            if (text.toLowerCase() === 'cancel') {
                userState[chatId] = null;
                return botInstance.sendMessage(chatId, "❌ Broadcast cancelled.");
            }
            
            let count = 0;
            uniqueUsers.forEach(userId => {
                botInstance.sendMessage(userId, `📢 <b>Message from Admin:</b>\n\n${text}`, { parse_mode: 'HTML' }).catch(() => {});
                count++;
            });
            userState[chatId] = null;
            return botInstance.sendMessage(chatId, `✅ Message successfully broadcasted to ${count} active users.`);
        }

        // Reset user state if awaiting_gstin
        if (userState[chatId] === 'awaiting_gstin') {
            userState[chatId] = null;
        }

        text = text.toUpperCase();

        // Admin Tracking
        uniqueUsers.add(chatId);
        totalSearches++;
        if (ADMIN_CHAT_ID !== 'YOUR_CHAT_ID_HERE' && String(chatId) !== String(ADMIN_CHAT_ID)) {
            const username = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;
            botInstance.sendMessage(ADMIN_CHAT_ID, `🔍 <b>New Search Alert!</b>\n👤 <b>User:</b> ${username}\n🆔 <b>Chat ID:</b> <code>${chatId}</code>\n📝 <b>Searched:</b> <code>${text}</code>`, { parse_mode: 'HTML' }).catch(() => {});
        }

        const extracted = extractGSTINsFromText(text);

        // R3 Backward Compatibility: Single GSTIN search returns rich HTML format
        if (isValidGSTIN(text) || (extracted.length === 1 && text.replace(/[^A-Za-z0-9]/g, '').length === 15)) {
            const targetGstin = extracted[0] || text.trim();
            const waitMsg = await botInstance.sendMessage(chatId, "⏳ Fetching GST details from servers, please wait...");
            
            try {
                const result = await fetchGSTDetails(targetGstin);

                if (!result.success || !result.data) {
                    botInstance.editMessageText("❌ All API servers failed or limit exceeded. Please try again later.", {
                        chat_id: chatId,
                        message_id: waitMsg.message_id
                    });
                    return;
                }

                let gstData = result.data.data || result.data.taxpayerInfo || result.data;
                if (Array.isArray(gstData) && gstData.length > 0) {
                    gstData = gstData[0];
                }

                let replyMessage = `🏢 <b>GSTIN FULL REPORT</b>\n`;
                replyMessage += `━━━━━━━━━━━━━━━━━━━━\n`;
                replyMessage += `🏷️ <b>GSTIN:</b> <code>${escapeHTML(targetGstin)}</code>\n\n`;
                
                replyMessage += formatToHTML(gstData);
                
                replyMessage += `\n━━━━━━━━━━━━━━━━━━━━\n`;
                replyMessage += `📚 <i>ONLY EDUCATION PURPOSE</i>`;

                botInstance.editMessageText(replyMessage, {
                    chat_id: chatId,
                    message_id: waitMsg.message_id,
                    parse_mode: "HTML"
                });

            } catch (error) {
                console.error('Error in single GSTIN lookup:', error);
                botInstance.editMessageText("⚠️ An unexpected error occurred while processing.", {
                    chat_id: chatId,
                    message_id: waitMsg.message_id
                });
            }
            return;
        }

        // R1 Bulk Text Search: Multiple GSTINs in message
        if (extracted.length > 1) {
            let listToProcess = extracted;
            let limitNotice = "";
            if (extracted.length > 100) {
                listToProcess = extracted.slice(0, 100);
                limitNotice = "\n⚠️ <i>Batch limit: Processing first 100 GSTINs.</i>\n";
            }

            const statusMsg = await botInstance.sendMessage(
                chatId,
                `🔍 <b>Bulk Search Detected</b>\nFound <b>${extracted.length}</b> unique GSTINs in your message.${limitNotice}\n⏳ Initializing verification...`,
                { parse_mode: 'HTML' }
            );

            let lastEditTime = Date.now();
            const onProgress = (current, totalCount) => {
                const now = Date.now();
                const isFinal = current === totalCount;
                // Throttle edits to >= 2000ms
                if (isFinal || now - lastEditTime >= 2000) {
                    lastEditTime = now;
                    const percent = Math.round((current / totalCount) * 100);
                    const bar = renderProgressBar(percent, 10);
                    botInstance.editMessageText(
                        `🔄 <b>Verifying GSTINs (${current}/${totalCount})</b>\n\n` +
                        `${bar} ${percent}%\n` +
                        `⏳ Please wait while server fetches records...`,
                        { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML' }
                    ).catch(() => {});
                }
            };

            try {
                const records = await executeBulkGSTLookup(listToProcess, onProgress, { delayMs: 750 });
                const successCount = records.filter(r => r.Status && !r.Status.includes('Failed')).length;
                const failedCount = records.length - successCount;

                const summaryHeader = `📊 <b>BULK GSTIN CONSOLIDATED REPORT</b>\n` +
                                    `━━━━━━━━━━━━━━━━━━━━\n` +
                                    `📝 <b>Total Processed:</b> ${records.length}\n` +
                                    `✅ <b>Success:</b> ${successCount} | ❌ <b>Failed / Not Found:</b> ${failedCount}\n` +
                                    `━━━━━━━━━━━━━━━━━━━━\n\n`;

                const itemTexts = records.map((rec, idx) => {
                    const isOk = rec.Status && !rec.Status.includes('Failed');
                    const icon = isOk ? "✅" : "❌";
                    return `${icon} <b>${idx + 1}. ${escapeHTML(rec.GSTIN)}</b>\n` +
                           `   🏢 <b>Legal Name:</b> ${escapeHTML(rec["Legal Name"])}\n` +
                           `   🏷️ <b>Trade Name:</b> ${escapeHTML(rec["Trade Name"])}\n` +
                           `   🟢 <b>Status:</b> ${escapeHTML(rec.Status)} | <b>Type:</b> ${escapeHTML(rec["Taxpayer Type"])}\n` +
                           `   📅 <b>Reg Date:</b> ${escapeHTML(rec["Registration Date"])}\n` +
                           `   📍 <b>Address:</b> <code>${escapeHTML(rec.Address)}</code>\n\n`;
                });

                await botInstance.editMessageText(`✅ Verification complete! Summary report below:`, {
                    chat_id: chatId,
                    message_id: statusMsg.message_id
                }).catch(() => {});

                await sendChunkedMessages(botInstance, chatId, summaryHeader, itemTexts);

                // If 3 or more records, also provide the downloadable Excel report
                if (records.length >= 3) {
                    const excelBuffer = generateExcelReport(records);
                    await botInstance.sendDocument(chatId, excelBuffer, {
                        caption: `📥 Attached Excel report for ${records.length} verified GSTINs.`,
                        parse_mode: 'HTML'
                    }, {
                        filename: `GSTIN_Bulk_Report_${Date.now()}.xlsx`,
                        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                    }).catch(() => {});
                }

            } catch (error) {
                console.error('Error during bulk text lookup:', error);
                botInstance.editMessageText("⚠️ An unexpected error occurred while processing bulk search.", {
                    chat_id: chatId,
                    message_id: statusMsg.message_id
                }).catch(() => {});
            }
            return;
        }

        // Invalid format fallback
        botInstance.sendMessage(chatId, "⚠️ Invalid format! Please enter a valid 15-digit GSTIN, multiple GSTINs (separated by spaces, commas, or newlines), or upload an Excel/CSV/TXT file.");
    });
}

// Global instances
let botInstance = null;
let expressApp = null;

function getBot(customToken = token, options = { polling: true }) {
    if (!botInstance) {
        botInstance = new TelegramBot(customToken, options);
        registerBotHandlers(botInstance);
    }
    return botInstance;
}

function getApp() {
    if (!expressApp) {
        expressApp = express();
        expressApp.get('/', (req, res) => {
            res.send("Bot is alive and running!");
        });
    }
    return expressApp;
}

// When executed directly (e.g. npm start / node bot.js), start bot polling and web server
if (require.main === module) {
    console.log("🤖 Telegram Bot is starting...");
    const bot = getBot();
    const app = getApp();
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
        console.log(`Web server listening on port ${port}`);
    });
}

module.exports = {
    getBot,
    getApp,
    formatToHTML,
    renderProgressBar,
    sendChunkedMessages,
    handleDocumentUpload,
    registerBotHandlers,
    ADMIN_CHAT_ID
};
