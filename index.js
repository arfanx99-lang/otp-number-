// Created for Virtual SMS / Number Bot
require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const cron = require("node-cron");
const axios = require("axios");
const { Telegraf, Markup } = require("telegraf");
const { db, getDbSetting, setDbSetting } = require("./database");

const PORT = Number(process.env.PORT || 3000);
const TOKEN = process.env.TOKEN;
const ADMIN_ID = Number(process.env.ADMIN_ID || 1988380168);
const FIVESIM_API_KEY = process.env.FIVESIM_API_KEY || "eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE4MjE1MDA0NzgsImlhdCI6MTc4OTk2NDQ3OCwicmF5IjoiN2JiOGUwZjA4ODE3Mjg5ZjIyNDI3NDE4ZTJjYTlkOTEiLCJzdWIiOjQ0NjQ3NDF9.h5fPtGQF-wgy-6__TVDoHjF1awKn5sohFNIUUVrZpXwZIAtFvXtaoWF4fbSq1KS5G2MjxMqYYU7QOiD8D5bntYPI2bnkKJybHGfGLsgVxR7YBpwE4iXCESCe7Z66f0GzB5pXgG-Vny9HRuVeCXipROO98tjdzBbyxWu8Wu9cOlTagy2fdvX8jUnGXWfJLXTdZ4MqnQKQpFdTMdYkfzxv9YxYK-sjd6IHY7en-VQQ0grmHrg1KPMxka0ZVzqxwGsMUA6kt7hwe8H6tuvGZFL1G7LWbpLGEc3jKFzbBMATZLANc604FWEtc8g1GktSkSa8I6P0O70z7GQRFpoQmtwbTQ";

if (!TOKEN) {
  throw new Error("TOKEN is required in Environment Variables or .env");
}

const bot = new Telegraf(TOKEN);
const app = express();

// 5sim API Request Handler
async function call5sim(endpoint, method = "GET", data = null) {
  try {
    const response = await axios({
      method,
      url: `https://5sim.net/v1/${endpoint}`,
      headers: {
        Authorization: `Bearer ${FIVESIM_API_KEY}`,
        Accept: "application/json",
      },
      data,
    });
    return response.data;
  } catch (error) {
    console.error("5sim API Error:", error.response?.data || error.message);
    return null;
  }
}

// User Helpers
function registerUser(ctx) {
  const user = ctx.from;
  if (!user) return;
  db.prepare(`
    INSERT INTO users (telegram_id, username, first_name)
    VALUES (?, ?, ?)
    ON CONFLICT(telegram_id) DO UPDATE SET
      username = excluded.username,
      first_name = excluded.first_name
  `).run(user.id, user.username || null, user.first_name || null);
}

function getUser(telegramId) {
  return db.prepare("SELECT * FROM users WHERE telegram_id = ?").get(telegramId);
}

function isAdmin(telegramId) {
  return Number(telegramId) === ADMIN_ID;
}

// Main Bottom Reply Keyboard
function mainReplyKeyboard(ctx) {
  const buttons = [
    ["📱 নাম্বার কিনুন", "💰 ওয়ালেট"],
    ["📜 ইতিহাস", "💡 সাহায্য"],
  ];
  if (isAdmin(ctx.from?.id)) {
    buttons.push(["🛡️ অ্যাডমিন প্যানেল"]);
  }
  return Markup.keyboard(buttons).resize();
}

// Inline Service Menu
function serviceMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Telegram ($0.50)", "buy:telegram:bangladesh")],
    [Markup.button.callback("WhatsApp ($0.60)", "buy:whatsapp:bangladesh")],
    [Markup.button.callback("imo ($0.40)", "buy:imo:bangladesh")],
    [Markup.button.callback("Facebook ($0.45)", "buy:facebook:bangladesh")],
  ]);
}

// Set Left-Side Command Menu
async function setupBotCommands() {
  await bot.telegram.setMyCommands([
    { command: "start", description: "বট চালু করুন" },
    { command: "buy", description: "ভার্চুয়াল নাম্বার নিন" },
    { command: "balance", description: "আপনার ব্যালেন্স দেখুন" },
    { command: "history", description: "অর্ডার ইতিহাস" },
    { command: "help", description: "সাহায্য ও সাপোর্ট" },
    { command: "admin", description: "অ্যাডমিন প্যানেল" },
  ]);
}

// Bot Middleware
bot.use((ctx, next) => {
  if (ctx.from) {
    registerUser(ctx);
    const u = getUser(ctx.from.id);
    if (u?.is_banned) return ctx.reply("❌ আপনার অ্যাকাউন্টটি ব্যান করা হয়েছে।");
  }
  return next();
});

