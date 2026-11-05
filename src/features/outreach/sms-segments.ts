/** Segments a text will be billed as (GSM-7: 160/153; anything else: 70/67). */
export function smsSegments(body: string): number {
  if (!body) return 0;
  const gsm =
    /^[\n\r !"#$%&'()*+,\-./0-9:;<=>?@A-Z_a-z£¥èéùìòÇØøÅåΔΦΓΛΩΠΨΣΘΞÆæßÉÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/;
  const single = gsm.test(body) ? 160 : 70;
  const multi = gsm.test(body) ? 153 : 67;
  const len = [...body].length;
  return len <= single ? 1 : Math.ceil(len / multi);
}
