export * from "./generated/api";
export * from "./generated/api.schemas";
export {
  setBaseUrl,
  setAuthTokenGetter,
  setExtraHeaders,
  clearExtraHeaders,
} from "./custom-fetch";
export type { AuthTokenGetter } from "./custom-fetch";
