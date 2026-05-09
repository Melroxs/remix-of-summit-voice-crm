## Goal
When an appointment is booked (status flows through scheduled → completed/sold), generate a **Sale Job Card** that creates/links a **Client Profile** containing all lead + client info. The client profile UI has 4 tabs: Client Details, Notes, Job Card History, Job Card Photos. Notes are timestamped with author. Photos can be uploaded to the profile *and* attached to a specific job card.

## Data model (new tables)

```text
clients
  id, contact_id (FK), company_id, appointment_id (origin), 
  first_name, last_name, email, phone_e164, address, city, state, zip,
  job_type, urgency, source, status (active/closed),
  created_from_appointment_id, created_at, updated_at, created_by

job_cards
  id, client_id (FK), company_id, appointment_id, contact_id,
  job_number (auto, e.g. JC-0001), job_type, status (open/in_progress/completed/cancelled),
  scheduled_at, completed_at, sale_amount, notes, created_by, created_at, updated_at

client_notes
  id, client_id, job_card_id (nullable), company_id,
  author_id, author_name (snapshot), body, created_at

client_photos
  id, client_id, job_card_id (nullable, when set photo attaches to card too),
  company_id, storage_path, file_name, mime_type, size_bytes,
  uploaded_by, uploaded_at, caption
```

Storage bucket `client-photos` (private) with RLS — admins/managers/agents in same company can read/write their company files.

## Workflow trigger

Trigger: when an `appointments` row is inserted **or** transitions to `status='completed'` (configurable — default: on insert, so the job card exists from booking and gets updated as the appointment progresses).

A Postgres trigger `appointment_to_job_card`:
1. Upserts a `clients` row (match by `contact_id`).
2. Inserts a `job_cards` row linked to client + appointment + contact.
3. Copies appointment job_type/urgency/address into the new records.

This means: every booked appointment automatically creates (or updates) a client + a job card.

## Frontend

New route `/clients` (list) and `/clients/:id` (profile):

- **List page** — searchable table: name, phone, address, last job, status.
- **Profile page** — header with client + lead summary, plus a `<Tabs>` block:
  - **Client Details** — editable client/lead info (name, contact, address, source, original appointment link).
  - **Notes** — timeline of `client_notes` with "Author • date/time" header; "Add note" textarea + save.
  - **Job Card History** — list of all `job_cards` for the client; click a card → drawer showing card details, status, amount, notes specific to card, and its photos. Inline status update.
  - **Job Card Photos** — gallery of photos for the client, filterable by "All" / per job card. Upload button → choose which job card (optional) → upload → stored in bucket, row in `client_photos`. Lightbox preview.

- **AppointmentModal** — after saving a "completed" or "sold" appointment, show a toast linking to the auto-created job card / client profile.

- **Sidebar** — add "Clients" entry under CRM section, gated to admin/manager/agent.

## Permissions (RLS)

- `clients`, `job_cards`, `client_notes`, `client_photos`: same-company members can read; agents can write notes/photos on records they own or are assigned to; admins/managers full access. Clients (role) get read access only to their own client_account-linked rows (existing pattern).
- Storage bucket policies match.

## Implementation order

1. Migration: new tables + RLS + trigger + storage bucket + storage policies.
2. Hooks: `use-clients.ts`, `use-job-cards.ts`, `use-client-notes.ts`, `use-client-photos.ts`.
3. Pages/components: `Clients.tsx`, `ClientProfile.tsx`, tab components (`ClientDetailsTab`, `NotesTab`, `JobCardHistoryTab`, `JobCardPhotosTab`), `JobCardDrawer`, `PhotoUploader`.
4. Wire route in `App.tsx`, sidebar entry, and link from `AppointmentModal` / `Appointments` page.

## Out of scope (this round)

- Editing the auto-generated job number format / multi-stage workflow rules.
- Email/SMS notifications when a job card is created.
- Client-portal visibility of job cards (can add later).

Want me to proceed with the migration first? I'll send the SQL for your approval, then build the UI on top.