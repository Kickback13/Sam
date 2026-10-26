/**
 * ============================================================================
 *  PLACEHOLDER FIXTURE EMAILS — MADE UP FOR TESTS AND THE DEMO WORKSPACE ONLY
 * ============================================================================
 * None of these are real messages from LoopNet, Crexi, Google or any broker.
 * They imitate the general shape of marketplace alert emails so the parser
 * pipeline can be built and tested before Sam's real samples arrive (Phase 2B
 * replaces them). Every name, address, phone (555-01xx), email (@example.com)
 * and link (.example) is fictional. Never use them in Sam's workspaces.
 */
import type { InboundEmail } from "../types";

export type FixtureEmail = InboundEmail & { key: string; label: string };

export const LOOPNET_DIGEST: FixtureEmail = {
  key: "placeholder-loopnet-digest",
  label: "Placeholder: LoopNet-style saved-search digest (2 listings, plain text)",
  from: '"LoopNet (placeholder)" <alerts@loopnet.example>',
  subject: '2 new listings match your saved search "SD Multifamily 10-60 units"',
  html: null,
  text: `PLACEHOLDER SAMPLE - made-up email for tests. Not a real LoopNet message.

Your saved search "SD Multifamily 10-60 units" has 2 new matches.

1. Sample Ave Apartments
3100 Sample Ave, San Diego, CA 92104
Multifamily | 24 Units | Built 1964
Price: $4,950,000 ($206,250/Unit)
Cap Rate: 5.2%
Building Size: 18,400 SF | Lot: 14,000 SF
View Listing: https://www.loopnet.example/Listing/3100-Sample-Ave-San-Diego-CA/10000001/
Listed by Pat Sample, Example Realty Group, (619) 555-0190

2. Example Terrace
4415 Example St, San Diego, CA 92116
Multifamily | 12 Units | Built 1958
Price: $2,640,000 ($220,000/Unit)
View Listing: https://www.loopnet.example/Listing/4415-Example-St-San-Diego-CA/10000002/
Listed by Jordan Example, Imaginary Realty Partners, (619) 555-0191

Manage your saved searches: https://www.loopnet.example/my/saved-searches
Unsubscribe: https://www.loopnet.example/unsubscribe`,
};

export const CREXI_SINGLE: FixtureEmail = {
  key: "placeholder-crexi-single",
  label: "Placeholder: Crexi-style new listing (1 listing, HTML)",
  from: "Crexi (placeholder) <notifications@crexi.example>",
  subject: "New listing matches your saved search: Sample Court Fourplex",
  text: null,
  html: `<html><head><style>p{color:red}</style><title>Crexi</title></head><body>
<p>PLACEHOLDER SAMPLE - made-up email for tests. Not a real Crexi message.</p>
<h2>New listing matches your saved search</h2>
<h3><a href="https://www.crexi.example/properties/900001/sample-court-fourplex">Sample Court Fourplex</a></h3>
<p>1150 Fictional Ct, San Diego, CA 92105</p>
<table>
<tr><td>Asking Price</td><td>$1,195,000</td></tr>
<tr><td>Property Type</td><td>Multifamily</td></tr>
<tr><td>Units</td><td>4</td></tr>
<tr><td>Price/Unit</td><td>$298,750</td></tr>
<tr><td>Year Built</td><td>1958</td></tr>
<tr><td>Cap Rate</td><td>4.8%</td></tr>
<tr><td>Square Footage</td><td>3,600 SF</td></tr>
<tr><td>Lot Size</td><td>5,500 SF</td></tr>
<tr><td>APN</td><td>999-000-00-01</td></tr>
</table>
<p>Broker: Casey Example · Sample Property Advisors · (619) 555-0192 · casey.example@example.com</p>
<p><a href="https://www.crexi.example/properties/900001/sample-court-fourplex">View Property</a></p>
<p><a href="https://www.crexi.example/settings/notifications">Manage notifications</a></p>
<img src="https://tracking.crexi.example/open.gif" width="1" height="1">
<script>alert("this never runs")</script>
</body></html>`,
};

export const BROKER_FORWARD: FixtureEmail = {
  key: "placeholder-broker-forward",
  label: "Placeholder: broker email forwarded from Gmail (generic reader)",
  from: "Sam Placeholder <sam.placeholder@example.com>",
  subject: "Fwd: Off-market triplex in Golden Hill",
  html: null,
  text: `FYI

---------- Forwarded message ---------
From: Morgan Example <morgan.example@example.com>
Date: Mon, Oct 19, 2026 at 9:14 AM
Subject: Off-market triplex in Golden Hill
To: Sam Placeholder <sam.placeholder@example.com>

PLACEHOLDER SAMPLE - made-up email for tests.

Hi Sam,

I have an off-market triplex at 2208 Placeholder Way, San Diego, CA 92102 - asking $985,000. Built in 1948, about 2,700 sq ft on a 5,000 sq ft lot. Two of the three units are vacant.

Let me know if you want to see it.

Morgan Example
Example Brokerage Co.
(619) 555-0193`,
};

export const GMAIL_CONFIRMATION: FixtureEmail = {
  key: "placeholder-gmail-confirmation",
  label: "Placeholder: Gmail forwarding confirmation",
  from: "Gmail Team <forwarding-noreply@google.com>",
  subject:
    "(#123456789) Gmail Forwarding Confirmation - Receive Mail from sam.placeholder@example.com",
  html: null,
  text: `PLACEHOLDER SAMPLE - made-up email for tests.

sam.placeholder@example.com has requested to automatically forward mail to your email address.
Confirmation code: 123456789`,
};

export const NEWSLETTER: FixtureEmail = {
  key: "placeholder-newsletter",
  label: "Placeholder: market newsletter (no listings)",
  from: "Market Notes (placeholder) <news@example.com>",
  subject: "October market notes",
  html: null,
  text: `PLACEHOLDER SAMPLE - made-up email for tests.

Cap rates were flat this month across the county. Rents rose slightly in most submarkets.
Read more: https://news.example/october`,
};

export const PLACEHOLDER_EMAILS = [
  LOOPNET_DIGEST,
  CREXI_SINGLE,
  BROKER_FORWARD,
  GMAIL_CONFIRMATION,
  NEWSLETTER,
];
