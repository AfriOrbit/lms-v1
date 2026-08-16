# Node version

There is deliberately **no `engines` field** in package.json.

Both Node 22 and Node 24 were verified end to end — `next build` exits 0 on
each, and every route (`/`, `/catalog`, `/catalog/simulators`, `/login`,
`/setup`, and the marketing apex) returns 200 under both, with no runtime
errors. The app does not care.

An `engines` pin was tried twice and each time it made things worse rather than
better:

- `">=20.9.0"` produced *"will automatically upgrade when a new major Node.js
  Version is released"*.
- `"22.x"` produced *"the Node.js Version defined in your Project Settings
  ('24.x') will not apply"* — it silently overrode a setting that had been
  chosen on purpose in the dashboard.

Neither warning ever indicated a real problem, but both looked alarming in a
build log at exactly the wrong moment. With no `engines` field, Vercel uses the
version selected in **Project Settings → Node.js Version**, the warnings stop,
and the choice lives in one place.

## Reading a Vercel build log

Worth knowing, because two rounds of debugging were spent on warnings:

- A line starting `Warning:` is **not** a failure. The build continues.
- The **`Route (app)`** table with its `┌ ├ └` tree is printed **only after a
  successful build**. If you can see it, the build passed.
- A real failure ends with `Error: Command "npm run build" exited with 1` and
  no route table.

A green build with a broken page means the problem is at **runtime**, not
compile time — look at Vercel's *Runtime Logs* (not the build log), or open
`/api/health` on the deployment.
