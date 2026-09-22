/** Runtime configuration. All values are build-time env (Vite `import.meta.env`). */
export const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ??
  'http://localhost:8000/api/v1';

export const IS_DEV: boolean = import.meta.env.DEV;
