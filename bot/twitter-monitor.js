#!/usr/bin/env node
/**
 * BobArcPay Twitter Bot — VPS polling script
 *
 * Monitors @bobarcpay mentions on Twitter/X using agent-twitter-client
 * (cookie-based auth, no paid API needed).
 *
 * Parses commands like:
 *   @bobarcpay send @alice 5
 *   @bobarcpay pay @alice 5 USDC
 *
 * Then calls the bobarcpay API to verify registration and trigger USDC transfer.
 *
 * Usage:
 *   node --env-file=.env bot/twitter-monitor.js
 *   # or with PM2:
 *   pm2 start bot/twitter-monitor.js --name bobarcpay-bot --env-file .env
 */

import { Scraper } from "agent-twitter-client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROCESSED_TWEETS_FILE = path.join(__dirname, "processed_tweets.json");

function loadProcessedTweets() {
  try {
    if (fs.existsSync(PROCESSED_TWEETS_FILE)) {
      const data = fs.readFileSync(PROCESSED_TWEETS_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("Failed to load processed tweets file, using empty list:", err.message);
  }
  return [];
}

function saveProcessedTweet(tweetId) {
  try {
    const list = loadProcessedTweets();
    if (!list.includes(tweetId)) {
      list.push(tweetId);
      // Keep list length under control, e.g. last 1000 tweets
      if (list.length > 1000) {
        list.shift();
      }
      fs.writeFileSync(PROCESSED_TWEETS_FILE, JSON.stringify(list, null, 2), "utf8");
    }
  } catch (err) {
    console.error("Failed to save processed tweet:", err.message);
  }
}

// ─── Config ───────────────────────────────────────────────────────────────────

const BOBARCPAY_API_URL = process.env.BOBARCPAY_API_URL?.replace(/\/$/, "");
const BOT_AGENT_SECRET = process.env.BOB_AGENT_SECRET;
const TWITTER_COOKIES_RAW = process.env.TWITTER_COOKIES;
const TWITTER_USERNAME = (process.env.TWITTER_USERNAME ?? "bobarcpay").toLowerCase();

const POLL_INTERVAL_MS = 90_000; // 90 seconds — stay well within rate limits
const MAX_MENTIONS_PER_POLL = 20;
const MAX_AMOUNT_USDC = 10; // Safety cap per tweet
const STARTUP_LOOKBACK_MS = 5 * 60 * 1000; // Only process tweets from the last 5min on startup

// Matches: "send @alice 5", "pay @alice 5.50 usdc", or "send 5" (case-insensitive)
const PAYMENT_REGEX = /(?:send|pay)(?:\s+@([\w]+))?\s+([\d]+(?:\.[\d]{1,6})?)/i;

// ─── Validation ───────────────────────────────────────────────────────────────

function validateConfig() {
  const missing = [];
  if (!BOBARCPAY_API_URL) missing.push("BOBARCPAY_API_URL");
  if (!BOT_AGENT_SECRET) missing.push("BOB_AGENT_SECRET");
  if (!TWITTER_COOKIES_RAW) missing.push("TWITTER_COOKIES");
  if (missing.length > 0) {
    console.error(`❌ Missing required env vars: ${missing.join(", ")}`);
    process.exit(1);
  }
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function lookupHandle(handle) {
  const res = await fetch(
    `${BOBARCPAY_API_URL}/api/public/bot/lookup?handle=${encodeURIComponent(handle)}`,
    { headers: { Authorization: `Bearer ${BOT_AGENT_SECRET}` } },
  );
  if (!res.ok) throw new Error(`lookup HTTP ${res.status}`);
  return res.json(); // { registered: boolean, wallet_address?: string }
}

async function sendPayment(toHandle, amountUsdc, tweetId) {
  const res = await fetch(`${BOBARCPAY_API_URL}/api/public/bot/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${BOT_AGENT_SECRET}`,
    },
    body: JSON.stringify({
      to_handle: toHandle,
      amount_usdc: amountUsdc,
      tweet_id: tweetId,
    }),
  });
  const data = await res.json();
  if (!res.ok && res.status !== 409) {
    throw new Error(data.error ?? `send HTTP ${res.status}`);
  }
  return { status: res.status, ...data }; // { tx_hash, explorer_url } or { error }
}

// ─── Main loop ────────────────────────────────────────────────────────────────

async function processMention(scraper, tweet) {
  const text = tweet.text ?? "";
  const tweetId = tweet.id;
  const authorHandle = (tweet.username ?? "").toLowerCase();

  // Skip own tweets
  if (authorHandle === TWITTER_USERNAME) return;

  const match = text.match(PAYMENT_REGEX);
  if (!match) return;

  const [, explicitHandle, amountStr] = match;
  const amountUsdc = parseFloat(amountStr);

  let toHandle = explicitHandle;

  if (!toHandle) {
    if (tweet.inReplyToStatusId) {
      try {
        const parentTweet = await scraper.getTweet(tweet.inReplyToStatusId);
        if (parentTweet && parentTweet.username) {
          toHandle = parentTweet.username;
        }
      } catch (err) {
        console.error(`Failed to fetch parent tweet ${tweet.inReplyToStatusId}:`, err.message);
      }
    }
  }

  if (!toHandle) {
    console.log(`⏭️  No recipient handle found (not a reply and no explicit handle) — skipping`);
    return;
  }

  toHandle = toHandle.toLowerCase();

  const processedTweets = loadProcessedTweets();
  if (processedTweets.includes(tweetId)) {
    console.log(`⏭️  Tweet ${tweetId} already processed (found in local database) — skipping`);
    return;
  }

  console.log(
    `\n📨 Mention from @${authorHandle}: send @${toHandle} ${amountUsdc} USDC (tweet: ${tweetId})`,
  );

  // Safety cap
  if (amountUsdc <= 0 || amountUsdc > MAX_AMOUNT_USDC) {
    const errMsg = `❌ Amount must be between 0.000001 and ${MAX_AMOUNT_USDC} USDC`;
    console.log(errMsg);
    try {
      await scraper.sendTweet(
        `@${authorHandle} ${errMsg} (max ${MAX_AMOUNT_USDC} USDC per transaction)`,
        tweetId,
      );
    } catch (e) {
      console.error("Failed to reply:", e.message);
    }
    saveProcessedTweet(tweetId);
    return;
  }

  // Check if recipient is registered
  let lookup;
  try {
    lookup = await lookupHandle(toHandle);
  } catch (e) {
    console.error(`Lookup failed for @${toHandle}:`, e.message);
    return;
  }

  if (!lookup.registered) {
    const msg = `@${authorHandle} ❌ @${toHandle} isn't registered. Please register your wallet on bobarcpay.vercel.app`;
    console.log(msg);
    try {
      await scraper.sendTweet(msg, tweetId);
    } catch (e) {
      console.error("Failed to reply:", e.message);
    }
    saveProcessedTweet(tweetId);
    return;
  }

  // Trigger payment
  let result;
  try {
    result = await sendPayment(toHandle, amountUsdc, tweetId);
  } catch (e) {
    console.error(`Payment failed:`, e.message);
    try {
      await scraper.sendTweet(
        `@${authorHandle} ⚠️ Transfer failed — please try again later.`,
        tweetId,
      );
    } catch (replyErr) {
      console.error("Failed to reply:", replyErr.message);
    }
    return;
  }

  if (result.status === 409) {
    console.log(`⏭️  Tweet ${tweetId} already processed (server returned 409) — skipping`);
    saveProcessedTweet(tweetId);
    return;
  }

  // Success reply
  const successMsg =
    `@${authorHandle} ✅ Sent ${amountUsdc} USDC to @${toHandle} on Arc Testnet!\n` +
    `🔗 ${result.explorer_url}`;
  console.log(`✅ ${successMsg}`);
  try {
    await scraper.sendTweet(successMsg, tweetId);
  } catch (e) {
    console.error("Failed to send success reply:", e.message);
  }
  saveProcessedTweet(tweetId);
}

async function pollMentions(scraper, lastProcessedId, isFirstRun) {
  let mentions;
  try {
    mentions = await scraper.getMentionsAndReplies(TWITTER_USERNAME, MAX_MENTIONS_PER_POLL);
    if (!mentions || mentions.length === 0) {
      console.log(`[${new Date().toISOString()}] No new mentions`);
      return lastProcessedId;
    }
  } catch (e) {
    console.error("Failed to fetch mentions:", e.message);
    return lastProcessedId;
  }

  // Process in chronological order (oldest first)
  const sorted = [...mentions].reverse();
  const cutoffTime = isFirstRun ? Date.now() - STARTUP_LOOKBACK_MS : 0;
  let newLastId = lastProcessedId;

  const processedTweets = loadProcessedTweets();

  for (const tweet of sorted) {
    // Skip tweets we've already seen
    if (lastProcessedId && tweet.id <= lastProcessedId) continue;
    if (processedTweets.includes(tweet.id)) {
      newLastId = tweet.id;
      continue;
    }

    // On startup, skip old tweets to avoid replaying history
    const tweetTime = tweet.timeParsed ? new Date(tweet.timeParsed).getTime() : 0;
    if (isFirstRun && tweetTime < cutoffTime) {
      newLastId = tweet.id;
      continue;
    }

    await processMention(scraper, tweet);
    newLastId = tweet.id;
  }

  return newLastId;
}

async function main() {
  validateConfig();

  console.log("🚀 BobArcPay Twitter Bot starting...");
  console.log(`   API: ${BOBARCPAY_API_URL}`);
  console.log(`   Polling every ${POLL_INTERVAL_MS / 1000}s`);

  // Initialize Twitter scraper with saved cookies
  const scraper = new Scraper();
  const cookies = [];
  for (const c of JSON.parse(TWITTER_COOKIES_RAW)) {
    const name = c.key || c.name;
    const value = c.value;
    const path = c.path || "/";
    cookies.push(`${name}=${value}; Domain=.twitter.com; Path=${path}; Secure; HttpOnly`);
  }
  await scraper.setCookies(cookies);

  // Verify login
  const isLoggedIn = await scraper.isLoggedIn();
  if (!isLoggedIn) {
    console.error("❌ Twitter authentication failed. Check TWITTER_COOKIES in .env");
    process.exit(1);
  }
  console.log(`✅ Authenticated as @${TWITTER_USERNAME} on Twitter`);

  let lastProcessedId = undefined;
  let isFirstRun = true;

  // Main polling loop
  while (true) {
    try {
      console.log(`\n[${new Date().toISOString()}] Checking mentions...`);
      lastProcessedId = await pollMentions(scraper, lastProcessedId, isFirstRun);
      isFirstRun = false;
    } catch (err) {
      console.error("Poll loop error:", err);
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
