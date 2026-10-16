// Builds the Express app but does NOT call listen(), so tests can import it
// and send requests with Supertest without opening a real port.
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

// Only our own frontend may call this API from a browser.
app.use(cors({ origin: process.env.CLIENT_ORIGIN }));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Nothing above matched, so this is an unknown route.
app.use((req, res) => {
  res.status(404).json({ error: { message: `Route not found: ${req.method} ${req.path}` } });
});

app.use(errorHandler);

export default app;
