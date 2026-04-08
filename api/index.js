import 'dotenv/config';
import app from '../src/app.js';

// Must be a named function export (not Express app directly) for Vercel
// to recognise the config export and disable its built-in body parser.
// Without bodyParser:false, Vercel parses req.body as JSON before Express
// sees it, which breaks the HMAC signature check (needs the raw Buffer).
export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(req, res) {
  app(req, res);
}
