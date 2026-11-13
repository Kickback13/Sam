/**
 * Crexi listing emails in the REAL Crexi layout (verified against four real
 * "You've shared …" emails, Nov 2026), filled with MADE-UP values. Every
 * address, name, APN and link here is fictional; the real emails are not stored
 * in the repo. Tests and the Demo workspace only, never Sam's workspaces.
 */
import type { InboundEmail } from "../types";

export type FixtureEmail = InboundEmail & { key: string; label: string };

type CrexiLayout = {
  subject: string;
  header: string[];
  /** Header button caption ("Property Flyer" / "Offering Memorandum"). */
  button?: string;
  details: [string, string][];
  brokers: string[];
  /**
   * How the app's HTML reader renders each detail: "cells" gives "Label | Value"
   * on one line, "lines" gives the label and the value on separate lines (both
   * occur, depending on Crexi's markup).
   */
  rows?: "cells" | "lines";
};

const row = (label: string, value: string, rows: "cells" | "lines") =>
  rows === "cells"
    ? `<table><tbody><tr><td class="dt">${label}</td><td class="dd">${value}</td></tr></tbody></table>`
    : `<div class="dt">${label}</div><div class="dd">${value}</div>`;

/** Builds the HTML the way Crexi lays it out: header, Property Details, Listing Contacts, footer. */
export function crexiEmail(layout: CrexiLayout): InboundEmail {
  return {
    from: "Crexi <emails@notifications.crexi.example>",
    subject: `You've shared ${layout.subject}`,
    text: null,
    html: `<html><head><style>.dt{color:#666}</style></head><body>
<img src="https://email.notifications.crexi.example/o/open.gif" width="1" height="1">
${layout.header.map((h) => `<div class="title">${h}</div>`).join("\n")}
<a href="https://email.notifications.crexi.example/c/fictional-token-1">${layout.button ?? "Property Flyer"}</a>
<h2>Property Details</h2>
${layout.details.map(([l, v]) => `<div class="column property-details">${row(l, v, layout.rows ?? "cells")}</div>`).join("\n")}
<h2>Listing Contacts</h2>
${layout.brokers.map((b) => `<div>${b}</div><a href="https://email.notifications.crexi.example/c/fictional-token-2">Contact Broker</a>`).join("\n")}
<p><a href="mailto:support@crexi.example">support@crexi.com</a></p>
<p>+ 888.555.0100</p>
<p>© 2026 Commercial Real Estate Exchange, Inc., All rights reserved.</p>
<p>100 Example Blvd, Los Angeles, CA 90000</p>
<p><a href="https://email.notifications.crexi.example/c/fictional-token-3">Unsubscribe</a></p>
</body></html>`,
  };
}

/** Layout 1: full address in the subject and on a header line. */
export const CREXI_FULL_ADDRESS: FixtureEmail = {
  key: "crexi-full-address",
  label: "Placeholder: Crexi listing (real layout, full address)",
  ...crexiEmail({
    subject: "1150 Fictional Ct, San Diego, CA 92105",
    header: ["Fictional Court Apartments", "1150 Fictional Ct, San Diego, CA 92105"],
    details: [
      ["Asking Price", "$4,950,000"],
      ["Property Type", "Multifamily"],
      ["Sub Type", "Apartment Building"],
      ["Square Footage", "18,400"],
      ["Price per SqFt", "$269.02"],
      ["Cap Rate", "5.20%"],
      ["Units", "24"],
      ["Year Built", "1964"],
      ["Lot Size (acres)", "0.32"],
      ["APN", "999-000-00-01"],
      ["Price/Unit", "$206,250"],
    ],
    brokers: ["Casey Example", "Jordan Sample"],
  }),
};

/** Layout 2: street alone on a header line, city only in a "|" segment. */
export const CREXI_STREET_AND_CITY: FixtureEmail = {
  key: "crexi-street-city",
  label: "Placeholder: Crexi listing (real layout, street + city segment)",
  ...crexiEmail({
    subject: "Just Listed | 18 Units | Escondido",
    header: ["900 West Example Avenue", "Just Listed | 18 Units | Escondido"],
    details: [
      ["Asking Price", "$4,100,000"],
      ["Property Type", "Multifamily"],
      ["Square Footage", "14,250"],
      ["Units", "18"],
      ["Year Built", "1996"],
      ["Zoning", "R-3"],
      ["APN", "9990000100"],
    ],
    brokers: ["Riley Example"],
    rows: "lines",
  }),
};

