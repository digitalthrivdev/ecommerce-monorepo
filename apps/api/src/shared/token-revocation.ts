/** Holds a time in seconds: every token the user was issued at or before it is rejected. */
export const revokedTokensKey = (userId: string) => `auth:revoked:${userId}`;
