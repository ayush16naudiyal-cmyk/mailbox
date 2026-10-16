import request from 'supertest';
import app from '../src/app.js';
import { resetDb, pool } from './testDb.js';

beforeEach(resetDb);
afterAll(() => pool.end());

const ids = (res) => res.body.data.map((email) => email.id);

describe('GET /api/emails', () => {
  test('defaults to the inbox, newest first, with a snippet instead of the body', async () => {
    const res = await request(app).get('/api/emails');

    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([5, 4, 3, 2, 1]);
    expect(res.body.data.every((e) => e.folder === 'inbox')).toBe(true);
    expect(res.body.data[0].body).toBeUndefined();
    expect(res.body.data[0].snippet).toBe('Sounds good, see you then.');
  });

  test('returns pagination metadata', async () => {
    const res = await request(app).get('/api/emails?limit=2&page=2');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 2, limit: 2, total: 5, totalPages: 3 });
    expect(ids(res)).toEqual([3, 2]);
  });

  test('caps limit at 50', async () => {
    const res = await request(app).get('/api/emails?limit=500');

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(50);
  });

  test('searches subject, body and sender name, ignoring case', async () => {
    const bySubject = await request(app).get('/api/emails?q=PROJECT');
    expect(ids(bySubject)).toEqual([5, 1]);

    const bySender = await request(app).get('/api/emails?q=rahul');
    expect(ids(bySender)).toEqual([2]);

    const byBody = await request(app).get('/api/emails?q=september');
    expect(ids(byBody)).toEqual([4]);
  });

  test('search treats SQL as plain text and never shows other users\' email', async () => {
    const injection = await request(app).get('/api/emails').query({ q: "' OR 1=1 --" });
    expect(injection.status).toBe(200);
    expect(injection.body.total).toBe(0);

    // "Secret plans for Priya" exists, but in Priya's mailbox.
    const otherUser = await request(app).get('/api/emails?q=secret');
    expect(otherUser.body.total).toBe(0);
  });

  test('filters starred emails', async () => {
    const res = await request(app).get('/api/emails?starred=true');

    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([4, 1]);
  });

  test('filters by label', async () => {
    const res = await request(app).get('/api/emails?label=1');

    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([5, 1]);
  });

  test('returns the sent folder when asked', async () => {
    const res = await request(app).get('/api/emails?folder=sent');

    expect(ids(res)).toEqual([6]);
  });

  test('returns 400 with details for an invalid folder', async () => {
    const res = await request(app).get('/api/emails?folder=spam');

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Invalid input');
    expect(res.body.error.details[0]).toMatchObject({ location: 'query', path: 'folder' });
  });
});
