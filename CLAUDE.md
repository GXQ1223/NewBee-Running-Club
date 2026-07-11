# Claude Code Project Guide - NewBee Running Club

## Project Overview

NewBee Running Club is a full-stack web application for a New York-based running community. It provides member management, event organization, race records tracking, donor management, and community engagement features.

**Domain:** newbeerunningclub.org
**Bilingual:** English + Chinese (简体中文)

## Technology Stack

### Frontend (`ProjectCode/client/`)
- **Framework:** React 18.2.0 with React Router DOM v6
- **UI:** Material-UI (MUI) v5.15 with Emotion styling
- **Auth:** Firebase v11.6 (Email, Google, GitHub OAuth)
- **Forms:** Formik + Yup validation
- **Charts:** Chart.js, Recharts, D3, Nivo
- **Data:** PapaParse (CSV), date-fns

### Backend (`ProjectCode/server/`)
- **Framework:** FastAPI (Python)
- **ORM:** SQLAlchemy
- **Database:** AWS MySQL RDS (prod) / SQLite (dev)
- **Validation:** Pydantic models

## Directory Structure

```
ProjectCode/
├── client/
│   └── src/
│       ├── components/     # Reusable UI (NavBar, Logo, DonorGrid, etc.)
│       ├── pages/          # Page components (12 pages)
│       ├── context/        # AuthContext for auth state
│       ├── firebase/       # Firebase config and auth functions
│       ├── api/            # API utilities
│       ├── data/           # Static data (committeeMembers.js)
│       ├── helpers/        # Utility functions (formatter.js)
│       └── App.js          # Main app with routing & theme
│   └── public/
│       └── data/           # CSV files, meeting notes, images
├── server/
│   ├── main.py             # Slim entry point: app init, middleware, router includes
│   ├── database.py         # SQLAlchemy models & connection
│   ├── models.py           # Pydantic schemas
│   ├── routes/             # API route modules (one per domain)
│   │   ├── results.py      # Race results & NYRR sync
│   │   ├── donors.py       # Donor management
│   │   ├── members.py      # Member profiles, auth, approvals, newsletter
│   │   ├── activities.py   # Member activity tracking
│   │   ├── events.py       # Event CRUD
│   │   ├── engagement.py   # Comments, likes, reactions
│   │   ├── gallery.py      # Event gallery images & S3 upload
│   │   ├── training_tips.py # Training tips
│   │   ├── credits.py      # Club credits
│   │   ├── banners.py      # Banner images
│   │   ├── homepage.py     # Homepage sections
│   │   ├── uploads.py      # Image uploads
│   │   ├── meeting_minutes.py # Meeting minutes
│   │   ├── recurrence.py   # Event recurrence rules & series
│   │   ├── highlights.py   # Event groups & highlights
│   │   └── settings.py     # Site settings & social links
│   ├── utils/              # Shared utilities
│   │   ├── auth.py         # Auth dependencies (get_current_admin, etc.)
│   │   ├── s3.py           # S3 upload/delete functions
│   │   ├── time.py         # Time parsing utilities
│   │   └── name_detector.py # Event group name detection
│   └── .env                # Environment config (DB credentials)
```

## Development Commands

### Frontend
```bash
cd ProjectCode/client
npm install          # Install dependencies
npm start            # Dev server on localhost:3000
npm run build        # Production build
npm test             # Run tests
```

### Backend
```bash
cd ProjectCode/server
python -m venv venv && source venv/bin/activate  # Setup venv
pip install -r requirements.txt                   # Install deps
python main.py                                    # Run on localhost:8000
# Or: uvicorn main:app --reload
```

## API Endpoints

### Donors
- `GET /api/donors` - All donors
- `GET /api/donors/{type}` - By type (individual/enterprise)
- `POST /api/donors` - Create donor
- `PUT /api/donors/{id}` - Update donor
- `DELETE /api/donors/{id}` - Delete donor
- `GET /api/donors/stats/summary` - Donation statistics

### Race Results
- `GET /api/results/available-years` - Years with data
- `GET /api/results/men-records` - Top 10 men's times
- `GET /api/results/women-records` - Top 10 women's times
- `GET /api/results/all-races` - All race names

