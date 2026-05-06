## Technician Appointment Calendar

Add a new feature to schedule on-site technician appointments with skills matching, working hours awareness, and a visual calendar view. This complements the existing Appointments page (which tracks sales/closer appointments) by adding a dedicated technician dispatch layer.

### What we'll build

**New page: `/technicians/calendar`** (admin + manager + team_leader access)

- **Technician roster panel** (left): list of technicians with name, skills (chips), home address, and working hours.
- **Calendar view** (right): day / week toggle using `react-day-picker` + a custom time-grid. Each technician gets a column in week view; appointments render as colored blocks.
- **Create / edit appointment dialog**: pick technician, lead (searchable from existing `contacts`), start/end time, address (defaults to lead address). Validates against:
  - Technician working hours
  - Required skill vs. technician skills
  - Overlap with other appointments for the same technician
- **Drag-to-reschedule** (phase 2 — not in this plan)

### Data model (new tables)

```text
technicians
  id, company_id, user_id (nullable, optional link to profiles)
  name, home_address, phone, email
  skills text[]                -- e.g. {'solar_install','roof_inspection'}
  working_hours_start time     -- 08:00
  working_hours_end time       -- 17:00
  working_days int[]           -- 0=Sun..6=Sat, default {1,2,3,4,5}
  is_active bool
  created_at, updated_at

technician_appointments
  id, company_id
  technician_id  -> technicians.id
  contact_id     -> contacts.id (the lead)
  campaign_id    -> campaigns.id (nullable)
  appointment_id -> appointments.id (nullable, link to sales appointment)
  lead_address text
  start_time timestamptz
  end_time   timestamptz
  required_skill text
  status: scheduled | en_route | on_site | completed | cancelled | no_show
  notes text
  created_by uuid
  created_at, updated_at
```

**RLS**: company-scoped via `is_same_company(company_id)` (matches existing pattern). Admins bypass. Agents read-only on technicians of their company; admins/managers/team_leaders full CRUD.

**Validation trigger** (not CHECK constraint, per project standards): ensure `end_time > start_time` and no overlapping technician_appointments for the same technician.

### Files to add

- `supabase/migrations/<ts>_technicians.sql` — tables, RLS, overlap-prevention trigger
- `src/hooks/use-technicians.ts` — list/create/update/delete technicians
- `src/hooks/use-technician-appointments.ts` — list by date range + mutations
- `src/components/technicians/TechnicianModal.tsx` — create/edit technician
- `src/components/technicians/TechnicianAppointmentModal.tsx` — create/edit appointment with skill + working-hours validation
- `src/components/technicians/TechnicianWeekGrid.tsx` — time-grid (8am–6pm, 30-min slots, one column per technician)
- `src/components/technicians/TechnicianDayView.tsx` — single-day all-tech view
- `src/pages/TechnicianCalendar.tsx` — page shell with day/week toggle, technician filter, date picker, "New appointment" button
- Route added in `src/App.tsx` under `RoleGuard` (admin/manager/team_leader)
- Sidebar entry added in `src/components/layout/AppSidebar.tsx` under the operations section

### TypeScript shape mapping

The user-provided types map to DB rows like this:

```ts
// Technician  (DB: technicians)
//   id, name, home_address -> homeAddress, skills,
//   working_hours_start/end -> workingHours.{start,end}

// Appointment (DB: technician_appointments)
//   id, technician_id -> technicianId, lead_address -> leadAddress,
//   start_time -> startTime, end_time -> endTime

// Lead — reuse existing contacts table
//   contacts.id, contacts.address, plus optional required_skill stored on the appointment
```

We'll keep the user's camelCase types as the **UI/domain layer**, with thin mappers to/from snake_case Supabase rows — same pattern as `useAppointments`.

### Out of scope (can follow up later)

- Route optimisation between technician home address and lead address
- Drag-and-drop rescheduling
- Mobile technician app / check-in
- SMS reminders to technicians
- Public booking link

### Open questions before building

1. Should technicians be linked to existing `profiles` (so a technician can also log in), or kept as standalone records managed by admins?
2. Should this calendar replace the existing `/appointments` page, live alongside it, or auto-create a technician appointment whenever a sales appointment is booked?
3. Who should have access — admin only, or also managers and team_leaders?
