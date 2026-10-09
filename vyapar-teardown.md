# Vyapar Desktop — UI Teardown Report

**Source:** Vyapar Desktop v14.3.0 official installer (`VyaparApp.exe`, 98.6MB, NSIS)
**Method:** Downloaded from Vyapar's own CDN (`desktop.vyaparapp.in/v2/VyaparApp.exe`),
extracted with 7z → `resources/app.asar` (247MB Electron bundle) → extracted with `asar`.
React frontend, bundled JS/CSS. Analyzed: `UIComponent/Index.html`, `Index1.css`,
`3119/378/4298/6941/7933.css`, plus official desktop screenshots.

> Note: code/images/icons/fonts/branding were NOT copied — only the design
> language (colors, spacing, component patterns) was studied and re-implemented
> in Karobar's own code.

## 1. Screens (sidebar order)

Home (Dashboard) · Parties · Items · Sale · Purchase & Expense · Grow Your Business ·
Cash & Bank · Accounting · Reports · Sync, Share & Backup · Other Products

Top bar: global search ("Search Transactions") + red **"+ Add Sale"** button +
blue **"+ Add Purchase"** button.

## 2. Dashboard layout

- **Stat cards row:** Total Receivable (₹8,792, green down-arrow, "From 1 Party") ·
  Total Payable (₹36,635, red up-arrow) · Total Sale (₹43,899, "516% more than last month")
- **Sales chart** (area/line, This Month selector)
- **Right summary panel:** Low Stock Items · Cash In Hand · Stock Value · Expenses · Purchases
- **"Most Used Reports"** section at bottom

## 3. Design language

**Colors**
| Token | Hex | Usage |
|---|---|---|
| Primary | `#0b8fc5` | buttons, links, active states (sky blue) |
| Primary dark | `#097aa8` | hover, outline buttons, shadows |
| Bright blue | `#0075e8` | accents |
| Sidebar | `#212934` | dark navy nav |
| Sidebar deep | `#12181f` | user/sync card |
| Sidebar active | `#2c3643` | highlighted menu |
| Success | `#08bd7c` | received, in-stock dots |
| Danger | `#ed1a3b` | payable, delete, "+ Add Sale" button |
| Danger 2 | `#f45972` | secondary red |
| Text | `#3f4155` | primary text |
| Input text | `#2b4c56` | form text |
| Muted | `#71748e` / `#9e9e9e` / `#aaa` | secondary text |
| Page bg | `#fafafa` / `#f7f7f7` / `#f6f6f6` | backgrounds |
| Card | `#ffffff` | cards |
| Border | `#ddd` / `#ccc` / `#bdbdbd` / `#e6e6ea` | dividers, inputs |
| Info bg | `#e4f2ff` | banners, POS strip |
| WhatsApp green | `#69d654` | WhatsApp headings |

**Typography:** Roboto everywhere (Regular/Medium/Bold via bundled woff).
Base ~12–16px; headings 14–16px Medium/Bold.

**Buttons**
- Primary: filled `#0b8fc5`, white text, `text-transform: uppercase`,
  `letter-spacing: 0.5px`, `border-radius: 2px`, material shadow
  (`0 1px 3px rgba(0,0,0,.2)`), hover `#097aa8`
- Outline: white bg, `1px solid #097aa8`, text `#097aa8`
- Muted: `#f2f2f2` bg, primary-colored text
- Danger action ("+ Add Sale"): filled `#ed1a3b`

**Inputs:** `height: 36px`, `1px solid #bdbdbd`, `padding: 8px 16px`,
`font-size: 16px`, text `#2b4c56`, radius 2px.

**Cards:** white, `box-shadow: 2px 2px 4px rgba(0,0,0,.3)` (item grids) or
material `0 1px 3px` shadows; radius 2–4px (sharp, not round).

**Dialogs/modals:** white, `border-radius: 4px`, generous padding,
`box-shadow: 0 8px 24px rgba(0,0,0,.20)`.

**Tables:** ag-grid material theme, header row with bottom border,
row hover, dense 12–13px text.

**Sidebar nav:** full-height dark `#212934`; menu items 40px rows,
`robotoMedium` 12px white text; expandable sub-menus; red dot badges;
bottom user sync card `#12181f` with green `#08bd7c` "sync on" text.

## 4. Component patterns

- **Summary rows:** label left, amount right (`.kv` pattern) — used in bills,
  dashboard, party ledger
- **Stat cards:** big number + small muted label + colored arrow icon
- **Quick actions:** prominent top-level buttons before content
- **Item list:** white floating cards in grid, header strip with bold 14px title
- **Settings:** sectioned forms, `#e6e6ea` textarea backgrounds
- **Transaction pages:** `#f7f7f7` page bg, white content cards

## 5. What Karobar adopted (2026-10-09)

- Primary `#0b8fc5` / dark `#097aa8` (was teal) — matches Vyapar Desktop
- Roboto font stack (system-loaded; their woff files NOT copied)
- Uppercase buttons with letter-spacing, 4px radius, material shadows
- Dashboard: red "+ Add Sale" + blue "+ Add Purchase" quick-action row
  (desktop topbar pattern), stat cards with ▲▼ arrows
  (Receivable green ▼, Payable red ▲)
- Inputs: 36px, `#bdbdbd` border, `8px 16px` padding
- Page bg `#f7f7f7`, cards white with material shadows
- Bottom nav active color → `#0b8fc5`
- Kept: English labels, PKR (Rs), no GST fields, "Karobar" branding,
  mobile bottom-nav pattern (desktop has sidebar; mobile keeps bottom nav)
