import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// GET /api/me  -> the current user, plus their inbox unread count for the sidebar badge.
router.get('/', async (req, res) => {
  const result = await pool.query(
    `SELECT u.id, u.name, u.email,
            (SELECT count(*)::int FROM emails e
             WHERE e.user_id = u.id AND e.folder = 'inbox' AND e.is_read = false) AS inbox_unread
     FROM users u
     WHERE u.id = $1`,
    [req.userId]
  );

  const user = result.rows[0];
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  res.json(user);
});

export default router;
