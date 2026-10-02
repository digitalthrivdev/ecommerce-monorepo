/** One credential an admin enters for an integration. Secret values are write-only; others are shown back. */
export type CredentialField = {
  key: string;
  label: string;
  secret: boolean;
  options?: readonly string[];
  /** May be left blank. */
  optional?: boolean;
  /** Shown under the input, e.g. where to find the value. */
  help?: string;
  /** Pre-filled when nothing is saved yet. */
  default?: string;
};

export type Credentials = Record<string, string>;

/** Public values in full; secrets only by their last characters, and not at all when short. */
export function summarizeCredentials(fields: readonly CredentialField[], credentials: Credentials | null) {
  return fields.map((field) => {
    const value = (credentials ? credentials[field.key] : field.default) || null;
    return {
      key: field.key,
      label: field.label,
      secret: field.secret,
      options: field.options ?? null,
      optional: field.optional ?? false,
      help: field.help ?? null,
      value: field.secret ? null : value,
      hint: field.secret && value ? (value.length >= 12 ? `ends in ${value.slice(-4)}` : "saved") : null,
    };
  });
}

/** An admin's edit over the saved values: blank secret fields keep the saved value. */
export function mergeCredentials(
  fields: readonly CredentialField[],
  input: Record<string, string>,
  saved: Credentials | null,
) {
  return Object.fromEntries(
    fields.map((field) => {
      const value = input[field.key]?.trim() ?? "";
      return [field.key, field.secret && !value ? (saved?.[field.key] ?? "") : value];
    }),
  );
}