// Start Command
bot.start(async (ctx) => {
  const u = getUser(ctx.from.id);
  const text = `👋 **স্বাগতম Virtual Number Bot-এ!**\n\n💰 আপনার বর্তমান ওয়ালেট ব্যালেন্স: **$${u ? u.balance.toFixed(2) : "0.00"}**\n\nনিচের মেনু থেকে আপনার পছন্দমত সার্ভিস বেছে নিন:`;
  await ctx.replyWithMarkdown(text, mainReplyKeyboard(ctx));
});

bot.command("buy", (ctx) => {
  ctx.reply("📱 **সার্ভিস নির্বাচন করুন:**", serviceMenu());
});

bot.command("balance", (ctx) => {
  const u = getUser(ctx.from.id);
  ctx.reply(`💰 আপনার বর্তমান ব্যালেন্স: **$${u.balance.toFixed(2)}**`, { parse_mode: "Markdown" });
});

bot.command("history", (ctx) => {
  const orders = db.prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 5").all(ctx.from.id);
  if (!orders.length) return ctx.reply("📭 আপনি এখনো কোন অর্ডার করেননি।");
  let msg = "📜 **আপনার সর্বশেষ অর্ডারসমূহ:**\n\n";
  orders.forEach((o) => {
    msg += `🔹 **ID:** \`${o.order_id}\` | **সার্ভিস:** ${o.service}\n📱 **নাম্বার:** \`${o.phone}\`\n🔑 **OTP:** ${o.sms_code || "N/A"} | **স্ট্যাটাস:** ${o.status}\n\n`;
  });
  ctx.replyWithMarkdown(msg);
});

bot.command("help", (ctx) => {
  ctx.reply("💡 **সহায়তা:**\n\n১. '📱 নাম্বার কিনুন' বাটনে ক্লিক করে সার্ভিস নির্বাচন করুন।\n২. পাওয়ার পর নাম্বারে OTP পাঠালে '📩 কোড দেখুন' বাটনে চাপ দিন।\n৩. ব্যালেন্স এড করতে এডমিনকে মেসেজ দিন।");
});

// Bottom Keyboard Actions
bot.hears("📱 নাম্বার কিনুন", (ctx) => ctx.reply("📱 **সার্ভিস নির্বাচন করুন:**", serviceMenu()));
bot.hears("💰 ওয়ালেট", (ctx) => {
  const u = getUser(ctx.from.id);
  ctx.reply(`💰 আপনার ওয়ালেট ব্যালেন্স: **$${u.balance.toFixed(2)}**`, { parse_mode: "Markdown" });
});
bot.hears("📜 ইতিহাস", (ctx) => ctx.telegram.sendMessage(ctx.chat.id, "/history"));
bot.hears("💡 সাহায্য", (ctx) => ctx.telegram.sendMessage(ctx.chat.id, "/help"));
bot.hears("🛡️ অ্যাডমিন প্যানেল", (ctx) => showAdmin(ctx));

// Admin Actions
async function showAdmin(ctx) {
  if (!isAdmin(ctx.from.id)) return ctx.reply("❌ শুধুমাত্র অ্যাডমিনদের জন্য।");
  const menu = Markup.inlineKeyboard([
    [Markup.button.callback("📊 পরিসংখ্যান & API ব্যালেন্স", "admin:stats")],
    [Markup.button.callback("➕ ব্যালেন্স যোগ করুন", "admin:addbalance")],
  ]);
  await ctx.reply("⚙️ **অ্যাডমিন প্যানেল:**", { parse_mode: "Markdown", ...menu });
}

bot.command("admin", showAdmin);

// Callback Queries
bot.action(/^buy:(.+):(.+)$/, async (ctx) => {
  const [, service, country] = ctx.match;
  const price = service === "telegram" ? 0.5 : service === "whatsapp" ? 0.6 : 0.45;
  const u = getUser(ctx.from.id);

  if (u.balance < price) {
    return ctx.answerCbQuery("❌ পর্যাপ্ত ব্যালেন্স নেই! রিচার্জ করুন।", { show_alert: true });
  }

  await ctx.answerCbQuery("⏳ নাম্বার প্রসেস করা হচ্ছে...");
  const apiRes = await call5sim(`user/buy/activation/${country}/any/${service}`);

  if (apiRes && apiRes.phone) {
    db.prepare("UPDATE users SET balance = balance - ? WHERE telegram_id = ?").run(price, ctx.from.id);
    db.prepare("INSERT INTO orders (order_id, user_id, phone, service, cost) VALUES (?, ?, ?, ?, ?)").run(apiRes.id, ctx.from.id, apiRes.phone, service, price);

    const bannerText =
      `📱 **আপনার নাম্বার তৈরি হয়েছে!**\n\n` +
      `📞 **নাম্বার:** \`${apiRes.phone}\`\n` +
      `🛠 **সার্ভিস:** ${service.toUpperCase()}\n` +
      `🆔 **অর্ডার ID:** \`${apiRes.id}\`\n\n` +
      `-----------------------------------\n` +
      `⏳ **OTP স্ট্যাটাস:** কোডের জন্য অপেক্ষা করা হচ্ছে...\n` +
      `-----------------------------------`;

    const buttons = Markup.inlineKeyboard([
      [Markup.button.callback("🔄 OTP রিফ্রেশ / চেক করুন", `check:${apiRes.id}`)],
      [Markup.button.callback("❌ অর্ডার বাতিল করুন", `cancel:${apiRes.id}`)],
    ]);

    await ctx.editMessageText(bannerText, { parse_mode: "Markdown", ...buttons });
  } else {
    await ctx.reply("❌ এই মুহূর্তে নাম্বার পাওয়া যায়নি। কিছুক্ষণ পর আবার চেষ্টা করুন।");
  }
});

