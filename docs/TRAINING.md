# Training guide: using the platform

For Sam, Vianney and the AZH team. One section per screen: what it's for, and the few things to know.
Every screen works on a phone. Sign in at the app address with your email; a sign-in link is emailed to you.

**Two rules that apply everywhere**

- **Every number shows where it came from.** Hover or tap the small source note: an alert email, a county record, an import, or "Entered by {name}". If a number has no source, don't rely on it.
- **The app never texts or emails anyone by itself.** Newsletters go out only when you send them, only to people who are allowed to receive them, and only once email sending is connected.

Switch between **Housing4All** and **AZH Builders** with the workspace switcher at the top of the menu. Each workspace has its own data, colors and menu. The **Demo** workspaces hold made-up data for practice. In the Housing4All Demo, **Outreach → Sequences** has two bilingual sample sequences with a step due now for a Spanish-speaking and an English-speaking contact, and the sample newsletter has a Spanish version. Open them to see how Spanish works before writing your own.

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
- **Property managers:** every company whose type is _Property management_ (with its people), plus anyone with the _Property manager_ role who isn't at a company yet. Each row shows deals you've had together, when you last talked (a logged call, text, note, email or meeting), and touches in the last 90 days. Sort by **Longest since we talked** for a follow-up list.

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
- comps and saved scenarios. **Suggested comps** lists nearby, similar-size sales and rents the workspace already has: sales on file for other properties, comps saved on other properties, and comparables from RentCast estimates already fetched. Each shows how far away it is, a match score and its source. Click **Add** (or **Add all**) to keep one. Nothing is added until you do;
- **PDF** export.

**Analyze** lists every analyzed property with its key numbers.

The property-data and AI-summary cards say **Not connected** until RentCast and an Anthropic key are added.

- **Ownership, tax & estimates** (on the analysis page, once RentCast is connected): _Fetch property record_ fills in owner, mailing address, last sale, assessed value and tax, each marked "Source: RentCast" with the date, and only fills fields that were blank. _Value estimate_ and _rent estimate_ show RentCast's number with its range and comparables. Each button is one request; the page shows how many are left this month.

### Outreach

Newsletters:

1. Write one in the editor with a live preview.
2. Check the audience. It shows who is excluded and why: no consent, unsubscribed, or on the do-not-send list.
3. Send.

Every email gets an unsubscribe link and the mailing address from Settings → Outreach. Sending is **Not connected** until Resend is set up.

**Spanish version.** Click **Add Spanish version** under the message and write a Spanish subject and message (the preview text is optional). Contacts whose language is **Spanish** get that version, with the footer and unsubscribe link in Spanish. Everyone else gets English. The audience check says how many prefer Spanish, and the preview has an **English / Español** switch. With no Spanish version, everyone gets English.

### Texts

Every contact page (Housing4All and AZH) has a **Texts** card: the conversation, and a box to send one text.

- **Off until set up.** The card says what's missing: Twilio account, sending number, or the switch. An owner or admin sets it up in **Settings → Integrations → Texting** (sending number, HELP reply, the link to paste into Twilio, then **Texting on**).
- **The gates:** a text only goes out if the contact isn't do-not-contact, has SMS consent on file, hasn't texted STOP, has a mobile number, and it's within texting hours (Settings → Outreach). If any check fails, the card says why and nothing is sent.
- **Replies** show in the card and on the timeline, with a task to answer. **STOP** blocks texting that number at once, and **START** undoes it. **HELP** gets your HELP reply.
- **Spanish:** **ALTO**, **PARA**, **PARAR**, **DETENER**, **CANCELAR** and **BAJA** work like STOP, and **INICIAR** or **REANUDAR** like START. **AYUDA** gets the Spanish HELP reply if one is set in Settings → Integrations → Texting, otherwise the English one.
- One person, one text: there are no automatic or bulk texts.

### Sequences (Outreach → Sequences)

A sequence is a series of emails and texts, each due a set number of days after the last. It's good for a new owner lead or a broker you want to stay in front of.

1. **New sequence:** add steps and choose email or text and the days to wait. Use fields like `{first_name}` and `{my_name}`. Tick **Active** and save.
2. On a contact's page, under **Sequences**, pick it and click **Add**.
3. When a step is due, it shows under **Due now**, filled in for that person:
   - email: **Open in my email**, send it, then click **I sent it**;
   - text: **Send text** (only once texting is on, and only if the contact passes the checks);
   - or **Skip**, or **Stop** for this person.

