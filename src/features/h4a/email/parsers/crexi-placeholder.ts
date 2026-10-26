/**
 * PLACEHOLDER FORMAT. Written against the made-up "Crexi-style new listing"
 * fixture (fixtures/placeholder-emails.ts), not a real Crexi email. Sam's real
 * alert samples replace this in Phase 2B. Reads only the email itself.
 */
import {
  addressFromLine,
  findApn,
  findCapRate,
  findEmail,
  findListingLink,
  findPhone,
  findPrice,
  findPropertyType,
  findSquareFeet,
  findStatedPricePerUnit,
  findUnits,
  findYearBuilt,
} from "../extract";
import type { EmailParser } from "../types";

export const crexiPlaceholderParser: EmailParser = {
  key: "crexi-new-listing",
  label: "Crexi new-listing alert (placeholder format)",
  sourceLabel: "Crexi alert",
  formatStatus: "placeholder",

  matches(ctx) {
    return (
      /(^|\.)crexi\.(com|example)$/.test(ctx.fromDomain ?? "") ||
      /\bcrexi\b/i.test(ctx.fromName ?? "")
    );
  },

  parse(ctx) {
    const lines = ctx.text.split("\n").map((l) => l.trim());
    const addrLine = lines.find((l) => addressFromLine(l));
    const address = addrLine ? addressFromLine(addrLine) : null;
    if (!address) return [];
    const units = findUnits(ctx.text);
    const sq = findSquareFeet(ctx.text);
    const brokerLine = lines.find((l) => /^Broker\s*:/i.test(l)) ?? "";
    const brokerParts = brokerLine
      .replace(/^Broker\s*:\s*/i, "")
      .split(/\s*[·|•]\s*/)
      .filter(Boolean);
    return [
      {
        fields: {
          address: address.address,
          city: address.city,
          zip: address.zip,
          price: findPrice(ctx.text),
          units,
          property_type: findPropertyType(ctx.text, units),
          cap_rate: findCapRate(ctx.text),
          year_built: findYearBuilt(ctx.text),
          building_sqft: sq.building,
          lot_sqft: sq.lot,
          apn: findApn(ctx.text),
          broker_name: brokerParts[0] ?? null,
          broker_company: brokerParts[1] ?? null,
          broker_phone: findPhone(brokerLine),
          broker_email: findEmail(brokerLine),
          listing_url: findListingLink(ctx.links),
        },
        statedPricePerUnit: findStatedPricePerUnit(ctx.text),
      },
    ];
  },
};
