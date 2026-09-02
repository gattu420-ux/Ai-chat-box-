// api/index.js
// Single-file Express backend for PS12 - Universal AI Chat Interface
// Runs as a Vercel Serverless Function. CommonJS.

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { GoogleGenAI } = require('@google/genai');
const { createDatabaseConnector } = require('../server/database.cjs');
const { generateWithRetry, providerStatus } = require('../server/gemini.cjs');

// ---------------------------------------------------------------------------
// 1. Environment
// ---------------------------------------------------------------------------
const MONGO_URI = process.env.MONGO_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const PORT = process.env.PORT || 5000;

if (!MONGO_URI) console.warn('[WARN] MONGO_URI is not set.');
if (!GEMINI_API_KEY) console.warn('[WARN] GEMINI_API_KEY is not set.');

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY, httpOptions: { timeout: 10000 } });

// ---------------------------------------------------------------------------
// 2. MongoDB connection (cached across serverless invocations)
// ---------------------------------------------------------------------------
const mongoCache = globalThis.__relayMongoCache || (globalThis.__relayMongoCache = { promise: null });
const connectDB = createDatabaseConnector(mongoose, MONGO_URI, mongoCache);

// ---------------------------------------------------------------------------
// 3. Mongoose Models
// ---------------------------------------------------------------------------
const accountSchema = new mongoose.Schema({
  name: String,
  region: String,
  balance: Number,
  createdAt: { type: Date, default: Date.now },
});

const orderSchema = new mongoose.Schema({
  accountName: String,
  status: String,
  amount: Number,
  region: String,
  createdAt: { type: Date, default: Date.now },
});

const conversationHistorySchema = new mongoose.Schema({
  sessionId: String,
  role: String, // 'user' | 'assistant'
  message: String,
  timestamp: { type: Date, default: Date.now },
});

const Account = mongoose.models.Account || mongoose.model('Account', accountSchema);
const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);
const ConversationHistory =
  mongoose.models.ConversationHistory ||
  mongoose.model('ConversationHistory', conversationHistorySchema);

// ---------------------------------------------------------------------------
// 4. Gemini intent classification
// ---------------------------------------------------------------------------
const INTENT_SYSTEM_INSTRUCTION = `
You are the intent router for a unified AI chat interface that sits in front of a MongoDB-backed data platform (Orders, Accounts) and a mocked third-party payment gateway.

Classify the user's latest message into EXACTLY one JSON object with this schema, and output ONLY valid JSON (no markdown fences, no commentary):

{
  "intent": "query_data" | "analytics" | "mutate_data" | "run_function" | "clarify" | "answer_question",
  "target": "orders" | "accounts" | "payment_gateway" | "none",
  "filters": { "region": string or null, "status": string or null, "minAmount": number or null },
  "clarificationQuestion": string or null,
  "answer": string or null
}

Guidance:
- "query_data": user wants to see/list/find records (orders or accounts), optionally filtered.
- "analytics": user wants aggregated/summary numbers, totals, breakdowns, or a chart (e.g. "revenue by region").
- "mutate_data": user wants to create/add/insert a new order or account.
- "run_function": user asks about payment gateway / payment status / external service status.
- "clarify": the request is ambiguous or missing critical info needed to act (e.g. unclear which entity, unclear filter). Set clarificationQuestion to a short, specific question.
- "answer_question": general question not requiring data access (e.g. "what can you do?"). Put a concise, helpful answer in "answer" (1-3 sentences). For other intents set "answer" to null. Never invent database records in an answer.
- Use the recent conversation history to resolve references like "that", "those", "now filter by X". If a follow-up narrows an earlier query, carry over unmentioned filters from context when it's clearly a refinement.
- Region values should be normalized to one of: "North", "South", "East", "West" when identifiable, else null.
- Status values (for orders) should be normalized to one of: "pending", "shipped", "delivered", "cancelled" when identifiable, else null.
- Never invent data. Only extract what the user (or clear context) actually implies.
`.trim();

