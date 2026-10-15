# Job Hunt

A job hunt case board where anyone can sign up and keep their own private corkboard of companies, roles, applications, resumes, contacts, interviews and events.

- **Frontend:** Vite with plain JavaScript and d3 (`src/`)
- **Backend:** Supabase, which handles sign-in by email link (optional Google), the Postgres database, live updates and file storage
- **Privacy:** row-level security in `supabase/schema.sql` means each signed-in user can only read and write their own rows and files.

## 1. Create the Supabase project (about 5 minutes)

1. Sign up at https://supabase.com and create a new project. The free tier is enough to start.
2. Open **SQL Editor → New query**, paste all of `supabase/schema.sql`, and click **Run**. This creates:
   - the `records` table
   - the access rules
   - the 5,000-item cap per user
   - live updates
   - the private `files` bucket
3. Open **Authentication → URL Configuration**:
   - **Site URL:** your deployed address, e.g. `https://job-hunt.vercel.app`. Use `http://localhost:5173` until you deploy.
   - **Redirect URLs:** add `http://localhost:5173` and your deployed address.
4. Open **Project Settings → API** and copy the **Project URL** and the **anon public** key.

## 2. Run it locally

```bash
cp .env.example .env      # then paste the URL and anon key into .env
npm install
npm run dev               # opens http://localhost:5173
```

The anon key is safe to ship in the browser. The database rules decide what each signed-in user can see, not the key.

## 3. Deploy (Vercel, free)

1. Push this `app` folder to a GitHub repository.
2. At https://vercel.com, click **Add New → Project** and import the repository. If the repository root isn't this folder, set **Root Directory** to `app`. Vercel detects Vite automatically.
3. Under **Environment Variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (and `VITE_GOOGLE_AUTH` if you use it).
4. Deploy. Then put the Vercel URL into Supabase's **Site URL** and **Redirect URLs** (step 1.3).

Netlify works the same way, with build command `npm run build` and publish directory `dist`.

## Before you invite lots of people

- **Sign-in emails:** Supabase's built-in email sender only allows a few emails per hour and is meant for testing. For real users, set up custom SMTP under **Authentication → Emails → SMTP Settings**. Resend, Postmark and Amazon SES all have free or cheap tiers.
- **Google sign-in (optional):** enable it under **Authentication → Providers → Google** with a Google Cloud OAuth client, then set `VITE_GOOGLE_AUTH=true`.
- **Limits:** each user can store up to 5,000 items (change the number in `limit_records()`) and files up to 20 MB each. The Supabase free tier includes 500 MB of database storage and 1 GB of file storage.

## How the data is stored

Each board item is one row in `records`:

| column | meaning |
| --- | --- |
| `id` | uuid, generated in the browser |
| `user_id` | owner; set automatically to the signed-in user |
| `col` | `companies`, `roles`, `applications`, `documents`, `people`, `interviews` or `events` |
| `data` | the item's fields as JSON; links to other items are stored as their ids |

Files are stored at `files/<user id>/<uuid>-<filename>` and opened through short-lived signed links.

Users can export their whole board as JSON, and import it again, from the account menu.

## Files

- `index.html`: the sign-in screen and the app's markup
- `src/main.js`: the board, pipeline, timeline, detail panel, sign-in and import/export
- `src/board.js`: draws each record as pinned paper (mugshot polaroids, index cards, case tags, sticky notes) and the thumbtacks
- `src/sketch.js`: rough.js marker scribbles (circles, X marks)
- `src/store.js`: the Supabase data layer (loading, optimistic writes, live updates, files)
- `src/sample.js`: the sample case that new users can load from the empty state
- `src/style.css`: design tokens (light and dark) and all styles, including the cork, paper and string
- `supabase/schema.sql`: the table, access rules, storage bucket and limits
