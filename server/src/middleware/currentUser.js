// Decides who the "logged-in" user is. There's no login yet, so everyone is the
// demo user from .env. Real auth only has to change this one function: verify a
// JWT from an httpOnly cookie and set req.userId from it. Every route reads
// req.userId, so nothing else needs to change.
export function currentUser(req, res, next) {
  req.userId = Number(process.env.DEMO_USER_ID);
  next();
}