async function classifyIntent(message, history) {
  const contents = [
    ...history.map((h) => ({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: h.message }],
    })),
    { role: 'user', parts: [{ text: message }] },
  ];

  const response = await generateWithRetry(ai, {
    model: GEMINI_MODEL,
    contents,
    config: {
      systemInstruction: INTENT_SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      maxOutputTokens: 768,
      thinkingConfig: { thinkingLevel: 'minimal' },
    },
  });

  const raw = response.text?.trim() || '{}';

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid intent object');
    return parsed;
  } catch (err) {
    console.error('[Gemini] Failed to parse intent JSON:', raw);
    return {
      intent: 'clarify',
      target: 'none',
      filters: { region: null, status: null, minAmount: null },
      clarificationQuestion: "I couldn't quite understand that — could you rephrase your request?",
    };
  }
}

async function answerGeneralQuestion(message, history) {
  const contents = [
    ...history.map((h) => ({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: h.message }],
    })),
    { role: 'user', parts: [{ text: message }] },
  ];

  const response = await generateWithRetry(ai, {
    model: GEMINI_MODEL,
    contents,
    config: {
      systemInstruction:
        'You are a helpful assistant embedded in a unified data-chat interface. Answer concisely and clearly in 1-3 sentences.',
      maxOutputTokens: 512,
      thinkingConfig: { thinkingLevel: 'minimal' },
    },
  });

  return response.text?.trim() || "I'm not sure how to answer that.";
}

// ---------------------------------------------------------------------------
// 5. Helpers
// ---------------------------------------------------------------------------
function buildMongoFilter(filters = {}) {
  const query = {};
  if (filters.region) query.region = filters.region;
  if (filters.status) query.status = filters.status;
  if (filters.minAmount !== null && filters.minAmount !== undefined) {
    query.amount = { $gte: filters.minAmount };
  }
  return query;
}

const REGIONS = ['North', 'South', 'East', 'West'];
const STATUSES = ['pending', 'shipped', 'delivered', 'cancelled'];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---------------------------------------------------------------------------
// 6. Intent Dispatcher
// ---------------------------------------------------------------------------
async function dispatchIntent(classification) {
  const { intent, target, filters, clarificationQuestion } = classification;

  switch (intent) {
    case 'query_data': {
      const mongoFilter = buildMongoFilter(filters);
      const Model = target === 'accounts' ? Account : Order;
      const docs = await Model.find(mongoFilter).sort({ createdAt: -1 }).limit(50).lean();
      return {
        intent,
        responseType: 'table',
        routingSource: `MongoDB Atlas (${target === 'accounts' ? 'Accounts' : 'Orders'} Query)`,
        message: `Found ${docs.length} ${target === 'accounts' ? 'account(s)' : 'order(s)'} matching your request.`,
        data: docs,
      };
    }

    case 'analytics': {
      const matchStage = {};
      if (filters?.region) matchStage.region = filters.region;
      if (filters?.status) matchStage.status = filters.status;

      const pipeline = [];
      if (Object.keys(matchStage).length) pipeline.push({ $match: matchStage });
      pipeline.push(
        { $group: { _id: '$region', totalRevenue: { $sum: '$amount' } } },
        { $sort: { _id: 1 } }
      );

      const results = await Order.aggregate(pipeline);
      const labels = results.map((r) => r._id || 'Unknown');
      const values = results.map((r) => r.totalRevenue);

      return {
        intent,
        responseType: 'chart',
        routingSource: 'MongoDB Aggregation Pipeline',
        message: 'Here is the revenue breakdown by region.',
        data: { chartType: 'bar', labels, values },
      };
    }

    case 'run_function': {
      return {
        intent,
        responseType: 'text',
        routingSource: 'Payment Gateway Stub API',
        message: 'Stripe Payment Gateway: Operational - 99.98% uptime, latency 42ms',
        data: null,
      };
    }

    case 'mutate_data': {
      if (target === 'accounts') {
        const newAccount = await Account.create({
          name: `New Account ${Date.now()}`,
          region: filters?.region || pick(REGIONS),
          balance: filters?.minAmount || Math.floor(Math.random() * 10000),
        });
        return {
          intent,
          responseType: 'confirmation',
          routingSource: 'MongoDB Atlas (Write)',
          message: `Created new account "${newAccount.name}" in ${newAccount.region}.`,
          data: newAccount,
        };
      }

      const newOrder = await Order.create({
        accountName: `Account ${Date.now()}`,
        status: filters?.status || pick(STATUSES),
        amount: filters?.minAmount || Math.floor(Math.random() * 5000),
        region: filters?.region || pick(REGIONS),
      });
      return {
        intent,
        responseType: 'confirmation',
        routingSource: 'MongoDB Atlas (Write)',
        message: `Created new order for "${newOrder.accountName}" in ${newOrder.region}.`,
        data: newOrder,
      };
    }

    case 'clarify': {
      return {
        intent,
        responseType: 'text',
        routingSource: 'Context Router',
        message: clarificationQuestion || 'Could you clarify your request?',
        data: null,
      };
    }

    case 'answer_question':
    default: {
      return null; // handled separately since it needs the raw message/history
    }
  }
}

