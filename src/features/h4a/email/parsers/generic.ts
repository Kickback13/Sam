/**
 * Generic fallback: reads address, price, units and the listing link (plus
 * anything else it can find) from any email — broker blasts, forwarded notes,
 * formats we don't have a parser for yet. Its results are never "high"
 * confidence, so they always land in Needs review with the email beside them.
 */
import {
  findAddresses,
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
import type { EmailContext, ParsedCandidate } from "../types";

const MARKETPLACE =
  /loopnet|crexi|costar|ten-x|tenx|realtor|zillow|redfin|showcase|apartments\.com|catylist|reonomy|propertyshark/i;
const NOREPLY = /no-?reply|do-?not-?reply|alerts?@|notifications?@|mailer|news(letter)?@/i;

/** Broker = the original sender, when it's a person rather than a marketplace robot. */
function brokerFrom(ctx: EmailContext, segment: string) {
  const isPerson =
    ctx.fromAddress !== null &&
    !NOREPLY.test(ctx.fromAddress) &&
    !MARKETPLACE.test(ctx.fromDomain ?? "");
  const name = isPerson ? ctx.fromName : null;
  let company: string | null = null;
  if (name) {
    // Signature: the line after the broker's name, if it isn't a phone/email.
    const lines = ctx.text.split("\n").map((l) => l.trim());
    const i = lines.findIndex((l) => l.toLowerCase() === name.toLowerCase());
    const next = i >= 0 ? lines[i + 1] : null;
    if (next && !/\d{3}.*\d{4}|@|https?:/.test(next) && next.length <= 80) company = next;
  }
  return {
    broker_name: name,
    broker_company: company,
    broker_email: isPerson ? ctx.fromAddress : findEmail(segment),
    broker_phone: findPhone(isPerson ? ctx.text : segment),
  };
}

export function parseGeneric(ctx: EmailContext): ParsedCandidate[] {
  const addresses = findAddresses(ctx.text);
  if (addresses.length === 0) return [];

  // Dedupe addresses mentioned more than once; split the text into one segment per address.
  const unique = addresses.filter(
    (a, i) => addresses.findIndex((b) => b.address.toLowerCase() === a.address.toLowerCase()) === i,
  );
  const segments =
    unique.length === 1
      ? [{ address: unique[0], text: ctx.text }]
      : unique.map((a, i) => ({
          address: a,
          text: ctx.text.slice(a.index, unique[i + 1]?.index ?? ctx.text.length),
        }));

  return segments.slice(0, 25).map(({ address, text }) => {
    const units = findUnits(text);
    const sq = findSquareFeet(text);
    return {
      fields: {
        address: address.address,
        city: address.city,
        zip: address.zip,
        price: findPrice(text),
        units,
        property_type: findPropertyType(text, units),
        cap_rate: findCapRate(text),
        year_built: findYearBuilt(text),
        building_sqft: sq.building,
        lot_sqft: sq.lot,
        apn: findApn(text),
        listing_url: findListingLink(ctx.links),
        ...brokerFrom(ctx, text),
      },
      statedPricePerUnit: findStatedPricePerUnit(text),
    };
  });
}

/** Chip label for emails read by the generic reader. */
export function genericSourceLabel(ctx: EmailContext): string {
  const m = (ctx.fromDomain ?? "").match(MARKETPLACE);
  if (m) {
    const brand = m[0].toLowerCase();
    const names: Record<string, string> = {
      loopnet: "LoopNet",
      crexi: "Crexi",
      costar: "CoStar",
      "ten-x": "Ten-X",
      tenx: "Ten-X",
      showcase: "Showcase",
    };
    return `${names[brand] ?? brand.replace(/^./, (c) => c.toUpperCase())} email`;
  }
  return "Broker email";
}
