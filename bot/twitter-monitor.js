#!/usr/bin/env node
/**
 * BobArcPay Twitter Bot v5 — VPS edition (Fixed)
 * Search: `twitter` CLI | Reply: CF Worker + cookies | Payment: BobArcPay API
 *
 * v5 fixes:
 * - Fixed fallback @mention detection (was skipping even when handle found)
 * - Better logging for debugging
 * - Removed agent-twitter-client dependency entirely
 * - Fixed TweetDetail Cookie / CSRF headers (resolving 403 Forbidden)
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

// Cloudflare Worker proxy for posting as @bobarcpay
const WORKER_URL = "https://misty-meadow-70bf.ntraid03.workers.dev";
const BEARER     = "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
const AUTH_TOKEN = process.env.BOBARCPAY_AUTH_TOKEN || process.env.TWITTER_AUTH_TOKEN || "";
const CT0        = process.env.BOBARCPAY_CT0 || process.env.TWITTER_CT0 || "";
const COOKIES    = process.env.TWITTER_COOKIES || "";

// ── Processed tweets persistence ────────────────────────────────────────────

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
      env: {
        ...process.env,
        TWITTER_AUTH_TOKEN: AUTH_TOKEN,
        TWITTER_CT0: CT0,
      },
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
        if (tM) cur.text = tM[1];
        if (aM) cur.authorHandle = aM[1];
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
    console.error("  ❌ No @bobarcpay cookies for posting");
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
    const id = data?.data?.create_tweet?.tweet_results?.rest_id;
    console.log(`  📤 Reply posted: ${id}`);
    return true;
  } catch (e) {
    console.error("  ❌ Reply error:", e.message);
    return false;
  }
}

// ── Get parent tweet author via CF Worker ───────────────────────────────────

async function getParentTweetAuthor(tweetId) {
  try {
    const vars = encodeURIComponent(JSON.stringify({ focalTweetId: tweetId, with_rux_injections: false }));
    const feats = encodeURIComponent(JSON.stringify({ rweb_tipjar_consumption_enabled: true }));
    const resp = await fetch(`${WORKER_URL}/x/graphql/Hyz1lE8Jv2ACQs1cXjUQjg/TweetDetail?variables=${vars}&features=${feats}`, {
      headers: {
        "Authorization": `Bearer ${BEARER}`,
        "Content-Type": "application/json",
        "Cookie": `auth_token=${AUTH_TOKEN}; ct0=${CT0}`,
        "x-csrf-token": CT0,
      },
    });
    if (!resp.ok) {
      console.log(`  ⚠️ TweetDetail HTTP ${resp.status}`);
      return null;
    }
    const data = await resp.json();
    if (data.errors) {
      console.log(`  ⚠️ TweetDetail error:`, JSON.stringify(data.errors[0]).substring(0, 200));
      return null;
    }
    // Find the parent tweet in the thread
    const entries = data?.data?.threaded_conversation_with_injections_v2?.instructions || [];
    for (const inst of entries) {
      for (const e of (inst.entries || [])) {
        let t = e?.content?.itemContent?.tweet_results?.result;
        if (t && t.__typename === "TweetWithVisibilityResults") {
          t = t.tweet;
        }
        if (t?.legacy?.id_str === tweetId && t.legacy.in_reply_to_status_id_str) {
          // Check if parent screen name is present in the tweet metadata directly
          if (t.legacy.in_reply_to_screen_name) {
            return t.legacy.in_reply_to_screen_name;
          }
          // Fallback: search the thread for the parent tweet
          const parentId = t.legacy.in_reply_to_status_id_str;
          for (const e2 of (inst.entries || [])) {
            let t2 = e2?.content?.itemContent?.tweet_results?.result;
            if (t2 && t2.__typename === "TweetWithVisibilityResults") {
              t2 = t2.tweet;
            }
            if (t2?.legacy?.id_str === parentId) {
              return t2?.core?.user_results?.result?.legacy?.screen_name || null;
            }
          }
        }
      }
    }
    return null;
  } catch (e) {
    console.log(`  ⚠️ TweetDetail exception:`, e.message);
    return null;
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

async function sendPayment(handle, amountUsdc, tweetId) {
  try {
    const resp = await fetch(`${API_URL}/api/public/bot/send`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to_handle: handle, amount_usdc: amountUsdc, tweet_id: tweetId }),
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

    // If no explicit @handle in "send X" pattern, try parent tweet author
    if (!toHandle) {
      console.log(`  🔍 No explicit handle in send command, checking parent tweet...`);
      toHandle = await getParentTweetAuthor(tweet.id);
      if (toHandle) console.log(`  ✅ Found parent tweet author: @${toHandle}`);
    }

    // Fallback: first @mention in text that is not @bobarcpay
    if (!toHandle) {
      console.log(`  🔍 Trying fallback @mention detection...`);
      const mentionRegex = /@[a-zA-Z0-9_]+/g;
      let m;
      while ((m = mentionRegex.exec(text)) !== null) {
        const mention = m[0].substring(1);
        if (mention.toLowerCase() !== BOT_HANDLE) {
          toHandle = mention;
          console.log(`  ✅ Found fallback mention: @${toHandle}`);
          break;
        }
      }
    }

    // If still no recipient — skip with error message
    if (!toHandle) {
      console.log(`  ⏭️ No recipient found — skipping`);
      await postReply(tweet.id, `@${tweet.authorHandle} ❌ Could not determine recipient. Please use: @bobarcpay send @username 1 usdc`);
      saveProcessed(tweet.id);
      continue;
    }

    toHandle = toHandle.toLowerCase();
    console.log(`\n📨 @${tweet.authorHandle} → @${toHandle}: ${payment.amount} USDC`);

    // Lookup
    const lookup = await lookupUser(toHandle);
    if (!lookup) {
      saveProcessed(tweet.id);
      continue;
    }

    if (!lookup.registered) {
      console.log(`  ❌ @${toHandle} not registered`);
      await postReply(tweet.id, `@${tweet.authorHandle} ❌ @${toHandle} isn't registered on BobArcPay yet. They need to register at bobarcpay.vercel.app first!`);
      saveProcessed(tweet.id);
      continue;
    }

    console.log(`  ✅ Wallet: ${lookup.wallet_address}`);

    // Send payment
    const result = await sendPayment(toHandle, payment.amount, tweet.id);
    if (!result) {
      await postReply(tweet.id, `@${tweet.authorHandle} ⚠️ Transfer failed — please try again later.`);
      saveProcessed(tweet.id);
      continue;
    }

    if (result.status === 409) {
      console.log(`  ⏭️ Already processed (409)`);
      saveProcessed(tweet.id);
      continue;
    }

    console.log(`  🎉 Sent! TX: ${result.tx_hash}`);
    await postReply(tweet.id, `@${tweet.authorHandle} ✅ Sent ${payment.amount} USDC to @${toHandle} on Arc Testnet!\n🔗 ${result.explorer_url}`);
    saveProcessed(tweet.id);
  }
}

// ── Entry point ─────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 BobArcPay Bot v5 starting...");
  console.log(`   API: ${API_URL}`);
  console.log(`   Handle: @${BOT_HANDLE}`);
  console.log(`   Poll: ${POLL_SEC}s`);
  console.log(`   Auth: ${AUTH_TOKEN ? "✅" : "❌"}`);
  console.log(`   CLI: ${TWITTER_CLI}`);

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
