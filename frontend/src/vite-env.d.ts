/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** Optional: full URL of the API when the frontend is hosted on a different origin. */
  readonly VITE_SERVER_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
