#!/usr/bin/env node
/**
 * BobArcPay Twitter Bot v8.1 — Instant Reply + TX Link Follow-up
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROCESSED_FILE = join(__dirname, "processed_tweets.json");

const API_URL    = process.env.BOBARCPAY_API_URL || "https://bobarcpay.vercel.app";
const SECRET=process.env.BOB_AGENT_SECRET || "";
const BOT_HANDLE = (process.env.TWITTER_USERNAME || "bobarcpay").toLowerCase();
const POLL_SEC   = parseInt(process.env.POLL_INTERVAL || "45", 10);
const TWITTER_CLI = process.env.TWITTER_CLI || "/root/.local/bin/twitter";
const MAX_AMOUNT = 10;

const WORKER_URL = "https://misty-meadow-70bf.ntraid03.workers.dev";
const BEARER     = "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
const AUTH_TOKEN=process.env.BOBARCPAY_AUTH_TOKEN || process.env.TWITTER_AUTH_TOKEN || "";
const CT0=process.env.BOBARCPAY_CT0 || process.env.TWITTER_CT0 || "";

// ── Reply Templates ─────────────────────────────────────────────────────────

const T = [
  (f,t,a) => `@${f} sent ${a} USDC to @${t} ✨`,
  (f,t,a) => `@${f} -> @${t}: ${a} USDC delivered 🤝`,
  (f,t,a) => `done! ${a} USDC from @${f} to @${t} on its way`,
  (f,t,a) => `@${f} just sent @${t} ${a} USDC 🫡`,
  (f,t,a) => `${a} USDC sent from @${f} to @${t} 💸`,
  (f,t,a) => `@${f} -> @${t}: ${a} USDC ✅`,
  (f,t,a) => `payment sent! @${f} -> @${t}: ${a} USDC`,
  (f,t,a) => `@${t} received ${a} USDC from @${f} 🎉`,
  (f,t,a) => `@${f} just dropped ${a} USDC to @${t} 💰`,
  (f,t,a) => `confirmed: ${a} USDC @${f} -> @${t}`,
  (f,t,a) => `@${f} sent @${t} ${a} USDC on Arc 🚀`,
  (f,t,a) => `yo @${t} you got ${a} USDC from @${f}`,
  (f,t,a) => `@${f} -> @${t}: ${a} USDC transferred 🔄`,
  (f,t,a) => `@${t} check your wallet - ${a} USDC from @${f}`,
  (f,t,a) => `${a} USDC landed @${t} - sent by @${f} 🪙`,
  (f,t,a) => `@${f} paid @${t} ${a} USDC 💫`,
  (f,t,a) => `tx confirmed! @${f} -> @${t}: ${a} USDC`,
  (f,t,a) => `@${f} just sent @${t} ${a} USDC on-chain ⛓️`,
  (f,t,a) => `@${t} +${a} USDC from @${f} 💵`,
  (f,t,a) => `@${f} -> @${t}: ${a} USDC. done deal 🤙`,
  (f,t,a) => `@${t} ${a} USDC incoming from @${f} 📥`,
  (f,t,a) => `sent it! @${f} -> @${t}: ${a} USDC`,
  (f,t,a) => `@${f} transferred ${a} USDC to @${t} 🔥`,
  (f,t,a) => `@${t} just got ${a} USDC from @${f} 🫶`,
  (f,t,a) => `@${f} -> @${t}: ${a} USDC on Arc Testnet ⚡`,
  (f,t,a) => `boom @${f} sent @${t} ${a} USDC 💥`,
  (f,t,a) => `@${f} wired ${a} USDC to @${t} 🔗`,
  (f,t,a) => `@${t} received ${a} USDC from @${f} ✌️`,
  (f,t,a) => `@${f} -> @${t}: ${a} USDC sent your way 🫡`,
  (f,t,a) => `@${t} +${a} USDC from @${f} - enjoy! 🎊`,
];

// TX link templates
const TX_T = [
  (tx) => `tx: ${tx}`,
  (tx) => `🔗 ${tx}`,
  (tx) => `explorer: ${tx}`,
  (tx) => `check it: ${tx}`,
  (tx) => `${tx}`,
  (tx) => `view tx: ${tx}`,
  (tx) => `⛓️ ${tx}`,
];

const ERR = {
  no_sender: (f) => [
    `@${f} you need to register first! head to bobarcpay.vercel.app`,
    `@${f} looks like you are not registered yet. sign up at bobarcpay.vercel.app`,
  ],
  no_recipient: (f,t) => [
    `@${f} @${t} hasnt registered yet. they need to sign up at bobarcpay.vercel.app`,
    `@${f} looks like @${t} isnt on BobArcPay yet. tell them to register!`,
  ],
  no_target: (f) => [
    `@${f} cant figure out who to send to. try: @bobarcpay send @username 1 usdc`,
    `@${f} who should i send to? use: @bobarcpay send @username 1 usdc`,
  ],
  failed: (f) => [
    `@${f} something went wrong with the transfer - try again in a bit`,
    `@${f} transfer didnt go through, please try again later`,
  ],
};

const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// ── Helpers ─────────────────────────────────────────────────────────────────

function loadProcessed() {
  try { if (existsSync(PROCESSED_FILE)) return JSON.parse(readFileSync(PROCESSED_FILE, "utf8")); } catch {}
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
        cur = { id: idM[1], text: "", authorHandle: "", inReplyToScreenName: null };
      }
      if (cur) {
        const tM = line.match(/^\s+text: '?(.*?)'?$/);
        const aM = line.match(/^\s+screenName: (\w+)$/);
        const rM = line.match(/^\s+inReplyToScreenName: (\w+)$/);
        if (tM) cur.text = tM[1];
        if (aM) cur.authorHandle = aM[1];
        if (rM) cur.inReplyToScreenName = rM[1];
      }
    }
    if (cur) tweets.push(cur);
    return tweets;
  } catch (e) {
    console.error("Search error:", e.message.split("\n")[0]);
    return [];
  }
}

// ── Post reply via CF Worker ────────────────────────────────────────────────

async function postReply(tweetId, text) {
  if (!AUTH_TOKEN || !CT0) return false;
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
    const id = data?.data?.create_tweet?.tweet_results?.rest_id || data?.data?.create_tweet?.tweet_results?.result?.rest_id;
    console.log(`  Reply: ${id}`);
    return true;
  } catch (e) {
    console.error("  Reply error:", e.message);
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
  } catch (e) { return null; }
}

async function sendPayment(fromHandle, toHandle, amountUsdc, tweetId) {
  try {
    const resp = await fetch(`${API_URL}/api/public/bot/send`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from_handle: fromHandle, to_handle: toHandle, amount_usdc: amountUsdc, tweet_id: tweetId }),
    });
    const data = await resp.json();
    if (!resp.ok && resp.status !== 409) throw new Error(data.error || `HTTP ${resp.status}`);
    return { status: resp.status, ...data };
  } catch (e) {
    console.error("  Payment:", e.message);
    return null;
  }
}

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
    if (!text.toLowerCase().includes(`@${BOT_HANDLE}`)) { saveProcessed(tweet.id); continue; }

    const payment = parsePayment(text);
    if (!payment) { saveProcessed(tweet.id); continue; }

    let toHandle = payment.handle;
    if (!toHandle && tweet.inReplyToScreenName && tweet.inReplyToScreenName.toLowerCase() !== BOT_HANDLE) {
      toHandle = tweet.inReplyToScreenName;
    }
    if (!toHandle) {
      const re = /@[a-zA-Z0-9_]+/g;
      let m;
      while ((m = re.exec(text)) !== null) {
        const mention = m[0].substring(1);
        if (mention.toLowerCase() !== BOT_HANDLE) { toHandle = mention; break; }
      }
    }

    const fromHandle = tweet.authorHandle.toLowerCase();

    if (!toHandle) {
      await postReply(tweet.id, pick(ERR.no_target(fromHandle)));
      saveProcessed(tweet.id);
      continue;
    }

    toHandle = toHandle.toLowerCase();
    console.log(`\n  @${fromHandle} -> @${toHandle}: ${payment.amount} USDC`);

    const [sender, recipient] = await Promise.all([lookupUser(fromHandle), lookupUser(toHandle)]);

    if (!sender?.registered) {
      console.log(`  Sender not registered`);
      await postReply(tweet.id, pick(ERR.no_sender(fromHandle)));
      saveProcessed(tweet.id);
      continue;
    }

    if (!recipient?.registered) {
      console.log(`  Recipient not registered`);
      await postReply(tweet.id, pick(ERR.no_recipient(fromHandle, toHandle)));
      saveProcessed(tweet.id);
      continue;
    }

    console.log(`  Wallets OK`);

    // STEP 1: Reply instantly (unique template)
    saveProcessed(tweet.id);
    await postReply(tweet.id, pick(T)(fromHandle, toHandle, payment.amount));

    // STEP 2: Payment in background -> then reply with TX link
    sendPayment(fromHandle, toHandle, payment.amount, tweet.id).then(async (r) => {
      if (r?.explorer_url) {
        console.log(`  TX: ${r.tx_hash}`);
        // Post follow-up reply with TX link (reply to the ORIGINAL tweet)
        await postReply(tweet.id, pick(TX_T)(r.explorer_url));
      } else {
        console.log(`  Payment failed`);
        await postReply(tweet.id, pick(ERR.failed)(fromHandle));
      }
    }).catch(e => console.error(`  Payment error:`, e.message));
  }
}

async function main() {
  console.log("BobArcPay Bot v8.1 - Instant Reply + TX Follow-up");
  console.log(`  API: ${API_URL} | Handle: @${BOT_HANDLE} | Poll: ${POLL_SEC}s`);
  if (!SECRET) { console.error("BOB_AGENT_SECRET not set!"); process.exit(1); }

  while (true) {
    try {
      console.log(`\n  [${new Date().toISOString()}] Searching...`);
      await checkMentions();
    } catch (e) {
      console.error("Poll error:", e.message);
    }
    await new Promise(r => setTimeout(r, POLL_SEC * 1000));
  }
}

main();