// Check OTP with Banner Format
bot.action(/^check:(\d+)$/, async (ctx) => {
  const orderId = ctx.match[1];
  const orderDetails = await call5sim(`user/check/${orderId}`);

  if (orderDetails && orderDetails.sms && orderDetails.sms.length > 0) {
    const code = orderDetails.sms[0].code;
    const fullSms = orderDetails.sms[0].text || "";

    db.prepare("UPDATE orders SET status = 'FINISHED', sms_code = ? WHERE order_id = ?").run(code, orderId);

    const bannerText =
      `📱 **আপনার নাম্বার মেসেজ**\n\n` +
      `📞 **নাম্বার:** \`${orderDetails.phone}\`\n` +
      `🆔 **অর্ডার ID:** \`${orderId}\`\n\n` +
      `==============================\n` +
      `📩 **RECEIVED OTP BANNER**\n` +
      `🔑 **OTP CODE:** \`${code}\`\n` +
      `💬 **SMS:** ${fullSms}\n` +
      `==============================`;

    await ctx.editMessageText(bannerText, { parse_mode: "Markdown" });
    await ctx.answerCbQuery("✅ OTP পেয়ে গেছেন!", { show_alert: true });
  } else {
    await ctx.answerCbQuery("⏳ এখনো OTP আসেনি, অনুগ্রহ করে অপেক্ষা করে আবার ট্রাই করুন।", { show_alert: true });
  }
});

// Cancel Order
bot.action(/^cancel:(\d+)$/, async (ctx) => {
  const orderId = ctx.match[1];
  const res = await call5sim(`user/cancel/${orderId}`);
  if (res) {
    db.prepare("UPDATE orders SET status = 'CANCELED' WHERE order_id = ?").run(orderId);
    await ctx.editMessageText("❌ **অর্ডার বাতিল করা হয়েছে।**", { parse_mode: "Markdown" });
  } else {
    await ctx.answerCbQuery("অর্ডার ক্যানসেল করা সম্ভব হয়নি।", { show_alert: true });
  }
});

// Admin Callbacks
bot.action("admin:stats", async (ctx) => {
  const profile = await call5sim("user/profile");
  const totalUsers = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  ctx.reply(`📊 **স্ট্যাটস:**\n\n👥 মোট ইউজার: ${totalUsers}\n💳 5sim অ্যাকাউন্ট ব্যালেন্স: ${profile?.balance || "N/A"} RUB`, { parse_mode: "Markdown" });
});

bot.action("admin:addbalance", (ctx) => {
  ctx.reply("💡 ইউজার ব্যালেন্স এড করতে এই কমান্ড দিন:\n`/addbalance [USER_ID] [AMOUNT]`\n\nউদাহরণ: `/addbalance 123456789 5.0`", { parse_mode: "Markdown" });
});

bot.command("addbalance", (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const args = ctx.message.text.split(" ");
  if (args.length < 3) return ctx.reply("সঠিক ফর্ম্যাট: `/addbalance [USER_ID] [AMOUNT]`", { parse_mode: "Markdown" });
  const targetId = Number(args[1]);
  const amount = Number(args[2]);
  db.prepare("UPDATE users SET balance = balance + ? WHERE telegram_id = ?").run(amount, targetId);
  ctx.reply(`✅ \`${targetId}\` অ্যাকাউন্টে **$${amount}** যোগ করা হয়েছে।`, { parse_mode: "Markdown" });
  bot.telegram.sendMessage(targetId, `🎉 আপনার ওয়ালেটে **$${amount}** ব্যালেন্স যোগ করা হয়েছে!`);
});

// Health Server
app.get("/", (_req, res) => res.json({ ok: true, bot: "5sim-sms-bot" }));
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));

// Launch
setupBotCommands().then(() => {
  bot.launch().then(() => console.log("Bot running with Menu & Keyboard settings!"));
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
