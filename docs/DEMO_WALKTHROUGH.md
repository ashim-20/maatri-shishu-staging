# Synthetic demo walkthrough

Start with `npm ci` and `npm run dev`, then open http://127.0.0.1:3000. Use `npm run build` followed by `npm run start` to demonstrate full offline reload/installability. All seeded people and care events are fictional; dates are generated relative to the day the browser is first seeded.

1. **Today:** inspect active mothers, registered children, due follow-ups, pending verification and the next clinic session. Open a work item to see the person and reason.
2. **Mother registration:** search for a person first. Register a fictional mother with a settlement and consent; leave phone blank. A matching name creates a supervisor review while preserving separate identities.
3. **Pregnancy and care:** open the mother, add a pregnancy episode with known or unknown dates, then record ANC. Change the event source to reported/card transcription to show that it awaits verification. Maternal Td records administration history without recommending a dose.
4. **Birth and child:** add a child linked to a mother/pregnancy, enter birth source/place/time, and give consent. Add a second child and choose the existing birth event to demonstrate twins. Each child has an independent care history.
5. **Unknown date:** register an independent child with a guardian and no DOB. The app keeps the date unknown and creates review state instead of inventing a timeline.
6. **Vaccination evidence:** open a seeded child's profile, record a reported dose, then verify it with a reason as an authorized health worker. Check that the original source remains visible. Add a correction to retain the original event with a superseding record.
7. **Follow-up:** record “attended elsewhere—verify” or another contact outcome. The care task stays open. As a health worker, choose “Confirm completed care” and link a matching verified event to close an appointment.
8. **Clinic calendar:** create a fictional outreach session, edit its date or cancel it with a note. The child's theoretical planned due dates remain separate.
9. **Reports and print:** inspect labelled due/verified counts. Open a profile and print its summary; it includes the official-card disclaimer. JSON export is available to health workers/supervisors.
10. **Roles and languages:** in Settings, try FCHV, supervisor, clinical reviewer and programme approver roles. Administrative roles cannot browse clinical people. Try Nepali/Bhojpuri and reload to confirm the preference persists; wording is still a draft.
11. **Offline:** after the production shell loads online, go offline in browser tools. Register a fictional record, reload while offline and find it again. Reconnect and inspect the queue. In demo mode acknowledgement is local; demonstrate actual server receipts only in a separately configured Supabase test workspace.
12. **Reset:** use Settings → Reset practice data. It restores fictional records and clears demo changes. This control is available only in demo mode.

The bundled vaccination schedule and ANC target are illustrative test fixtures. Do not describe this walkthrough as a clinically approved demonstration or use it to advise a mother/caregiver. Connected test setup and the remaining release gates are documented separately.
