import request from 'supertest';
import app from '../src/app.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { resetDb, pool } from './testDb.js';

beforeEach(resetDb);
afterAll(() => pool.end());

test('GET /api/health returns ok', async () => {
  const res = await request(app).get('/api/health');

  expect(res.status).toBe(200);
  expect(res.body).toEqual({ status: 'ok' });
});

test('unknown routes return a 404 JSON error', async () => {
  const res = await request(app).get('/api/does-not-exist');

  expect(res.status).toBe(404);
  expect(res.headers['content-type']).toMatch(/json/);
  expect(res.body.error.message).toBe('Route not found: GET /api/does-not-exist');
});

test('GET /api/me returns the demo user with their inbox unread count', async () => {
  const res = await request(app).get('/api/me');

  expect(res.status).toBe(200);
  expect(res.body).toEqual({
    id: 1,
    name: 'Ayush Naudiyal',
    email: 'ayush@mailbox.dev',
    inbox_unread: 3,
  });
});

test("GET /api/labels returns only the current user's labels with unread counts", async () => {
  const res = await request(app).get('/api/labels');

  expect(res.status).toBe(200);
  expect(res.body).toEqual([
    { id: 2, name: 'Personal', unread_count: 0 },
    { id: 1, name: 'Work', unread_count: 2 },
  ]);
});

test('the error handler hides internal details in production', () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  // A tiny fake `res` that records what the handler sends.
  const res = {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
    },
  };
  const consoleError = console.error;
  console.error = () => {}; // keep the test output clean

  errorHandler(new Error('password=secret in a DB error'), {}, res, () => {});

  console.error = consoleError;
  process.env.NODE_ENV = originalEnv;

  expect(res.statusCode).toBe(500);
  expect(res.body).toEqual({ error: { message: 'Internal server error' } });
});
