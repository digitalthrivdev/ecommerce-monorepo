/** The names the API accepts for an address's state; the API's list is in shared/gst.ts. */
export const INDIAN_STATES = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
] as const;

const normalize = (name: string) => name.toLowerCase().replace(/&/g, "and").replace(/[^a-z]/g, "");

const ALIASES: Record<string, string> = {
  newdelhi: "Delhi",
  nctofdelhi: "Delhi",
  nationalcapitalterritoryofdelhi: "Delhi",
  orissa: "Odisha",
  pondicherry: "Puducherry",
  uttaranchal: "Uttarakhand",
};

/** The list's name for a state from the phone's geocoder or an older address, or null. */
export function matchState(name: string | null | undefined) {
  if (!name) return null;
  const normalized = normalize(name);
  return INDIAN_STATES.find((state) => normalize(state) === normalized) ?? ALIASES[normalized] ?? null;
}
