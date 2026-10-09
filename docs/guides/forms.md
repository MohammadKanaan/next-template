# Forms

- React Hook Form + Zod via `zodResolver`. Schemas come from `lib/dto` and are the same ones the
  DAL validates with.
- Every form component starts with `'use client'` then `'use no memo'` (see **Hooks**: React Hook
  Form is not compatible with the React Compiler). Copy an existing form to get both.
- The form component owns `useForm` and hands validated values to the page through `onSubmit`. The
  page passes an `onSubmit` that calls a Server Action and returns its `ActionResult`; the form maps
  failures with `applyActionErrors` (field errors onto fields, otherwise `message` as a form-level
  alert).
- Hydrate/build helpers (`hydrateXForm`, `buildXAttributes`) live in a `utils.ts` beside the form.
- Keep field markup explicit — no field-definition arrays, no generic FormField wrapper.
- A control that is not a native input (the shadcn `Checkbox` in `components/Posts/Form`) is
  controlled and goes through RHF's `Controller`.
