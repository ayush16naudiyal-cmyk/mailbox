import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// ---------- Validation schemas ----------

// Postgres SERIAL ids are 32-bit; anything larger would crash the query instead of returning 404.
const id = z.coerce.number().int().positive().max(2147483647);
const folder = z.enum(['inbox', 'sent', 'trash']);

const idParams = z.object({ id });

const listQuery = z.object({
  folder: folder.optional(),
  page: z.coerce.number().int().min(1).default(1),
  // Asking for more than 50 isn't an error; we just cap it.
  limit: z.coerce.number().int().min(1).default(20).transform((n) => Math.min(n, 50)),
  q: z.string().trim().max(100).optional(),
  starred: z.enum(['true', 'false']).optional(),
  label: id.optional(),
});

const composeBody = z.object({
  to: z.email('Enter a valid email address'),
  subject: z.string().trim().min(1, 'Subject is required').max(200),
  body: z.string().trim().min(1, 'Body is required').max(10000),
});

// Unknown keys are stripped by zod, so only these three column names can reach the SQL.
const updateBody = z
  .object({
    is_read: z.boolean().optional(),
    is_starred: z.boolean().optional(),
    folder: folder.optional(),
  })
  .refine((b) => Object.keys(b).length > 0, {
    message: 'Provide at least one of is_read, is_starred or folder',
  });

const addLabelBody = z.object({ labelId: id });
const removeLabelParams = z.object({ id, labelId: id });

// ---------- Queries ----------

