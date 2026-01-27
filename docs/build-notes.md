# Build Notes

- Turbopack is intentionally disabled for `pnpm build` because the current environment blocks CSS/PostCSS processing that spawns a helper process and binds a port.
- Exact error observed:
  - `TurbopackInternalError: [project]/src/app/globals.css [app-client] (css)`
  - `Caused by: creating new process; binding to a port; Operation not permitted (os error 1)`
- This is an environment limitation, not application logic.
- Webpack is a temporary, explicit workaround to keep production builds reliable.
