// Builds the Express app but does NOT call listen(), so tests can import it
// and send requests with Supertest without opening a real port.
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { currentUser } from './middleware/currentUser.js';
import { errorHandler } from './middleware/errorHandler.js';
import emailsRouter from './routes/emails.js';
import labelsRouter from './routes/labels.js';
import meRouter from './routes/me.js';

const app = express();

// Only our own frontend may call this API from a browser.
app.use(cors({ origin: process.env.CLIENT_ORIGIN }));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Everything below runs as the current user (req.userId).
app.use('/api', currentUser);
app.use('/api/me', meRouter);
app.use('/api/emails', emailsRouter);
app.use('/api/labels', labelsRouter);

// Nothing above matched, so this is an unknown route.
app.use((req, res) => {
  res.status(404).json({ error: { message: `Route not found: ${req.method} ${req.path}` } });
});

app.use(errorHandler);

export default app;