### Race Record Submissions (X-Firebase-UID header)
- `POST /api/race-submissions` - Member submits a PR from a non-NYRR race (creates the race: name/date/distance + time + proof URL + photo)
- `GET /api/race-submissions/mine` - Member's own submissions (any status)
- `PUT /api/race-submissions/{id}` - Edit own submission (record fields while pending/rejected; photo anytime; editing a rejected one resubmits)
- `DELETE /api/race-submissions/{id}` - Withdraw own pending/rejected submission
- `GET /api/race-submissions/pending` - Pending list w/ member info (committee/admin)
- `PUT /api/race-submissions/{id}/review` - Approve/reject (committee/admin). Approval inserts a `results` row (name + gender_age from member) so the record appears on the member profile and the Records leaderboard
- `PUT /api/race-photos` - Attach/replace member's photo on own synced race result
- `GET /api/race-photos/mine` - Member's race photos keyed by result_id

### Donation Ledger (committee/admin, X-Firebase-UID header)
- `GET /api/donors/ledger` - All donations (any status) + stats + Gmail sync health
- `POST /api/donors/donations/{id}/approve` - Publish a pending Gmail-imported donation
- `POST /api/donors/donations/{id}/dismiss` - Hide a pending donation permanently
- `POST /api/donors/sync-gmail` - Run the Zelle Gmail sync now
- `GET /api/donors/tax-report?start_date&end_date&format=csv|pdf` - Tax file export
- `GET/POST/PUT/DELETE /api/donors/thank-you-templates[/{id}]` - Thank-you letter templates, tiered by `min_amount` ({name}/{amount}/{date} placeholders)
- `GET /api/donors/donations/{id}/thank-you-preview` - Rendered letter (matched tier) for the send dialog
- `GET /api/donors/donations/{id}/receipt` - Official donation receipt PDF (server/assets holds the letterhead logo + authorized signature)

Weekly Gmail sync: APScheduler job `sync_zelle_donations` (Mon 4:30 AM UTC) reads
Chase Zelle emails (Gmail label "NewBee Finance/Chase") and Venmo payment
emails (label "NewBee Finance/Venmo") via IMAP (`sync_zelle_donations.py`) and
inserts donations as `status='pending'` for review in the Sponsors page admin
ledger tab. Venmo dedup uses the transaction id from the "See transaction"
link (falls back to the email Message-ID). Public donor endpoints only return
`status='confirmed'` rows.

## Coding Conventions

### Frontend (JavaScript/React)
- **Components:** PascalCase (`HomePage.js`)
- **Functions/Variables:** camelCase
- **Styling:** MUI `sx` prop (no separate CSS files)
- **State:** useState for local, Context API for auth only
- **Data Fetching:** fetch in useEffect hooks

### Backend (Python)
- **Functions/Variables:** snake_case
- **Classes:** PascalCase
- **Routes:** kebab-case (`/api/donors`)

## Key Patterns

### Authentication
Firebase handles all auth. AuthContext provides `currentUser`, `login()`, `logout()`, `signup()`.

```javascript
import { useAuth } from '../context/AuthContext';
const { currentUser, login, logout } = useAuth();
```

### Data Fetching
Frontend fetches from both:
1. **CSV files** in `public/data/` (events, credits, donors)
2. **API** at `localhost:8000/api/` or configured host

### Form Handling
Use Formik + Yup for forms:
```javascript
<Formik
  initialValues={{ name: '' }}
  validationSchema={Yup.object({ name: Yup.string().required() })}
  onSubmit={(values) => { /* handle submit */ }}
>
```

### MUI Theme
Custom theme in App.js uses indigo primary and amber secondary colors.

## Database Models

### Donor
- `donation_id`, `donor_id`, `name`, `donor_type`, `donation_event`
- `amount` (DECIMAL), `created_at`, `updated_at`
- `source`, `receipt_confirmed`, `notes`

### Results
- `id`, `name`, `gender_age`, `overall_place`, `gender_place`
- `overall_time`, `pace`, `gun_time`, `age_graded_time`
- `race`, `race_date`, `race_distance`, `IAAF`

## Environment Variables (server/.env)