Nothing is ever sent by itself. Marking someone do-not-contact, or them texting STOP, ends their sequences straight away.

**Spanish versions.** Under any step, click **Add Spanish version** and write the Spanish subject and message, using the same fields like `{first_name}`. When that step comes due for a contact whose language is **Spanish** (set on the contact), the Spanish version is filled in. A **Use English / Usar español** button switches between them before sending. If a Spanish speaker's step has no Spanish version, the step says so and shows the English one.

### Messages

**Messages** (in the menu for both businesses) lists every text conversation, newest first.

- **Needs reply** shows only the people waiting on an answer: they texted after your last text.
- Click a conversation to read it and reply. It's the same Texts card as on the contact page, with the same checks.
- Until texting is set up, the page says so and stays empty.

### Calendar (booking page)

Leads book a call with you at `/b/housing4all`. The page is **off** until an owner or admin switches it on.

- **Set up** (Calendar → Booking page settings): who leads book with, meeting length, gap between calls, minimum notice, how far ahead, and your bookable hours. Then tick **Booking page on** and save.
- **Share the link** from the Calendar page in emails, on your website or in GHL.
- **When someone books:** they become a contact (or their existing contact is updated), the meeting is logged on their timeline, and the host gets a task at that time. The lead can add the call to their own calendar from the confirmation page. **No email or text is sent.**
- **Spanish:** the page shows in Spanish when the visitor's browser prefers it, and an **English / Español** button switches it. To send someone straight to the Spanish page, share `/b/housing4all?lang=es`. Your title and intro show as you typed them, so write them in both languages if you like. A new contact who books in Spanish is saved with language **Spanish**, so their follow-up steps use the Spanish versions.
- **Coming up** lists every booking. Mark it **Done** or **No-show**, or **Cancel** it, which frees the time.
- **Block time** for anything that isn't in the app (a tour, an appointment) so nobody can book over it.
- **See bookings in Google Calendar:** an owner or admin clicks **Create calendar link** and pastes it into Google Calendar → Other calendars → From URL. It's read-only and private. Making a new link turns the old one off.

### Network

Your private investor community. Members sign in at their own address (`/n/housing4all`) and see only the community: deals you post, events, the member directory and comments. **They never see the CRM.**

- **Invite people:** Network → Members & invites → create a link.
- **Run it:** pin or hide posts, add events, sort members into segments.
- **Photos:** add up to 4 photos to a post (JPG, PNG or WebP, up to 5 MB each). Only your team and the members can see them.
- **Notifications:** once the notification keys are set up, members can tap **Notify me about new posts and events** in the app. They get a notification for each team post and event, but not for other members' posts. On iPhone, they need to install the app first.

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

### People (communication hub)

Open a contact to see the **Communication hub**: every call and note, their homeowner requests, estimate visits, estimates and projects in one list, newest first.

- Use the chips (**Calls, Notes, Requests, Visits, Estimates, Projects**) to narrow it.
- Click an entry to open the request, schedule, estimate or project it came from.
- Log a call or add a note above the hub; it appears right away.
- Texts and emails say **Not connected** until messaging is set up.

### Community

AZH's private community app: the same one Housing4All calls the Network, in AZH words.

- **Invite people:** Community → Members & invites. Pick their type (homeowner, general contractor, subcontractor, investor, partner) and create a link. When they join, they become a contact with the matching role.
- **Run it:**
  - posts, including **projects** (type of work, budget, city);
  - events;
  - pin or hide posts;
  - sort members into segments.
- **Privacy:** members only ever see the community, never your contacts, projects or estimates.
- **Phones:** they can install it like an app.

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

## Reports (both businesses)

**Reports** (under Admin in the menu) shows how the business is doing over the last 30 days, 90 days or 12 months:

- open deals or projects and their value by stage;
- won, lost and win rate, and why deals were lost;
- new contacts and calls per week;
- Housing4All: listings, booked calls and texts. AZH: requests by office and estimates sent and accepted.

Every number is counted live from your records. Under any chart, **Show as table** lists the numbers.

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