/** Layout 3: title only, no street address anywhere (numbers like "27,026" must not become one). */
export const CREXI_NO_ADDRESS: FixtureEmail = {
  key: "crexi-no-address",
  label: "Placeholder: Crexi listing (real layout, no address)",
  ...crexiEmail({
    subject: "Example Shores | 81-Unit Multifamily Asset with Value-Add Potential",
    header: [
      "Example Shores | 81-Unit Multifamily Asset",
      "Example Shores | 81-Unit Multifamily Asset with Value-Add Potential",
    ],
    button: "Offering Memorandum",
    details: [
      ["Asking Price", "$15,000,000"],
      ["Property Type", "Multifamily"],
      ["Square Footage", "27,026"],
      ["Units", "81"],
      ["Year Built", "1965"],
      ["APN", "999-031-17-00"],
    ],
    brokers: ["Morgan Example"],
    rows: "lines",
  }),
};

/** Layout 4: name + "Multifamily | 38+3 Units | $…/unit", no address. */
export const CREXI_NAME_ONLY: FixtureEmail = {
  key: "crexi-name-only",
  label: "Placeholder: Crexi listing (real layout, name only)",
  ...crexiEmail({
    subject: "Multifamily | 38+3 Units | $364,634/unit",
    header: ["Example Terrace", "Multifamily | 38+3 Units | $364,634/unit"],
    details: [
      ["Asking Price", "$13,250,000"],
      ["Units", "41"],
      ["Year Built", "1978"],
      ["APN", "999-310-35"],
    ],
    brokers: ["Avery Example"],
  }),
};

/**
 * Layout 5: the plain-text copy Gmail sends when a Crexi email is forwarded
 * (verified on a real forward, Nov 2026). Details are "Label Value" on one line,
 * links appear as "<https://…>" lines, images as "[image: …]", and the
 * forwarder's signature (with its own street address) follows Crexi's footer.
 */
export const CREXI_GMAIL_FORWARD: FixtureEmail = {
  key: "crexi-gmail-forward",
  label: "Placeholder: Crexi listing forwarded from Gmail (plain text)",
  from: "Sam Placeholder <sam.placeholder@example.com>",
  subject: "Fwd: You've shared Just Listed | 22 Units | Escondido",
  html: null,
  text: `---------- Forwarded message ---------
From: Crexi <emails@notifications.crexi.example>
Date: Fri, Nov 13, 2026 at 9:55 AM
Subject: You've shared Just Listed | 22 Units | Escondido
To: Sam Placeholder <sam.placeholder@example.com>



<https://email.notifications.crexi.example/c/fictional-token-1>


<https://email.notifications.crexi.example/c/fictional-token-2>

700 North Sample Avenue
<https://email.notifications.crexi.example/c/fictional-token-3>
Just Listed | 22 Units | Escondido
Property Flyer
<https://email.notifications.crexi.example/c/fictional-token-4>
Property Details
Asking Price $5,500,000
Property Type Multifamily
Sub Type Apartment Building
Square Footage 16,800
Price per SqFt $327.38
Cap Rate 5.75%
Pro-Forma Cap Rate 6.40%
Units 22
Year Built 1998
Lot Size (acres) 0.75
APN 999-120-44-00
Price/Unit $250,000
Ownership Fee Simple
Listing Contacts

Taylor Example
<https://email.notifications.crexi.example/c/fictional-token-5>

Contact Broker
<https://email.notifications.crexi.example/c/fictional-token-6>

Quinn Sample
<https://email.notifications.crexi.example/c/fictional-token-7>

Contact Broker
<https://email.notifications.crexi.example/c/fictional-token-8>


[image: Email]
<https://email.notifications.crexi.example/c/fictional-token-9>
  [image: Phone]
<https://email.notifications.crexi.example/c/fictional-token-10>

[image: Email]   support@crexi.com   [image: Phone]   + 888.555.0100
<(888)%20555-0100>

[image:
facebook]
<https://email.notifications.crexi.example/c/fictional-token-11>

© 2026 Commercial Real Estate Exchange, Inc., All rights reserved.
100 Example Blvd, Los Angeles, CA 90000
<https://email.notifications.crexi.example/c/fictional-token-12>
  |   Unsubscribe
<https://email.notifications.crexi.example/c/fictional-token-13>

--
*Sam Placeholder*
3100 Sample Ave San Diego Ca 92104
`,
};

export const CREXI_EMAILS = [
  CREXI_FULL_ADDRESS,
  CREXI_STREET_AND_CITY,
  CREXI_NO_ADDRESS,
  CREXI_NAME_ONLY,
  CREXI_GMAIL_FORWARD,
];
