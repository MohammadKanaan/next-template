<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Next Template Guidance

## Sources Of Truth

- Treat the user's current request as the primary source of truth.
- When a downstream project provides a visual reference, use it only as the UI source. Do not copy
  its code structure, component naming, state management, data flow, or API conventions.
- Use Revcube as the primary code-structure reference for reusable components: component
  ownership, primitive wrapping, props, slots, and file boundaries. Use this template and the
  target Next.js repository for surrounding Next architecture.
- Revcube is a structure reference only. Do not copy its UI values, domain names, routes, or data
  contracts into downstream projects. Its **legacy** service layer (`services/apiUtils.ts`,
  lowercase service files, `presentResponse`) must not be used.
- Follow the target backend and presenter layer for domain names, response keys, and data contracts.

## UI Fidelity

- Match the supplied visual reference exactly before introducing design-system assumptions. Check
  dimensions, spacing, borders, colors, icon geometry, and shape independently.
- For every UI change, explicitly verify border radius, border width/color/opacity, element height,
  font size/weight/line-height, and hover/focus/disabled states against the rendered reference before
  considering the work complete. Source utility names are not proof of rendered output; when they
  conflict with the rendered reference, follow the rendered reference.
- Do not add rounding because a component commonly has rounded corners. When the reference is
  square, use zero border radius. A `square` component variant must resolve to `rounded-none`.
- Brand marks and account avatars that are square in the reference must remain square. Do not apply
  a rounded class and override it elsewhere.
- Use the same icon family and geometry shown in the reference. When the reference uses a Lucide
  icon, use the corresponding Lucide icon or its exact local wrapper rather than a substitute.

## Scope And Reuse

- Keep changes narrowly scoped and do not modify unrelated files.
- Use Tailwind utility classes only inside `components/SCN`, where the shadcn components require
  them. Tailwind directives and layers also belong inside `components/SCN`. Everywhere else, use
  semantic component classes with CSS Modules (`styles.module.scss`) or `styles/global.scss`; never
  use Tailwind utilities, directives, layers, or `@apply`.
- Inside `components/SCN`, use Tailwind only on the actual shadcn or Radix primitive
  implementation. Native wrapper and layout elements added by the template must use semantic
  classes with a CSS Module.
- Keep every TypeScript and TSX source line in `components/SCN` within the configured Prettier
  `printWidth` of 100 characters. Prettier cannot split long class literals automatically, so group
  Tailwind classes into arrays passed to `cn`, `cva`, or `className`. Preserve class order and do
  not disable the ESLint line-length rule to accommodate styling.
- Keep every source line within the repository's Prettier `printWidth`, including Tailwind class
  definitions in `components/SCN`. Prettier does not wrap string literals, so split long class
  lists into arrays of short, logically grouped strings instead of leaving oversized lines or
  disabling formatting rules.
- Do not use the `style` prop, inline styles, computed style objects, or direct DOM style writes
  when a class or named variant can represent the value, especially inside SCN components. Use a
  style binding only for a genuinely runtime value that cannot be represented by a finite class or
  variant.
- Reuse existing shadcn components and established variants. Put shape behavior in the owning
  component or variant instead of global overrides or competing classes.
- Style template components with the template's own tokens and visual conventions. Sync portable
  component APIs and behavior from downstream projects, not their colors, radii, border treatments,
  dimensions, or one-off visual variants. Keep a restrained set of broadly useful variants rather
  than reproducing every downstream variant.
- Keep app-component behavior and styling in the app component. Do not push feature-specific APIs
  such as `appearance="modal"` into generic SCN primitives. A shared `Modal` should follow
  Revcube's self-contained structure and must not be implemented as an SCN `Dialog` appearance.
- Give component families their own wrappers when Revcube does so. Do not alias Dialog wrappers as
  SidePanel wrappers merely because both use Radix dialog primitives internally.
- When a reusable component changes, keep its component-catalog examples synchronized where the
  target project provides such a page.
- Name global design tokens by reusable semantic role or scale, never after a component, feature,
  page, or literal color hue. Keep component-specific CSS custom properties scoped inside the
  owning component. Standard third-party runtime variables may retain the names required by that
  library.
- Keep this repository useful as a reusable project baseline. When a downstream project adds a
  project-agnostic component capability, bring it back into this template when practical.
  Portable capabilities include generic props, variants, states, accessibility and interaction
  behavior, attribute forwarding, and component-catalog coverage. Do not import downstream
  colors, radii, exact visual dimensions, domain behavior, routes, naming, or data contracts.
- Reusable form controls own their visible label through a `label` prop using the shared Label
  treatment. The label and control must share one component-owned semantic root so they remain one
  layout item. Do not compose a separate Label beside a reusable form control or introduce a
  generic FormField wrapper. The shared Label renders the red required marker automatically when
  the field is required.
- Pages and parent components must never pass `className`, `style`, utility classes, or CSS
  selectors that alter a reusable component or wrapper component's visual styles. Use an existing
  named prop or variant; if a reusable visual option is genuinely missing, add a generic
  component-owned API.
- When a label or layout wrapper would otherwise receive props meant for the actual control,
  destructure the props the wrapper owns and spread the remaining props onto the actual native or
  Radix control. Do not use prop routing to add consumer-specific visual styles; wrapper components
  still own their complete visual shell.
- Reusable wrappers declare only the props they own or inspect. Forward every remaining prop and
  event handler directly to the wrapped native or Radix control; type wrapper props as
  `ComponentProps<typeof Control> & OwnedProps` and do not re-declare the control's props one by
  one.
- Bind declared props that also belong on the inner control explicitly instead of rebuilding a
  forwarded props object. Keep one canonical `value`/`onChange` contract (or
  `checked`/`onCheckedChange` for Radix toggles), omit no-op optional defaults, and let concise ARIA
  fallbacks be overridden by later spread props without type-guarding fallthrough values. Generate a
  label-association ID for a checkbox, switch, or radio control only when it cannot use a native
  wrapping label; caller-provided IDs still fall through for indexing, deep links, or focus
  targeting.
- Native label and layout wrappers use descriptive semantic classes with one component-owned CSS
  Module. Keep Tailwind utilities on the actual shadcn or Radix primitive only.
- Low-level SCN primitives may style the Radix element they directly own. This does not permit
  their callers to customize them with `className` or `style`.

## Data Layer

- Services extend `API` and return `ApiResponse<T>`.
- `*Response`, `*Attributes`, and `*ListParams` types live next to their service.
- Presenters live in `presenters/<Domain>/<Name>Presenter.ts`, are built at consumption, and never
  cross the Server to Client Component boundary.
- Route Handlers stay thin: validate, call a repository, serialize.
- Server Components use repositories directly.
- Forms own their `useForm` and Zod schema and hand validated values to the page, which owns the
  request.

## Decisions

- Record framework and library choices in `docs/DECISIONS.md`.

## Verification

- Run formatting, targeted linting, and the production build for frontend changes when practical.
- Verify responsive geometry against the visual reference at the reference viewport size.
