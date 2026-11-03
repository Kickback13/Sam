# Training guide: using the platform

For Sam, Vianney and the AZH team. One section per screen: what it's for, and the few things to know.
Every screen works on a phone. Sign in at the app address with your email; a sign-in link is emailed to you.

**Two rules that apply everywhere**

- **Every number shows where it came from.** Hover or tap the small source note: an alert email, a county record, an import, or "Entered by {name}". If a number has no source, don't rely on it.
- **The app never texts or emails anyone by itself.** Newsletters go out only when you send them, only to people who are allowed to receive them, and only once email sending is connected.

Switch between **Housing4All** and **AZH Builders** with the workspace switcher at the top of the menu. Each workspace has its own data, colors and menu. The **Demo** workspaces hold made-up data for practice.

---

## Housing4All (real estate)

### Today

Your morning page:

- new deal matches;
- the verification queue (listings to check against county records);
- tasks due;
- recent activity.

Start here every day.

### My tasks

Everything assigned to you, by due date. Tick a task to complete it. Tasks from the AI receptionist ("Call back …") land here too.

### Deal Finder

Listings come in four ways:

- **Paste an email:** paste a CoStar, LoopNet or Crexi alert email.
- **Upload a CSV:** an export from one of those sites.
- **Add by hand.**
- **Forwarded alerts:** once forwarding is set up, they arrive automatically.

Each listing:

- is scored against your **buy box** (Settings → Buy box: units, ZIPs, price, price per unit, year built);
- shows every field with its source;
- has **Verify**, which checks it against San Diego County records;
- can be **promoted** to a deal in the Pipeline when it's worth pursuing.

Duplicates are merged automatically.

### Alerts

Matches that fit your buy box, newest first. Email alerts to Sam stay off until email sending is connected.

### Prospects

Who to call next, built from data already in the workspace. Nothing is sent from here.

- **Brokers:** every broker who has sent you listings, ranked by:
  - listings;
  - buy-box matches (score 70+);
  - volume;
  - deals in your pipeline;
  - closed deals.

  Switch the order with the buttons at the top. **Add to People** makes the broker a contact (role Broker); if they're already a contact, the row links to them.

- **Long-hold owners:** properties whose last sale was at least 15 years ago (change it with the filters, along with minimum units and ZIP).
  - Each row shows the years held, the sale date's source, and the owner, with do-not-call or unsubscribed warnings.
  - Properties with no sale date yet are counted at the top: add the date on the property to include them.

### Pipeline

Deals move through **New Deal → Qualified → Contacted → Interested → Underwriting → Offer → Closed** (or Lost).

- Drag a card to move it.
- Click a card for details, contacts, activity and tasks.
- Totals per stage are at the top of each column.

### People and Companies

Your contacts: brokers, owners, property managers. Each contact page shows phones, emails, tags, properties, deals and the full activity timeline.

- **Import:** People → Import (a CSV, including GoHighLevel exports). Duplicates are matched by phone and email.
- **"Can we reach them right now?"** on each contact shows whether texting or emailing is allowed. It checks:
  - consent;
  - opt-outs;
  - do-not-call;
  - quiet hours (8am–9pm by default; changeable in Settings → Outreach).
- If someone texts **STOP** (for example, a reply to your own phone), press **"… texted STOP"** on their page. That number is never texted again.

### Properties and Analyze

Property records with owner, units, size and year built, each with its source. Open a property → **Analysis** to underwrite it:

- price per unit, rents, NOI, cap rate, DSCR and cash flow, updating as you type;
- red flags (for example, negative cash flow, thin debt coverage, a price above the comps);
- comps and saved scenarios;
- **PDF** export.

**Analyze** lists every analyzed property with its key numbers.

The property-data and AI-summary cards say **Not connected** until RentCast and an Anthropic key are added.

### Outreach

Newsletters:

1. Write one in the editor with a live preview.
2. Check the audience. It shows who is excluded and why: no consent, unsubscribed, or on the do-not-send list.
3. Send.

Every email gets an unsubscribe link and the mailing address from Settings → Outreach. Sending is **Not connected** until Resend is set up.

### Network

Your private investor community. Members sign in at their own address (`/n/housing4all`) and see only the community: deals you post, events, the member directory and comments. **They never see the CRM.**

- **Invite people:** Network → Members & invites → create a link.
- **Run it:** pin or hide posts, add events, sort members into segments.

Members can install the community on their phone like an app.

### Receptionist

The AI phone receptionist (once Twilio and ElevenLabs are connected):

- **Setup:**
  - business hours;
  - how long your phone rings before the AI answers;
  - **routes**: who gets which calls, by keywords like "repair" or "tenant", and who gets the follow-up task.
- **Test routing:** type what a caller might say and see where the call would go.
- **Calls tab:** every call, with outcome, summary, transcript, contact and follow-up task. A new caller becomes a contact automatically.

### Settings

- **General & branding:** name, license, colors, fonts.
- **Members & invites:** who has access, and their role.
- **Pipelines:** stage names and order.
- **Buy box:** what counts as a deal.
- **Outreach:** sender name, From address, mailing address.
- **Integrations:**
  - forwarding address for alert emails;
  - GoHighLevel connection and import;
  - status of every outside service.

---

## AZH Builders (construction)

### Today

The AZH version shows:

- new requests (last 7 days);
- estimates waiting for a reply, and their dollar total;
- projects in progress;
- estimate visits this week;
- team tasks due.

### Requests

Homeowner requests from the website form (English or Spanish, with photos).

- Each request goes to the **San Diego** or **Fallbrook** office by ZIP code, and that office's assignees get a task.
- Open a request to:
  - see the contact, photos and consent record;
  - log a call;
  - assign it, or change its status or office;
  - **Schedule visit**;
  - **Convert to project**.

### Projects

Projects move through **Lead → Estimate → Bid Sent → Won → In Progress → Complete → Review** (or Lost). A project page has these tabs:

- **Overview:** scope, services, office, contract value.
- **Estimates:** line items with markup and tax calculated for you; **PDF** with both offices and the CSLB number; **Duplicate to revise** keeps old versions.
- **Schedule:** milestones (late ones are flagged) and site visits.
- **Budget:**
  - budget lines and costs (attach the receipt);
  - budget vs. actual, with variance and % used;
  - **change orders**: approved ones add to the contract value.
- **Files:** photos and documents.

### Schedule

The week view of estimate visits for both offices. Booking a visit that overlaps another one for the same estimator shows a warning.

### Settings → AZH

- CSLB license number (printed on estimates);
- service list;
- who gets new requests in each office;
- Fallbrook ZIP list;
- the code to embed the request form on the AZH website;
- cleanup of photos that were uploaded but never sent.

---

## Who can do what

| Role       | Can                                                                     |
| ---------- | ----------------------------------------------------------------------- |
| **Owner**  | Everything; only an owner can add, change or remove another owner       |
| **Admin**  | Everything else: settings, integrations, inviting admins/agents/viewers |
| **Agent**  | Work deals, contacts, tasks, projects; settings are read-only           |
| **Viewer** | Read only                                                               |

## Getting help

- Something looks wrong: take a screenshot, note the page and time, and send it to whoever maintains the app (see `docs/RUNBOOK.md` §6).
- Never paste passwords or API keys into a chat or email. Type them only into the page that asks for them.
