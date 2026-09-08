# Cudii & Ace — Project HQ

A mobile-first board for the two of us to stay on top of Launch Point projects:
current projects, total cost per project, the to-do list for each, and a private chat.

Static site (HTML/CSS/JS). Data + realtime chat run on Supabase (free tier).

## One-time setup

1. **Supabase project** — go to [supabase.com](https://supabase.com), create a free project.
2. **Schema** — Supabase → SQL Editor → paste all of [`supabase-schema.sql`](supabase-schema.sql) → Run.
3. **Keys** — Supabase → Project Settings → API. Copy the Project URL and the `anon public` key into [`config.js`](config.js).
4. Commit and push. Netlify redeploys on push.
5. Open the site, pick **Cudii** or **Ace** once per device. Done.

## Local preview

Just open `index.html` in a browser, or:

```bash
npx serve .
```

## Notes

- No login: it's a private 2-person board and the anon key has full access via RLS
  policies. Keep the repo private. To lock it down further, switch to Supabase Auth.
- Everything syncs live between devices through Supabase realtime.
