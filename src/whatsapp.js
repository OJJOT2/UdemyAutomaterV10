// ============================================
// WhatsApp Module — Baileys Integration
// ============================================
// Handles WhatsApp connection via Baileys with
// local session persistence and remote QR login
// through Telegram.
// ============================================

const makeWASocket = require('@whiskeysockets/baileys').default;
const {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const path = require('path');

const AUTH_DIR = path.join(__dirname, '..', 'auth_info_baileys');

let sock = null;
let connectionStatus = '🔴 Disconnected';
let telegramModule = null; // Injected to send QR images
let retryCount = 0;
const MAX_RETRIES = 5;

/**
 * Initialize the WhatsApp Baileys connection.
 * @param {Object} tgModule - Reference to the Telegram module (for sending QR codes)
 */
async function initWhatsApp(tgModule) {
    telegramModule = tgModule;
    await connectToWhatsApp();
}

/**
 * Establish the WhatsApp WebSocket connection.
 * Handles QR code generation, session restore, and reconnection.
 */
async function connectToWhatsApp() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
        const { version } = await fetchLatestBaileysVersion();

        console.log(`[WhatsApp] Connecting with Baileys version: ${version.join('.')}`);

        sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false, // We send QR via Telegram instead
            defaultQueryTimeoutMs: undefined,
            browser: ['UdemyAutomater', 'Chrome', '125.0.0'],
            generateHighQualityLinkPreview: false,
            syncFullHistory: false,
        });

        // --- Save credentials on update ---
        sock.ev.on('creds.update', saveCreds);

        // --- Connection state handler ---
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            // QR code received — convert to image and send via Telegram
            if (qr) {
                console.log('[WhatsApp] QR code received. Sending to admin via Telegram...');
                connectionStatus = '📱 Awaiting QR scan...';
                try {
                    const qrBuffer = await QRCode.toBuffer(qr, {
                        type: 'png',
                        width: 512,
                        margin: 2,
                        color: {
                            dark: '#000000',
                            light: '#FFFFFF',
                        },
                    });

                    if (telegramModule) {
                        await telegramModule.sendImageToAdmin(
                            qrBuffer,
                            '📱 Scan this QR code with WhatsApp to link this server.\n\n' +
                            '1. Open WhatsApp on your phone\n' +
                            '2. Go to Settings → Linked Devices\n' +
                            '3. Tap "Link a Device"\n' +
                            '4. Scan this QR code'
                        );
                    }
                } catch (err) {
                    console.error('[WhatsApp] Failed to send QR to Telegram:', err.message);
                }
            }

            // Connection opened
            if (connection === 'open') {
                console.log('[WhatsApp] ✅ Connected successfully!');
                connectionStatus = '🟢 Connected';
                retryCount = 0;

                if (telegramModule) {
                    await telegramModule.sendToAdmin('✅ WhatsApp connected successfully!');
                }
            }

            // Connection closed
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const reason = DisconnectReason;

                console.log(`[WhatsApp] Connection closed. Status code: ${statusCode}`);
                connectionStatus = '🔴 Disconnected';

                // Handle different disconnect reasons
                if (statusCode === reason.loggedOut) {
                    // Session invalidated — user logged out from phone
                    console.log('[WhatsApp] Logged out. Clearing session and requesting new QR...');
                    connectionStatus = '🔴 Logged out — needs re-scan';
                    if (telegramModule) {
                        await telegramModule.sendToAdmin(
                            '⚠️ WhatsApp session was logged out from phone.\n' +
                            'Use /qr to re-authenticate.'
                        );
                    }
                } else if (statusCode === reason.restartRequired) {
                    console.log('[WhatsApp] Restart required. Reconnecting...');
                    await connectToWhatsApp();
                } else if (statusCode === reason.connectionReplaced) {
                    console.log('[WhatsApp] Connection replaced by another client.');
                    if (telegramModule) {
                        await telegramModule.sendToAdmin(
                            '⚠️ WhatsApp connection was replaced by another device.'
                        );
                    }
                } else {
                    // Generic reconnection with retry limit
                    retryCount++;
                    if (retryCount <= MAX_RETRIES) {
                        const delayMs = Math.min(retryCount * 3000, 15000);
                        console.log(`[WhatsApp] Reconnecting in ${delayMs / 1000}s (attempt ${retryCount}/${MAX_RETRIES})...`);
                        connectionStatus = `🟡 Reconnecting (${retryCount}/${MAX_RETRIES})...`;
                        setTimeout(connectToWhatsApp, delayMs);
                    } else {
                        console.error('[WhatsApp] Max retries reached. Giving up.');
                        connectionStatus = '🔴 Failed — max retries reached';
                        if (telegramModule) {
                            await telegramModule.sendToAdmin(
                                '❌ WhatsApp connection failed after maximum retries.\n' +
                                'Use /qr to try again.'
                            );
                        }
                    }
                }
            }
        });

        // --- Message listener (optional — for debugging) ---
        sock.ev.on('messages.upsert', ({ messages }) => {
            for (const msg of messages) {
                if (!msg.key.fromMe && msg.message) {
                    const sender = msg.key.remoteJid;
                    console.log(`[WhatsApp] Incoming message from: ${sender}`);
                }
            }
        });

    } catch (err) {
        console.error('[WhatsApp] Fatal connection error:', err.message);
        connectionStatus = `🔴 Error: ${err.message}`;
    }
}

