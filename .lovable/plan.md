Generate a Word (.docx) version of the existing `Summit_Leads_Workflow.mmd` so it can be shared/edited in Word.

### Approach

Use the docx skill (Node.js `docx` library) to programmatically build a structured, professional Word document — not just a flat text dump of the Mermaid file. The diagram itself doesn't render natively in Word, so I'll convert its content into readable, navigable sections.

### Document structure

1. **Title** — "Summit Leads — System Workflow", subtitle, generation date.
2. **Overview** — short paragraph explaining the doc covers admin, agent, team leader, and client flows plus background automation.
3. **Entry & Routing** — auth → role-based routing (admin / agent / team_leader / client), bullet list.
4. **Admin: Setup & Configuration** — bullet list (Users, CRM Settings, Imports → Mapper → Dry-run → Insert, Campaigns → Verify Caller ID → Activate).
5. **Agent: Dialing Loop** — ordered list following `useDialerQueue` → suppression filters → LeadCard → Telnyx WebRTC → call events → wrap-up → disposition branches (appointment / callback / retry / terminal).
6. **Background Automation** — bullets for `telnyx-webhook`, `ai-call-summary`, `predictive-dialer-engine` → `telnyx-create-call`, follow-up tasks.
7. **Team Leader: Oversight** — bullets for Live Calls (listen/whisper/barge), QA Dashboard, Agent Performance, Feedback loop.
8. **Client: Read-Only Portal** — short paragraph.
9. **Reports** — short paragraph on aggregate KPIs sourcing from recordings, summaries, tasks.
10. **Appendix: Mermaid source** — raw `.mmd` content in a monospaced block so anyone can re-render the diagram in Mermaid Live Editor or paste back into Lovable.

### Styling
- US Letter, 1" margins
- Arial default, 12pt body
- Heading 1 / Heading 2 overridden with consistent sizing & spacing
- Bullet lists via `LevelFormat.BULLET` (no unicode bullets)
- Appendix code in a monospaced run

### Output & QA
- Write to `/mnt/documents/Summit_Leads_Workflow.docx`
- Validate the .docx with the skill's `validate_document.py`
- Convert to PDF + page images and visually inspect every page for layout issues, clipping, or overflow before delivering
- Emit `<lov-artifact>` tag for the .docx

No app/codebase changes — this is a one-off document generation task into `/mnt/documents/`.