```
DB_HOST=<aws-rds-host>
DB_PORT=3306
DB_USER=admin
DB_PASSWORD=<password>
DB_NAME=newbee_running_club
API_HOST=0.0.0.0
API_PORT=8000
DEBUG=True          # Set False for production
USE_SQLITE=True     # Set False for MySQL
GMAIL_USER=<gmail-address>
GMAIL_APP_PASSWORD=<gmail-app-password>
AWS_ACCESS_KEY_ID=<aws-access-key>
AWS_SECRET_ACCESS_KEY=<aws-secret-key>
AWS_REGION=<aws-region>
AWS_S3_BUCKET=<s3-bucket-name>
WEBSITE_URL=<website-url>
```

## Git Workflow

- **main** - Primary branch for PRs
- **dev** - Development branch (CI target)
- **prod** - Production (only accepts merges from dev)
- **re-factoring** - Current active feature branch

GitHub Actions:
- `overnight-claude.yml` - Automated Claude Code review (2 AM PST daily)
- `check-source-branch.yml` - Enforces dev-only merges to prod

## Important Files

| File | Purpose |
|------|---------|
| `client/src/App.js` | Main app, routing, theme |
| `client/src/config.json` | Server host/port config |
| `client/src/firebase/config.js` | Firebase project config |
| `server/main.py` | Slim app entry point (middleware, router includes) |
| `server/routes/*.py` | API route modules (one per domain) |
| `server/utils/auth.py` | Auth dependencies (get_current_admin, etc.) |
| `server/database.py` | SQLAlchemy models & DB setup |
| `server/fetch_historical_data.py` | NYRR race data import script |
| `WISHLIST.md` | Tasks for overnight Claude automation |

## Common Tasks

### Adding a New Page
1. Create component in `client/src/pages/NewPage.js`
2. Add route in `App.js`: `<Route path="/new-page" element={<NewPage />} />`
3. Add nav link in `NavBar.js` if needed

### Adding a New API Endpoint
1. Add route in the appropriate `server/routes/<domain>.py` file (or create a new one)
2. If creating a new route file, register it in `server/main.py` with `app.include_router()`
3. Create Pydantic model in `models.py` if needed
4. Add database model in `database.py` if needed

### Modifying Donor/Results Data
1. Backend API handles CRUD operations
2. CSV files in `public/data/` serve as fallback/static data

## Local Development Setup

### Step 1: Configure Environment

**Backend (`server/.env`)** - Ensure these are set:
```
USE_SQLITE=True
DEBUG=True
```

**Frontend (`client/.env`)** - Ensure this is set:
```
REACT_APP_API_BASE_URL=http://localhost:8000
```

### Step 2: Start Servers

**Backend:**
```bash
cd ProjectCode/server
lsof -ti :8000 | xargs kill -9 2>/dev/null
source venv/bin/activate
python main.py
```

**Frontend (in a new terminal):**
```bash
cd ProjectCode/client
lsof -ti :3000 | xargs kill -9 2>/dev/null
npm start
```

### Servers

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |

## Production Server (EC2)

### SSH Access
```bash
ssh -i /Users/xiaoqingguo/Documents/secrets/newbee-key.pem ubuntu@52.14.44.243
```

**Key file:** `~/Documents/secrets/newbee-key.pem`
**OS:** Ubuntu
**Username:** `ubuntu`
**Public IP:** `52.14.44.243`

If permission is denied due to key file permissions:
```bash
chmod 400 /Users/xiaoqingguo/Documents/secrets/newbee-key.pem
```

### Application Location
- **Backend `.env`:** `/var/www/newbeerunning/backend/.env`

### Common Server Tasks

**Edit production `.env`:**
```bash
sudo nano /var/www/newbeerunning/backend/.env
```

**Restart backend service after config changes:**
```bash
sudo systemctl restart newbeerunning-api
```

**Check service status:**
```bash
sudo systemctl status newbeerunning-api
```

## Notes

- Bilingual UI: All major elements have English + Chinese labels
- No testing infrastructure implemented yet
- CSV parsing happens client-side for some data
- Firebase config keys are exposed in source (standard for client-side Firebase)