/**
 * Send a text message to the configured WhatsApp Channel or Group.
 * Tries the newsletter channel first, falls back to group.
 * @param {string} text - Message text to send
 */
async function sendToChannel(text) {
    if (!sock) {
        throw new Error('WhatsApp is not connected.');
    }

    const channelJid = process.env.WHATSAPP_CHANNEL_JID;
    const groupJid = process.env.WHATSAPP_GROUP_JID;

    // Try newsletter channel first
    if (channelJid) {
        try {
            await sock.sendMessage(channelJid, { text });
            console.log(`[WhatsApp] ✅ Message sent to channel: ${channelJid}`);
            return;
        } catch (err) {
            console.error(`[WhatsApp] Channel send failed (${channelJid}):`, err.message);
            // Fall through to group fallback
        }
    }

    // Fallback to group
    if (groupJid) {
        try {
            await sock.sendMessage(groupJid, { text });
            console.log(`[WhatsApp] ✅ Message sent to group: ${groupJid}`);
            return;
        } catch (err) {
            console.error(`[WhatsApp] Group send failed (${groupJid}):`, err.message);
            throw new Error(`Failed to send to both channel and group: ${err.message}`);
        }
    }

    throw new Error('No WHATSAPP_CHANNEL_JID or WHATSAPP_GROUP_JID configured.');
}

/**
 * Request a new QR code by disconnecting and reconnecting.
 */
function requestNewQR() {
    console.log('[WhatsApp] Requesting new QR code...');
    retryCount = 0;
    if (sock) {
        try {
            sock.end(new Error('QR re-request'));
        } catch {
            // Ignore close errors
        }
    }
    // Clear session for fresh QR
    const fs = require('fs');
    if (fs.existsSync(AUTH_DIR)) {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        console.log('[WhatsApp] Session cleared. Will generate new QR on reconnect.');
    }
    setTimeout(connectToWhatsApp, 2000);
}

/**
 * Get the current WhatsApp connection status string.
 * @returns {string}
 */
function getStatus() {
    return connectionStatus;
}

/**
 * Check if WhatsApp is currently connected.
 * @returns {boolean}
 */
function isConnected() {
    return connectionStatus === '🟢 Connected';
}

module.exports = {
    initWhatsApp,
    sendToChannel,
    requestNewQR,
    getStatus,
    isConnected,
};