// Builds the SQL for the email list. Exported so the index benchmark runs
// exactly the same query the API runs.
export function buildListQuery(userId, { folder, q, starred, label, page, limit }) {
  // Each filter adds a condition and pushes its value onto params, using the
  // next $n number. Values never go into the SQL text itself.
  const conditions = ['user_id = $1'];
  const params = [userId];

  if (folder) {
    params.push(folder);
    conditions.push(`folder = $${params.length}`);
  } else if (starred === 'true' || label) {
    // Like Gmail: Starred and label views show every folder except trash.
    conditions.push(`folder <> 'trash'`);
  } else {
    params.push('inbox');
    conditions.push(`folder = $${params.length}`);
  }

  if (starred === 'true') {
    conditions.push('is_starred = true');
  }

  if (label) {
    params.push(label);
    conditions.push(
      `EXISTS (SELECT 1 FROM email_labels el WHERE el.email_id = emails.id AND el.label_id = $${params.length})`
    );
  }

  if (q) {
    // Escape LIKE wildcards so searching for "50%" means a literal "%".
    const escaped = q.replace(/[\\%_]/g, '\\$&');
    params.push(`%${escaped}%`);
    const n = params.length;
    conditions.push(`(subject ILIKE $${n} OR body ILIKE $${n} OR sender_name ILIKE $${n})`);
  }

  const where = conditions.join(' AND ');

  const countSql = `SELECT count(*)::int AS total FROM emails WHERE ${where}`;

  // The list never sends the full body, only a 120-character snippet.
  const listSql = `
    SELECT id, sender_name, sender_email, recipient_email, subject,
           left(body, 120) AS snippet, folder, is_read, is_starred, created_at
    FROM emails
    WHERE ${where}
    ORDER BY created_at DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

  return {
    countSql,
    countParams: params,
    listSql,
    listParams: [...params, limit, (page - 1) * limit],
  };
}

// Every query below includes `user_id = <current user>`. If the email belongs to
// someone else, the query finds nothing and we return 404, the same as if it
// didn't exist, so you can't even tell whether someone else's email id exists.
async function findOwnEmail(emailId, userId) {
  const result = await pool.query('SELECT * FROM emails WHERE id = $1 AND user_id = $2', [
    emailId,
    userId,
  ]);
  return result.rows[0];
}

function notFound(message = 'Email not found') {
  const err = new Error(message);
  err.status = 404;
  return err;
}

// ---------- Routes ----------

// GET /api/emails?folder=inbox&page=1&limit=20&q=hello&starred=true&label=3
router.get('/', validate({ query: listQuery }), async (req, res) => {
  const filters = req.validated.query;
  const { countSql, countParams, listSql, listParams } = buildListQuery(req.userId, filters);

  const [countResult, listResult] = await Promise.all([
    pool.query(countSql, countParams),
    pool.query(listSql, listParams),
  ]);

  const total = countResult.rows[0].total;
  res.json({
    data: listResult.rows,
    page: filters.page,
    limit: filters.limit,
    total,
    totalPages: Math.ceil(total / filters.limit),
  });
});

// GET /api/emails/:id
router.get('/:id', validate({ params: idParams }), async (req, res) => {
  const email = await findOwnEmail(req.validated.params.id, req.userId);
  if (!email) throw notFound();

  const labels = await pool.query(
    `SELECT l.id, l.name
     FROM labels l
     JOIN email_labels el ON el.label_id = l.id
     WHERE el.email_id = $1
     ORDER BY l.name`,
    [email.id]
  );

  res.json({ ...email, labels: labels.rows });
});

// POST /api/emails  { to, subject, body }
router.post('/', validate({ body: composeBody }), async (req, res) => {
  const { subject, body } = req.validated.body;
  const to = req.validated.body.to.toLowerCase();

  // Both copies are saved in one transaction: either both exist or neither does.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const senderResult = await client.query('SELECT name, email FROM users WHERE id = $1', [
      req.userId,
    ]);
    const sender = senderResult.rows[0];

    const insertSql = `
      INSERT INTO emails (user_id, sender_name, sender_email, recipient_email, subject, body, folder, is_read)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`;

    // The sender's own copy, already read.
    const sent = await client.query(insertSql, [
      req.userId, sender.name, sender.email, to, subject, body, 'sent', true,
    ]);

    // If the recipient has a Mailbox account, deliver an unread copy to their inbox.
    const recipient = await client.query('SELECT id FROM users WHERE email = $1', [to]);
    if (recipient.rows.length > 0) {
      await client.query(insertSql, [
        recipient.rows[0].id, sender.name, sender.email, to, subject, body, 'inbox', false,
      ]);
    }

    await client.query('COMMIT');
    res.status(201).json(sent.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// PATCH /api/emails/:id  { is_read?, is_starred?, folder? }
router.patch('/:id', validate({ params: idParams, body: updateBody }), async (req, res) => {
  const changes = req.validated.body;

  // Builds e.g. "is_read = $1, folder = $2". The column names come from the
  // zod schema above (only is_read, is_starred, folder can get through).
  const columns = Object.keys(changes);
  const setClause = columns.map((column, i) => `${column} = $${i + 1}`).join(', ');
  const params = [...Object.values(changes), req.validated.params.id, req.userId];

  const result = await pool.query(
    `UPDATE emails SET ${setClause}
     WHERE id = $${columns.length + 1} AND user_id = $${columns.length + 2}
     RETURNING *`,
    params
  );

  if (result.rows.length === 0) throw notFound();
  res.json(result.rows[0]);
});

// DELETE /api/emails/:id  (permanent; only allowed from trash)
router.delete('/:id', validate({ params: idParams }), async (req, res) => {
  const email = await findOwnEmail(req.validated.params.id, req.userId);
  if (!email) throw notFound();

  if (email.folder !== 'trash') {
    const err = new Error('Move the email to trash before deleting it permanently');
    err.status = 409; // Conflict: the request is valid but clashes with the email's current state
    throw err;
  }

  // email_labels rows are removed automatically by ON DELETE CASCADE.
  await pool.query('DELETE FROM emails WHERE id = $1 AND user_id = $2', [email.id, req.userId]);
  res.status(204).end();
});

// POST /api/emails/:id/labels  { labelId }
router.post(
  '/:id/labels',
  validate({ params: idParams, body: addLabelBody }),
  async (req, res) => {
    const email = await findOwnEmail(req.validated.params.id, req.userId);
    if (!email) throw notFound();

    // The label must also belong to the current user.
    const labelResult = await pool.query('SELECT id, name FROM labels WHERE id = $1 AND user_id = $2', [
      req.validated.body.labelId,
      req.userId,
    ]);
    const label = labelResult.rows[0];
    if (!label) throw notFound('Label not found');

    // Adding a label that's already there is not an error, it just does nothing.
    await pool.query(
      'INSERT INTO email_labels (email_id, label_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [email.id, label.id]
    );

    res.status(201).json(label);
  }
);

// DELETE /api/emails/:id/labels/:labelId
router.delete('/:id/labels/:labelId', validate({ params: removeLabelParams }), async (req, res) => {
  const { id: emailId, labelId } = req.validated.params;

  // The join to emails makes sure the email belongs to the current user.
  const result = await pool.query(
    `DELETE FROM email_labels el
     USING emails e
     WHERE el.email_id = e.id AND e.id = $1 AND e.user_id = $2 AND el.label_id = $3`,
    [emailId, req.userId, labelId]
  );

  if (result.rowCount === 0) throw notFound('Label not found on this email');
  res.status(204).end();
});

export default router;
