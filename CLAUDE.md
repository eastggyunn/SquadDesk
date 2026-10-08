# SquadDesk — Working Agreement

## Standing workflow: run these skills on every change, unasked (scope-limited)

After implementing any feature, fix, or refactor in this project, proactively run before considering the task done — do not wait to be asked again. These are scoped narrowly on purpose to keep token usage down; do not widen scope beyond what's below unless the user asks.

1. **`simplify`** — review ONLY the files changed in the current task (never the whole project). Apply fixes directly; skip anything that would change intended behavior, and say what was skipped and why. This project is a git repository (branch `main`), but the review target is still only the files actually touched in this task — not the whole uncommitted diff.
2. **`find-animation-opportunities`** followed by **`improve-animations`** — run ONLY when the task actually added or changed a new UI interaction (a new interactive element, a new open/close/transition state, a new form/panel/toggle), and scope the sweep to only those changed UI files. **Skip this step entirely** for tasks that only touch database/migrations, auth/server logic, docs, or config — no UI files means nothing to animate.

Do **not** proactively run `security-review` or `init`/documentation skills — only on explicit request.

## Before starting work

Do not re-explore the whole project before each task. Read only the files the prompt explicitly points to, plus files those directly depend on (imports, types, mappers actually needed to implement the change). Do not go read unrelated screens/features "just in case."

## Final report format

End every task with a short report, max 10 lines: **변경 파일 / 검증 결과 / 남은 작업** (changed files / verification result / remaining work). No other sections unless the user explicitly asked for more detail in that turn.

## Environment notes

- npm/node ARE available in this environment (`npm`, `node` on PATH) — run `npm run build` / typecheck yourself to verify changes rather than asking the user to. Only fall back to asking the user if a run genuinely fails to execute here.
- Established motion vocabulary (extend, don't invent new tokens): framer-motion springs from `lib/motion.ts` — `SPRING.sheet` (drawer), `SPRING.modal` (centered modals), `SPRING.popover` (popovers/date picker/tooltips/chevrons), `SPRING.collapse` (height/width changes, bounce 0), `DEPTH_CSS_TRANSITION` (background push-back — CSS, not framer, so it runs on the compositor), `SPRING.exit` (put on `exit` so closing is quicker than opening), `FADE` for opacity-only backdrops. Modals/drawers render through `ModalPortal` and call `useOverlayDepth(open)` so the app behind recedes. `MotionConfig reducedMotion="user"` is set at the root. Segmented toggles use `SegmentedIndicator` (sliding `layoutId` pill); opening an existing item uses the kanban-card morph everywhere: the item has a surface with `layoutId={surfaceLayoutId(kind, id)}` (kanban card's own background, or `SurfaceAnchor` for table rows / gantt bars) and its drawer gets the same id as `originLayoutId`; while open the item content fades out (`isExpanded`, framer, shared timing `expandedContentTransition`); create flows slide in. The user explicitly chose this feel — don't swap it for clip-path/ghost variants (both tried, rejected). Drawers have no drag-to-dismiss handle; Esc goes through the stacked `useEscapeKey` (top-most overlay only; inner popovers `preventDefault` to claim it). Press feedback on buttons stays CSS: `active:scale-9x` + `transition-transform duration-150`.
- Theming: colors are CSS-variable tokens in `app/globals.css` (zinc→`--neutral-*`, cyan→`--accent-*`, and red/amber/emerald/blue/rose/violet/orange/purple/pink 300–500 → `--{hue}-*`), mapped in `tailwind.config.ts`. Dark is the base `:root`; light lives in two identical blocks (`:root[data-theme="light"]` and the `prefers-color-scheme: light` block) — edit both together. Theme choice (system/light/dark) is `ThemeToggle` in the top bar, stored under `squaddesk-theme`, applied pre-paint by `THEME_BOOT_SCRIPT`. Never hardcode hex/white/black text colors — use the token classes so both themes work.
