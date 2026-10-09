# Setup guide (one-time, about 30 minutes)

Everything below is free. You need: a GitHub account, a Supabase account (sign in with GitHub), and this folder on your computer with Node.js and Python installed.

## 1. Create the database (Supabase)

1. Go to https://supabase.com → **New project**. Name it anything, choose a strong database password (save it somewhere, you rarely need it), pick the region closest to Lebanon (Frankfurt `eu-central-1`).
2. Wait for the project to finish provisioning (about 2 minutes).
3. **Authentication → Providers → Email**: turn **off** "Confirm email" (the family signs in with a name and PIN, there are no real email addresses). Leave "Enable Email provider" on.
4. **Authentication → Settings (or Sign In / Up)**: set *Minimum password length* to 6 so 6-digit PINs are accepted.
5. **SQL Editor → New query**: paste the whole contents of `supabase/migrations/0001_init.sql` and click **Run**. It should finish with "Success. No rows returned".
6. **Project Settings → API**: copy three values:
   - `Project URL` (looks like `https://abcdefgh.supabase.co`)
   - `anon` `public` key
   - `service_role` key (secret; used only once by the import script below, never put it in the app)

## 2. Load the products and photos

From the repo root:

```powershell
pip install pymupdf
python scripts/parse_order.py          # reads "bassel china.pdf" → data/items.json + data/photos/
cd web
npm install
$env:SUPABASE_URL = "https://abcdefgh.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "eyJ...service_role..."
node scripts/import.mjs                # uploads 365 photos, inserts 369 items, sets opening stock
```

Check `data/report.txt` after parsing: it lists the handful of rows that need a human look (items without a photo, two coaster sizes that had no number on the sheet, two refs the sheet reused). You can fix names and prices later inside the app (owner → Stock → item → Edit).

## 3. Run it on your computer first

```powershell
cd web
copy .env.example .env.local           # then edit it: paste Project URL + anon key
npm run dev
```

Open http://localhost:5173. Because the database has no users yet, the login page shows **Create the owner account**. Enter your name, a login name (letters, e.g. `hasan`) and a 6-digit PIN. That account is the owner.

Then **Settings → Add a person** for each family member: name, login name, role (seller), PIN. Tell them their login name and PIN. They open the site on their phone, tap their name, enter the PIN, give their phone a nickname, and they're in.

## 4. Put it online (GitHub Pages)

1. Create a new **public** repository on GitHub (Pages is free only for public repos), e.g. `China_Ordering_System`. Push this folder to it (`main` branch).
2. In the repository: **Settings → Secrets and variables → Actions → New repository secret**, add:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = anon key
   (The anon key is designed to be public; the database rules decide what it may do.)
3. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Push any commit (or **Actions → Deploy to GitHub Pages → Run workflow**). In ~2 minutes the site is live at `https://<your-username>.github.io/<repo-name>/`.
5. On each phone, open that link once, then:
   - iPhone: Share button → **Add to Home Screen**
   - Android (Chrome): ⋮ menu → **Install app** / **Add to Home screen**

## Day-to-day

- **Sell**: tap photos, set quantity and price, add customer and place, mark paid / partial / unpaid, Save.
- **Stock**: what is left of everything. Owner can adjust stock (returns, damaged, recount) and edit names/prices.
- **History**: every sale with who sold it, from which phone, when. Owner can cancel a sale (stock goes back). A seller can cancel their own sale within 24 hours.
- **Dashboard**: revenue, profit, units, money owed, per seller, best sellers.
- **Settings**: Arabic/English, rename this phone, people management (owner), Excel export (owner).

## Things to know

- **Free Supabase projects pause after 7 days with no activity.** Opening the app counts as activity. If it ever pauses, go to the Supabase dashboard and click **Restore**; nothing is lost.
- **Forgotten PIN**: the owner opens Supabase → **Authentication → Users**, finds `<loginname>@family.local`, and uses "Reset password" / "Send password recovery" is not usable (no real email), so instead click the user → **Update password** and set a new 6-digit PIN. Anyone can change their own PIN inside the app (Settings → Change my PIN).
- **Which phone**: the app records a nickname per phone plus what the browser reports. iPhones only report "iPhone" (Apple hides the model from websites); Android phones usually report the exact model. The reliable "who" is the login.
- **Backups**: Settings → Export to Excel downloads everything. Do it weekly.
- The big supplier catalog PDF is not part of the app; only the order sheet was imported.
- Cost basis: the sheet's USD price per piece. If you want profit to include shipping, the owner can fill **Landed cost** per item; profit then uses it.
