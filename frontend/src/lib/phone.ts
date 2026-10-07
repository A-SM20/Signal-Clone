/** "+15550100001" → "+1 555-010-0001" for US numbers; other numbers are shown as stored. */
export function formatPhone(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `+1 ${m[1]}-${m[2]}-${m[3]}` : e164;
}
