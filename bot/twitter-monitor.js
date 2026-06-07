#!/usr/bin/env node
/**
 * BobArcPay Twitter Bot v7 — Fast Reply edition
 * Posts reply FIRST, then sends payment in background.
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROCESSED_FILE = join(__dirname, "processed_tweets.json");

// ── Config ──────────────────────────────────────────────────────────────────
const API_URL    = process.env.BOBARCPAY_API_URL || "https://bobarcpay.vercel.app";
const SECRET     = process.env.BOB_AGENT_SECRET || "";
const BOT_HANDLE = (process.env.TWITTER_USERNAME || "bobarcpay").toLowerCase();
const POLL_SEC   = parseInt(process.env.POLL_INTERVAL || "45", 10);
const TWITTER_CLI = process.env.TWITTER_CLI || "/root/.local/bin/twitter";
const MAX_AMOUNT = 10;

const WORKER_URL = "https://misty-meadow-70bf.ntraid03.workers.dev";
const BEARER     = "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
const AUTH_TOKEN = process.env.BOBARCPAY_AUTH_TOKEN || process.env.TWITTER_AUTH_TOKEN || "";
const CT0        = process.env.BOBARCPAY_CT0 || process.env.TWITTER_CT0 || "";

// ── Helpers ─────────────────────────────────────────────────────────────────

function loadProcessed() {
  try {
    if (existsSync(PROCESSED_FILE)) return JSON.parse(readFileSync(PROCESSED_FILE, "utf8"));
  } catch {}
  return [];
}

function saveProcessed(tweetId) {
  const list = loadProcessed();
  if (!list.includes(tweetId)) {
    list.push(tweetId);
    if (list.length > 1000) list.shift();
    writeFileSync(PROCESSED_FILE, JSON.stringify(list, null, 2));
  }
}

// ── Twitter CLI search ──────────────────────────────────────────────────────

function searchMentions() {
  try {
    const raw = execSync(`${TWITTER_CLI} search "@${BOT_HANDLE}" -n 20`, {
      encoding: "utf-8", timeout: 30000,
      env: { ...process.env, TWITTER_AUTH_TOKEN: AUTH_TOKEN, TWITTER_CT0: CT0 },
    });
    const tweets = [];
    const lines = raw.split("\n");
    let cur = null;
    for (const line of lines) {
      const idM = line.match(/^- id: '(\d+)'$/);
      if (idM) {
        if (cur) tweets.push(cur);
        cur = { id: idM[1], text: "", authorHandle: "", inReplyTo: null };
      }
      if (cur) {
        const tM = line.match(/^\s+text: '?(.*?)'?$/);
        const aM = line.match(/^\s+screenName: (\w+)$/);
        const replyM = line.match(/^\s+inReplyToStatusId: '(\d+)'$/);
        const replyScreenM = line.match(/^\s+inReplyToScreenName: (\w+)$/);
        if (tM) cur.text = tM[1];
        if (aM) cur.authorHandle = aM[1];
        if (replyM) cur.inReplyTo = replyM[1];
        if (replyScreenM) cur.inReplyToScreenName = replyScreenM[1];
      }
    }
    if (cur) tweets.push(cur);
    return tweets;
  } catch (e) {
    console.error("❌ Search error:", e.message.split("\n")[0]);
    return [];
  }
}

// ── Post reply via CF Worker ────────────────────────────────────────────────

async function postReply(tweetId, text) {
  if (!AUTH_TOKEN || !CT0) {
    console.error("  ❌ No cookies for posting");
    return false;
  }
  try {
    const resp = await fetch(`${WORKER_URL}/x/graphql/a1p9RWpkYKBjWv_I3WzS-A/CreateTweet`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${BEARER}`,
        "Content-Type": "application/json",
        "Cookie": `auth_token=${AUTH_TOKEN}; ct0=${CT0}`,
        "x-csrf-token": CT0,
      },
      body: JSON.stringify({
        variables: {
          tweet_text: text,
          reply: { in_reply_to_tweet_id: tweetId, exclude_reply_user_ids: [] },
          dark_request: false,
          media: { media_entities: [], possibly_sensitive: false },
          semantic_annotation_ids: [],
        },
        features: {
          tweetypie_unmention_optimization_enabled: true,
          responsive_web_text_conversations_enabled: false,
          tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
          interactive_text_enabled: true,
          responsive_web_edit_tweet_api_enabled: true,
          standardized_nudges_misinfo: true,
          responsive_web_enhance_cards_enabled: false,
        },
      }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    if (data.errors) throw new Error(JSON.stringify(data.errors[0]));
    const id = data?.data?.create_tweet?.tweet_results?.rest_id
            || data?.data?.create_tweet?.tweet_results?.result?.rest_id;
    console.log(`  📤 Reply posted: ${id}`);
    return true;
  } catch (e) {
    console.error("  ❌ Reply error:", e.message);
    return false;
  }
}

// ── BobArcPay API ───────────────────────────────────────────────────────────

async function lookupUser(handle) {
  try {
    const resp = await fetch(`${API_URL}/api/public/bot/lookup?handle=${handle}`, {
      headers: { "Authorization": `Bearer ${SECRET}` },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch (e) {
    console.error(`  ❌ Lookup @${handle}:`, e.message);
    return null;
  }
}

async function sendPayment(fromHandle, toHandle, amountUsdc, tweetId) {
  try {
    const resp = await fetch(`${API_URL}/api/public/bot/send`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from_handle: fromHandle,
        to_handle: toHandle,
        amount_usdc: amountUsdc,
        tweet_id: tweetId,
      }),
    });
    const data = await resp.json();
    if (!resp.ok && resp.status !== 409) throw new Error(data.error || `HTTP ${resp.status}`);
    return { status: resp.status, ...data };
  } catch (e) {
    console.error(`  ❌ Payment:`, e.message);
    return null;
  }
}

// ── Parse amount ────────────────────────────────────────────────────────────

function parsePayment(text) {
  const patterns = [
    /send\s+(?:@(\w+)\s+)?(\d+(?:\.\d+)?)\s*(?:usdc)?/i,
    /pay\s+(?:@(\w+)\s+)?(\d+(?:\.\d+)?)\s*(?:usdc)?/i,
    /(\d+(?:\.\d+)?)\s*usdc/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const handle = m[1] || null;
      const amount = parseFloat(m[2] || m[1]);
      if (amount > 0 && amount <= MAX_AMOUNT) return { handle, amount };
    }
  }
  return null;
}

// ── Main loop ───────────────────────────────────────────────────────────────

async function checkMentions() {
  const processed = loadProcessed();
  const tweets = searchMentions();

  if (tweets.length === 0) return;
  console.log(`  Found ${tweets.length} tweets`);

  for (const tweet of tweets) {
    if (processed.includes(tweet.id)) continue;
    if (tweet.authorHandle.toLowerCase() === BOT_HANDLE) continue;

    const text = tweet.text || "";
    if (!text.toLowerCase().includes(`@${BOT_HANDLE}`)) {
      saveProcessed(tweet.id);
      continue;
    }

    const payment = parsePayment(text);
    if (!payment) {
      saveProcessed(tweet.id);
      continue;
    }

    let toHandle = payment.handle;

    // If no explicit @handle, try parent tweet author from search results
    if (!toHandle) {
      if (tweet.inReplyToScreenName && tweet.inReplyToScreenName.toLowerCase() !== BOT_HANDLE) {
        toHandle = tweet.inReplyToScreenName;
        console.log(`  ✅ Parent from search: @${toHandle}`);
      }
    }

    // Fallback: first @mention in text that is not @bobarcpay
    if (!toHandle) {
      const mentionRegex = /@[a-zA-Z0-9_]+/g;
      let m;
      while ((m = mentionRegex.exec(text)) !== null) {
        const mention = m[0].substring(1);
        if (mention.toLowerCase() !== BOT_HANDLE) {
          toHandle = mention;
          break;
        }
      }
    }

    if (!toHandle) {
      await postReply(tweet.id, `@${tweet.authorHandle} ❌ Could not determine recipient. Use: @bobarcpay send @username 1 usdc`);
      saveProcessed(tweet.id);
      continue;
    }

    toHandle = toHandle.toLowerCase();
    const fromHandle = tweet.authorHandle.toLowerCase();
    console.log(`\n📨 @${fromHandle} → @${toHandle}: ${payment.amount} USDC`);

    // Lookup sender & recipient in parallel
    const [senderLookup, recipientLookup] = await Promise.all([
      lookupUser(fromHandle),
      lookupUser(toHandle),
    ]);

    if (!senderLookup?.registered) {
      console.log(`  ❌ Sender @${fromHandle} not registered`);
      await postReply(tweet.id, `@${fromHandle} ❌ You aren't registered on BobArcPay yet. Register at bobarcpay.vercel.app first!`);
      saveProcessed(tweet.id);
      continue;
    }

    if (!recipientLookup?.registered) {
      console.log(`  ❌ Recipient @${toHandle} not registered`);
      await postReply(tweet.id, `@${fromHandle} ❌ @${toHandle} isn't registered on BobArcPay yet. They need to register at bobarcpay.vercel.app first!`);
      saveProcessed(tweet.id);
      continue;
    }

    console.log(`  ✅ Sender: ${senderLookup.wallet_address} | Recipient: ${recipientLookup.wallet_address}`);

    // 🚀 POST REPLY FIRST (fast!), then send payment in background
    saveProcessed(tweet.id);
    await postReply(tweet.id, `@${tweet.authorHandle} ✅ Sent ${payment.amount} USDC to @${toHandle} on Arc Testnet!`);

    // Send payment in background (fire-and-forget)
    sendPayment(fromHandle, toHandle, payment.amount, tweet.id).then(result => {
      if (result?.tx_hash) {
        console.log(`  🎉 TX: ${result.tx_hash}`);
      } else {
        console.log(`  ⚠️ Payment failed for @${fromHandle} → @${toHandle}`);
      }
    }).catch(err => {
      console.error(`  ❌ Payment error:`, err.message);
    });
  }
}

// ── Entry point ─────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 BobArcPay Bot v7 starting...");
  console.log(`   API: ${API_URL}`);
  console.log(`   Handle: @${BOT_HANDLE}`);
  console.log(`   Poll: ${POLL_SEC}s`);
  console.log(`   Auth: ${AUTH_TOKEN ? "✅" : "❌"}`);
  console.log(`   Mode: Fast Reply (reply first, pay in background)`);

  if (!SECRET) { console.error("❌ BOB_AGENT_SECRET not set!"); process.exit(1); }

  while (true) {
    try {
      console.log(`\n🔍 [${new Date().toISOString()}] Searching...`);
      await checkMentions();
    } catch (e) {
      console.error("❌ Poll error:", e.message);
    }
    await new Promise(r => setTimeout(r, POLL_SEC * 1000));
  }
}

main();
