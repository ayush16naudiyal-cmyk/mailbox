import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// GET /api/labels  -> [{ id, name, unread_count }]
router.get('/', async (req, res) => {
  // LEFT JOINs keep labels with zero emails (count = 0) in the result.
  // The unread/trash conditions sit in the JOIN, not the WHERE, for the same reason:
  // in the WHERE they would filter out labels that have no unread emails.
  const result = await pool.query(
    `SELECT l.id, l.name, count(e.id)::int AS unread_count
     FROM labels l
     LEFT JOIN email_labels el ON el.label_id = l.id
     LEFT JOIN emails e ON e.id = el.email_id AND e.is_read = false AND e.folder <> 'trash'
     WHERE l.user_id = $1
     GROUP BY l.id, l.name
     ORDER BY l.name`,
    [req.userId]
  );

  res.json(result.rows);
});

export default router;
