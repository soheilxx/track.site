/**
 * Limits of the Platform users forms, shared by the client components and the server module
 * (`server/ops/users.ts` re-exports them): no server import inside a client bundle.
 */
export const ROLE_REASON_MIN = 5;
export const ROLE_REASON_MAX = 500;
export const ROLE_TICKET_MAX = 100;
