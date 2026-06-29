import TelegramBot from "node-telegram-bot-api";
import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

/* ================== TELEGRAM BOT ================== */
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

/* ================== GOOGLE AUTH ================== */
const auth = new google.auth.GoogleAuth({
  keyFile: "credentials.json",
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});

const sheets = google.sheets({
  version: "v4",
  auth,
});

/* ================== SHEET CONFIG ================== */
const SHEET_ID = "1nM60j3Bv1EuF1pSU5x4XUjaBGKmNvTDEhLCbS5KH4uU";
const SHEET_NAME = "Sheet1";

/* ================== ALERT CONFIG ================== */
// Telegram Chat ID
const ALERT_CHAT_ID = "5409675462";

// Store already alerted projects (prevents spam)
const alertedProjects = new Set();

/* ================== HELPER FUNCTION ================== */
function getHoursLeft(deadlineDate) {
  const now = new Date();
  const deadline = new Date(deadlineDate);
  return (deadline - now) / (1000 * 60 * 60);
}

/* ================== /info COMMAND ================== */
bot.onText(/\/info/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A2:D`,
    });

    const rows = response.data.values;

    if (!rows || rows.length === 0) {
      return bot.sendMessage(chatId, "⚠️ No data found in the sheet.");
    }

    let reply = "📋 *Project Deadline Information*\n\n";

    rows.forEach((row, index) => {
      reply += `${index + 1}.\n`;
      reply += `⚙️ Project Name: ${row[0] || "N/A"}\n`;
      reply += `👤 Client Name: ${row[1] || "N/A"}\n`;
      reply += `📅 Deadline Date: ${row[2] || "N/A"}\n`;
      reply += `🕒 Remaining Time: ${row[3] || "N/A"}\n\n`;
    });

    bot.sendMessage(chatId, reply, { parse_mode: "Markdown" });

  } catch (error) {
    console.error("Google Sheets Error:", error.message);
    bot.sendMessage(chatId, "❌ Failed to fetch info");
  }
});

/* ================== AUTO ALERT FUNCTION ================== */
async function checkDeadlinesAndAlert() {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A2:D`,
    });

    const rows = response.data.values;
    if (!rows) return;

    rows.forEach((row) => {
      const projectName = row[0];
      const clientName = row[1];
      const deadlineDate = row[2];

      if (!projectName || !deadlineDate) return;

      const hoursLeft = getHoursLeft(deadlineDate);

      // Create unique key to prevent duplicate alerts
      const alertKey = `${projectName}-${deadlineDate}`;

      // 🔴 OVERDUE
      if (hoursLeft < 0 && !alertedProjects.has(alertKey)) {
        bot.sendMessage(
          ALERT_CHAT_ID,
          `🔴 *Overdue Project*\n\n⚙️ ${projectName}\n👤 ${clientName}\n📅 Deadline: ${deadlineDate}`,
          { parse_mode: "Markdown" }
        );
        alertedProjects.add(alertKey);
      }

      // ⏰ Extend Needed (within 48 hours)
      else if (hoursLeft <= 48 && hoursLeft > 0 && !alertedProjects.has(alertKey)) {
        bot.sendMessage(
          ALERT_CHAT_ID,
          `⏰ *Extend Needed (Less than 2 Days left)*\n\n⚙️ ${projectName}\n👤 ${clientName}\n📅 Deadline: ${deadlineDate}`,
          { parse_mode: "Markdown" }
        );
        alertedProjects.add(alertKey);
      }
    });

  } catch (error) {
    console.error("Auto Alert Error:", error.message);
  }
}

/* ================== AUTO ALERT INTERVAL ================== */
// Runs every 30 minutes
setInterval(checkDeadlinesAndAlert, 30 * 60 * 1000);

/* ================== START LOG ================== */
console.log("🤖 Telegram bot is running with auto alerts...");
