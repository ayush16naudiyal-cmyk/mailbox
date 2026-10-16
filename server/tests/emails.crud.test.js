import request from 'supertest';
import app from '../src/app.js';
import { resetDb, pool } from './testDb.js';

beforeEach(resetDb);
afterAll(() => pool.end());

describe('GET /api/emails/:id', () => {
  test('returns the full email with its labels', async () => {
    const res = await request(app).get('/api/emails/1');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 1,
      subject: 'Project kickoff meeting',
      body: 'Let us meet on Monday to plan the project.',
      labels: [{ id: 1, name: 'Work' }],
    });
  });

  test('returns 404 for an email that does not exist', async () => {
    const res = await request(app).get('/api/emails/999');

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('Email not found');
  });

  test("returns 404 for another user's email", async () => {
    // Email 8 exists, but it is in Priya's mailbox, not the logged-in user's.
    const res = await request(app).get('/api/emails/8');

    expect(res.status).toBe(404);
  });
});

describe('POST /api/emails', () => {
  test('saves a copy in the sender\'s sent folder and returns 201', async () => {
    const res = await request(app)
      .post('/api/emails')
      .send({ to: 'friend@example.com', subject: 'Hello', body: 'How are you?' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      user_id: 1,
      sender_email: 'ayush@mailbox.dev',
      recipient_email: 'friend@example.com',
      folder: 'sent',
      is_read: true,
    });

    const sent = await request(app).get('/api/emails?folder=sent');
    expect(sent.body.total).toBe(2);
  });

  test("delivers an unread copy to the recipient's inbox when they are a user", async () => {
    await request(app)
      .post('/api/emails')
      .send({ to: 'Priya@Mailbox.dev', subject: 'Notes', body: 'Here are my notes.' });

    // The API only shows the logged-in user's mail, so check Priya's mailbox directly.
    const result = await pool.query(
      "SELECT folder, is_read, sender_email FROM emails WHERE user_id = 2 AND subject = 'Notes'"
    );
    expect(result.rows).toEqual([{ folder: 'inbox', is_read: false, sender_email: 'ayush@mailbox.dev' }]);
  });

  test('returns 400 when fields are missing or invalid', async () => {
    const missing = await request(app).post('/api/emails').send({});
    expect(missing.status).toBe(400);
    const paths = missing.body.error.details.map((d) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['to', 'subject', 'body']));

    const badEmail = await request(app)
      .post('/api/emails')
      .send({ to: 'not-an-email', subject: 'Hi', body: 'Hi' });
    expect(badEmail.status).toBe(400);
    expect(badEmail.body.error.details[0].message).toBe('Enter a valid email address');
  });
});

describe('PATCH /api/emails/:id', () => {
  test('toggles read and starred', async () => {
    const res = await request(app).patch('/api/emails/2').send({ is_read: true, is_starred: true });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 2, is_read: true, is_starred: true });

    const undo = await request(app).patch('/api/emails/2').send({ is_read: false });
    expect(undo.body).toMatchObject({ is_read: false, is_starred: true });
  });

  test('moves an email to trash', async () => {
    const res = await request(app).patch('/api/emails/2').send({ folder: 'trash' });
    expect(res.status).toBe(200);
    expect(res.body.folder).toBe('trash');

    const inbox = await request(app).get('/api/emails');
    expect(inbox.body.total).toBe(4);
  });

  test('returns 400 for an invalid folder', async () => {
    const res = await request(app).patch('/api/emails/2').send({ folder: 'spam' });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0]).toMatchObject({ location: 'body', path: 'folder' });
  });

  test("returns 404 and changes nothing for another user's email", async () => {
    const res = await request(app).patch('/api/emails/8').send({ folder: 'trash' });
    expect(res.status).toBe(404);

    const result = await pool.query('SELECT folder FROM emails WHERE id = 8');
    expect(result.rows[0].folder).toBe('inbox');
  });
});

describe('DELETE /api/emails/:id', () => {
  test('returns 409 if the email is not in trash', async () => {
    const res = await request(app).delete('/api/emails/1');

    expect(res.status).toBe(409);
  });

  test('deletes an email in trash (204), then it is gone (404)', async () => {
    const res = await request(app).delete('/api/emails/7');
    expect(res.status).toBe(204);

    const after = await request(app).get('/api/emails/7');
    expect(after.status).toBe(404);
  });
});

describe('email labels', () => {
  test('adds a label to an email', async () => {
    const res = await request(app).post('/api/emails/2/labels').send({ labelId: 2 });
    expect(res.status).toBe(201);

    const email = await request(app).get('/api/emails/2');
    expect(email.body.labels).toEqual([{ id: 2, name: 'Personal' }]);
  });

  test("can't use another user's label", async () => {
    const res = await request(app).post('/api/emails/2/labels').send({ labelId: 3 });

    expect(res.status).toBe(404);
  });

  test('removes a label from an email', async () => {
    const res = await request(app).delete('/api/emails/1/labels/1');
    expect(res.status).toBe(204);

    const email = await request(app).get('/api/emails/1');
    expect(email.body.labels).toEqual([]);
  });
});
