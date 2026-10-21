/**
 * PLACEHOLDER FORMAT. Written against the made-up "LoopNet-style saved search
 * digest" fixture (fixtures/placeholder-emails.ts), not a real LoopNet email.
 * Sam's real alert samples replace this in Phase 2B. Reads only the email
 * itself — the listing link is recorded, never fetched.
 */
import {
  addressFromLine,
  findApn,
  findCapRate,
  findListingLink,
  findPhone,
  findPrice,
  findPropertyType,
  findSquareFeet,
  findStatedPricePerUnit,
  findUnits,
  findYearBuilt,
} from "../extract";
import { extractTextLinks } from "../html";
import type { EmailParser, ParsedCandidate } from "../types";

export const loopnetPlaceholderParser: EmailParser = {
  key: "loopnet-saved-search",
  label: "LoopNet saved-search alert (placeholder format)",
  sourceLabel: "LoopNet alert",
  formatStatus: "placeholder",

  matches(ctx) {
    return (
      /(^|\.)loopnet\.(com|example)$/.test(ctx.fromDomain ?? "") ||
      /\bloopnet\b/i.test(ctx.fromName ?? "")
    );
  },

  parse(ctx) {
    // One block per numbered listing ("1. Sample Ave Apartments").
    const blocks = ctx.text
      .split(/\n(?=\s*\d{1,2}\.\s+\S)/)
      .filter((b) => /^\s*\d{1,2}\.\s/.test(b));
    const out: ParsedCandidate[] = [];
    for (const block of blocks) {
      const lines = block.split("\n").map((l) => l.trim());
      const addrLine = lines.slice(1, 4).find((l) => addressFromLine(l));
      const address = addrLine ? addressFromLine(addrLine) : null;
      if (!address) continue;
      const units = findUnits(block);
      const sq = findSquareFeet(block);
      const listedBy = block.match(/^\s*Listed by\s+(.+)$/im)?.[1] ?? null;
      const [brokerName, brokerCompany] = listedBy
        ? listedBy.split(",").map((s) => s.trim())
        : [null, null];
      const links = [...extractTextLinks(block), ...ctx.links];
      out.push({
        fields: {
          address: address.address,
          city: address.city,
          zip: address.zip,
          price: findPrice(block),
          units,
          property_type: findPropertyType(block, units),
          cap_rate: findCapRate(block),
          year_built: findYearBuilt(block),
          building_sqft: sq.building,
          lot_sqft: sq.lot,
          apn: findApn(block),
          broker_name: brokerName ?? null,
          broker_company: brokerCompany ?? null,
          broker_phone: listedBy ? findPhone(listedBy) : null,
          listing_url: findListingLink(extractTextLinks(block)) ?? findListingLink(links),
        },
        statedPricePerUnit: findStatedPricePerUnit(block),
      });
    }
    return out;
  },
};
