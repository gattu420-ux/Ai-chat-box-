// seed.js
// Standalone script to seed MongoDB Atlas with demo Accounts and Orders for PS12.
// Usage: node seed.js  (requires MONGO_URI in your environment / .env)

const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('MONGO_URI is not set. Add it to your environment or .env file.');
  process.exit(1);
}

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

const Account = mongoose.models.Account || mongoose.model('Account', accountSchema);
const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

const accountsData = [
  { name: 'Acme Corp', region: 'East', balance: 15000 },
  { name: 'Beta Traders', region: 'West', balance: 8200 },
  { name: 'Ganga Textiles', region: 'North', balance: 22500 },
  { name: 'Chennai Exports', region: 'South', balance: 11800 },
  { name: 'Delta Logistics', region: 'East', balance: 9750 },
  { name: 'Himalayan Foods', region: 'North', balance: 13400 },
  { name: 'Deccan Motors', region: 'South', balance: 27650 },
  { name: 'Konkan Traders', region: 'West', balance: 6300 },
];

const orderStatuses = ['pending', 'shipped', 'delivered', 'cancelled'];

function buildOrdersData(accounts) {
  const orders = [];
  const regions = ['North', 'South', 'East', 'West'];

  const orderTemplates = [
    { accountName: 'Acme Corp', region: 'East', amount: 500, status: 'delivered' },
    { accountName: 'Acme Corp', region: 'East', amount: 1200, status: 'pending' },
    { accountName: 'Beta Traders', region: 'West', amount: 750, status: 'shipped' },
    { accountName: 'Beta Traders', region: 'West', amount: 320, status: 'cancelled' },
    { accountName: 'Ganga Textiles', region: 'North', amount: 4200, status: 'delivered' },
    { accountName: 'Ganga Textiles', region: 'North', amount: 1850, status: 'shipped' },
    { accountName: 'Chennai Exports', region: 'South', amount: 2600, status: 'pending' },
    { accountName: 'Chennai Exports', region: 'South', amount: 990, status: 'delivered' },
    { accountName: 'Delta Logistics', region: 'East', amount: 1330, status: 'shipped' },
    { accountName: 'Himalayan Foods', region: 'North', amount: 610, status: 'delivered' },
    { accountName: 'Himalayan Foods', region: 'North', amount: 2050, status: 'pending' },
    { accountName: 'Deccan Motors', region: 'South', amount: 5400, status: 'delivered' },
    { accountName: 'Deccan Motors', region: 'South', amount: 3100, status: 'shipped' },
    { accountName: 'Konkan Traders', region: 'West', amount: 480, status: 'cancelled' },
    { accountName: 'Konkan Traders', region: 'West', amount: 1275, status: 'pending' },
  ];

  return orderTemplates;
}

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('[Seed] Connected to MongoDB');

    await Account.deleteMany({});
    await Order.deleteMany({});
    console.log('[Seed] Cleared existing Accounts and Orders');

    const accounts = await Account.insertMany(accountsData);
    console.log(`[Seed] Inserted ${accounts.length} accounts`);

    const ordersData = buildOrdersData(accounts);
    const orders = await Order.insertMany(ordersData);
    console.log(`[Seed] Inserted ${orders.length} orders`);

    console.log('[Seed] Done.');
    process.exit(0);
  } catch (err) {
    console.error('[Seed] Error:', err.message);
    process.exit(1);
  }
}

seed();