// ---------------------------------------------------------------------------
// 7. Express App
// ---------------------------------------------------------------------------
const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/chat/message', async (req, res) => {
  let checkpoint = performance.now();
  const timings = [];
  const markTiming = (name) => {
    const now = performance.now();
    timings.push(`${name};dur=${(now - checkpoint).toFixed(1)}`);
    checkpoint = now;
  };
  try {
    const { sessionId, message } = req.body || {};

    if (typeof sessionId !== 'string' || !sessionId.trim() || sessionId.length > 128 ||
        typeof message !== 'string' || !message.trim() || message.length > 20000) {
      return res.status(400).json({ error: 'A sessionId (up to 128 characters) and message (up to 20,000 characters) are required.' });
    }

    await connectDB();
    markTiming('db_connect');

    // Step A: fetch last 6 messages for context
    const historyDocs = await ConversationHistory.find({ sessionId })
      .sort({ timestamp: -1, _id: -1 })
      .limit(6)
      .lean();
    const history = historyDocs.reverse(); // chronological order
    markTiming('history');

    // Step B: classify intent
    const classification = await classifyIntent(message, history);
    markTiming('classify');

    // Step C: dispatch
    let result = await dispatchIntent(classification);

    if (!result) {
      // answer_question path
      const answer = typeof classification.answer === 'string' && classification.answer.trim()
        ? classification.answer.trim()
        : await answerGeneralQuestion(message, history);
      result = {
        intent: 'answer_question',
        responseType: 'text',
        routingSource: 'Gemini (General Answer)',
        message: answer,
        data: null,
      };
    }

    markTiming('dispatch');
    // Step D: persist conversation
    await ConversationHistory.insertMany([
      { sessionId, role: 'user', message },
      { sessionId, role: 'assistant', message: result.message },
    ]);
    markTiming('save');
    res.set('Server-Timing', timings.join(', '));

    // Step E: unified response
    return res.json({
      intent: result.intent,
      responseType: result.responseType,
      routingSource: result.routingSource,
      message: result.message,
      data: result.data ?? null,
    });
  } catch (err) {
    console.error('[POST /api/chat/message] Error:', err);
    if ([429, 502, 503, 504].includes(providerStatus(err))) {
      res.set('Retry-After', '2');
      return res.status(503).json({ error: 'The AI service is temporarily busy. Please try again shortly.' });
    }
    return res.status(500).json({ error: 'Unable to complete the reply. Please try again.' });
  }
});

// ---------------------------------------------------------------------------
// 8. Local dev listener (skipped on Vercel)
// ---------------------------------------------------------------------------
if (!process.env.VERCEL) {
  connectDB()
    .then(() => {
      app.listen(PORT, () => console.log(`[Server] Listening on port ${PORT}`));
    })
    .catch((err) => {
      console.error('[Server] Failed to start:', err.message);
      process.exit(1);
    });
}

module.exports = app;
