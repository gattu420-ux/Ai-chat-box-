// Local UI fixture only. No Gemini calls, credentials, or real database writes.
import express from 'express';
const app = express();
app.use(express.json());
app.get('/api', (_req, res) => res.json({ status: 'ok' }));
app.post('/api/chat/message', async (req, res) => {
  if (!req.body.sessionId || !req.body.message) return res.status(400).json({ error: 'sessionId and message required' });
  if (req.body.message.includes('slow')) await new Promise((resolve) => setTimeout(resolve, 2000));
  if (req.body.message.includes('error')) return res.status(503).json({ error: 'Local test: AI service is temporarily busy.' });
  const table = req.body.message.includes('table');
  console.log('Verified local fixture POST /api/chat/message with sessionId; status 200');
  res.json({ intent: 'query_data', responseType: table ? 'table' : 'card', routingSource: 'local_test_fixture',
    message: 'Local test reply: request received.',
    data: table ? [{ name: 'Example order', amount: 42 }, { name: 'Another order', amount: 0 }]
      : { accountName: 'Example account', region: 'West', balance: 0, active: false, contact: { city: 'Pune' } } });
});
app.use(express.static('dist'));
app.listen(5000, '127.0.0.1', () => console.log('Local test fixture listening on 127.0.0.1:5000'));
