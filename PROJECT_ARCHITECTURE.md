# The Reserve Magazine - Project Architecture

## 🏛 Architectural Philosophy
This application is built as a **Deterministic Production System**. Fragility is eliminated by enforcing strict schema integrity between Supabase (Postgres) and the React frontend.

## 🛡 System Guardrails

### 1. Data Integrity Layer
- **Schema Centralization**: All data structures originate from `src/lib/schemas.ts`.
- **Normalization**: Every row fetched from Supabase MUST pass through a `normalizeX()` helper. This ensures the frontend never encounters `undefined` or malformed fields, even if the database contains legacy or corrupted data.
- **Row Mapping**: Each service owns a `rowToX()` / `xToRow()` pair that translates between Postgres's snake_case columns and the app's camelCase types, so RLS policies and the database schema stay the single source of truth.

### 2. Deterministic Rendering
- No keyword-based UI logic. Rendering is driven by explicit properties in the `ContentBlock` schema.
- Polymorphic components (like `RichTextRenderer`) must handle legacy data gracefully but prioritize the structured block system.

### 3. Responsive Architecture
- **Mobile-First**: Styles are applied mobile-first using Tailwind's default breakpoints.
- **Ultrawide Protection**: The global `.container` utility is constrained to `1600px` to prevent layout stretching on high-resolution displays.
- **Touch-Safe UI**: Interactive elements follow the `44px` touch-target rule on mobile devices.

## 📦 Directory Structure
- `src/lib/`: Core architecture helpers (schemas, Supabase client config).
- `src/services/`: Persistence logic. No UI code allowed here.
- `src/context/`: Global state (Auth, Site Settings).
- `src/components/admin/`: Isolated back-office UI.
- `src/components/ui/`: Reusable primitive components.

## 🚀 Deployment & Operational Rules
- **Schema Migrations**: When adding a field, update the default object in `schemas.ts` simultaneously.
- **Zero Hardcoding**: Global strings (Title, CTA, Social) MUST be sourced from `siteSettings`.
- **Forbidden Patterns**:
    - ❌ Direct Supabase table writes from components — go through `src/services/`.
    - ❌ Hardcoded 1280px+ widths outside the container.
    - ❌ Hover-only functionality for critical paths.
    - ❌ Using `any` in service signatures.

## 🛠 Rollback & Recovery
- In case of data corruption, restore from a Supabase point-in-time backup or re-import from the last known-good export rather than relying on any in-app demo-data seeding.
