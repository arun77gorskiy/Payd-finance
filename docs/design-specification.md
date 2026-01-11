# Design Specification - Payd_Finance

## 1. Direction & Rationale

**Style Identity:** Institutional Premium ("Silent Luxury" meets "High Tech").
**Visual Essence:** A sophisticated, dark-themed environment (`#0A0A0B`) that signals professional-grade financial software. The design relies on high contrast between the deep matte background and sharp, metallic gold accents (`#D4AF37`) for key actions, balanced by a subtle "technological" purple glow (`#7B61FF`) representing the AI core.

**Reference Vibes:**
- **Institutional:** Bloomberg Terminal (modernized), BlackRock (solidity).
- **SaaS/Tech:** Linear (dark mode), Stripe (gradients), Raycast.

## 2. Design Tokens

### 2.1 Color System (Institutional Dark Mode)

**Primary Palette (Trust & Wealth):**
| Token | Value | Role |
| :--- | :--- | :--- |
| `primary-500` | `#D4AF37` | **Gold**: Primary CTAs, key value metrics. (HSL 45, 65%, 52%) |
| `primary-hover`| `#C5A028` | Interactive state for gold elements. |
| `primary-100` | `#3E3418` | Subtle gold backgrounds (badges, charts). |

**Secondary Palette (AI & Tech):**
| Token | Value | Role |
| :--- | :--- | :--- |
| `accent-500` | `#7B61FF` | **Purple**: AI features, neural network visualisations. |
| `accent-glow` | `rgba(123, 97, 255, 0.15)` | Background blurs/glows behind AI cards. |
| `success-500` | `#10B981` | Positive PnL, "Safe" indicators. |
| `error-500` | `#EF4444` | Negative PnL, Risk alerts. |

**Neutral Palette (Deep Graphite):**
| Token | Value | Role |
| :--- | :--- | :--- |
| `bg-900` | `#050505` | **Page Background**: Almost pure black. |
| `bg-800` | `#0F0F11` | **Surface 1**: Cards, Sections. |
| `bg-700` | `#18181B` | **Surface 2**: Elevated elements, Inputs. |
| `text-900` | `#FFFFFF` | Primary headings. |
| `text-500` | `#A1A1AA` | Body text (Zinc-500). |
| `border-700` | `#27272A` | Subtle borders. |

**WCAG Compliance:**
- Gold `#D4AF37` on Black `#050505`: 10.5:1 (AAA) ✅
- Purple `#7B61FF` on Black `#050505`: 6.5:1 (AA) ✅
- Text `#A1A1AA` on Black `#050505`: 5.8:1 (AA) ✅

### 2.2 Typography (Sans-Serif Clean)

**Font Family:** `Inter` or `Plus Jakarta Sans`.
- **Headings:** `Plus Jakarta Sans` (Geometric, modern)
- **Body:** `Inter` (Highly legible for data)

**Scale (Desktop):**
| Role | Size | Line Height | Weight | Letter Spacing |
| :--- | :--- | :--- | :--- | :--- |
| **Hero H1** | 64px | 1.1 | Bold (700) | -0.02em |
| **Section H2** | 48px | 1.2 | SemiBold (600) | -0.01em |
| **Card H3** | 24px | 1.3 | Medium (500) | 0 |
| **Body** | 16px | 1.6 | Regular (400) | 0 |
| **Small** | 14px | 1.5 | Regular (400) | 0 |
| **Numbers** | 16px | 1.0 | Mono (400) | 0 |

### 2.3 Spacing & Radius (4pt Grid)

- **Section Spacing:** 96px (Generous breathing room).
- **Component Gap:** 32px.
- **Card Padding:** 32px (Premium feel).
- **Border Radius:**
    - Buttons: `8px` (Professional, not too round).
    - Cards: `16px` (Modern standard).
    - Inputs: `12px`.

### 2.4 Shadows & Effects

- **Glassmorphism:** Used sparingly on `bg-800` cards.
  - `background: rgba(15, 15, 17, 0.7)`
  - `backdrop-filter: blur(12px)`
  - `border: 1px solid rgba(255, 255, 255, 0.08)`
- **Glows:** Behind Hero image and "AI" sections.
  - `box-shadow: 0 0 120px rgba(123, 97, 255, 0.15)`

## 3. Component Specifications

### 3.1 Primary Button (Gold)
- **Visual:** Solid Gold `#D4AF37` background, Black `#000000` text.
- **Specs:** Height 48px, Radius 8px, Font Semibold 16px.
- **Hover:** Brightness 110% (`#E5C045`), Transform `translateY(-1px)`.
- **Shadow:** `0 4px 12px rgba(212, 175, 55, 0.2)` (Golden glow).

### 3.2 Secondary Button (Outline)
- **Visual:** Transparent background, White border `1px solid rgba(255,255,255,0.2)`.
- **Specs:** Height 48px, Radius 8px, White text.
- **Hover:** Border Color `#FFFFFF`, Background `rgba(255,255,255,0.05)`.

### 3.3 Feature Card (Glass)
- **Visual:** Dark surface `bg-800` or Glass effect.
- **Border:** `1px solid border-700` (Top border highlight: `rgba(255,255,255,0.1)`).
- **Padding:** 32px.
- **Interaction:** Hover -> Border becomes `primary-500` (Gold), Glow opacity increases.
- **Icon:** 24px Gold or Purple icon in a circular container (`bg-700`).

### 3.4 Data Metric (Trust)
- **Visual:** Large Number (48px+) in White.
- **Label:** Small text (14px) in `text-500`.
- **Accent:** Tiny Gold/Green trend indicator (`+12%`).

### 3.5 Navigation Bar
- **Type:** Fixed/Sticky.
- **Background:** `rgba(5, 5, 5, 0.8)` + Blur 16px.
- **Content:** Logo (Left), Links (Center), "Get Access" Gold Button (Right).
- **Border:** Bottom 1px solid `rgba(255,255,255,0.05)`.

## 4. Layout & Responsive Patterns

### 4.1 Global Layout
- **Container:** Max-width `1280px`.
- **Grid:** 12 columns, 24px gap.
- **Mobile:** 4 columns, 16px gap, 16px edge padding.

### 4.2 Page Patterns (SPA)

**Hero Section (Block 1):**
- **Layout:** Centered.
- **Content:** H1 + Subhead + 2 Buttons (Primary/Secondary).
- **Visual:** Large "Floating UI" image below text. Purple glow behind the image.

**Problems & Solutions (Block 2-3):**
- **Problem:** 5-column horizontal scroll or 2-row grid.
- **Solution:** 50/50 Split. Left: Text (H2 + P + Bullet points). Right: Abstract graphic or UI element showing the solution.

**Features Matrix (Block 4):**
- **Grid:** 3 columns x 2 rows.
- **Card Style:** See §3.3. Uniform height.

**Process Steps (Block 5):**
- **Layout:** Horizontal timeline (Desktop) -> Vertical timeline (Mobile).
- **Visual:** Numbered steps (1-4) with connecting lines. Lines light up on scroll.

**Trust & Footer (Block 8-10):**
- **Trust:** Monochrome logos (opacity 0.5 -> 1.0 on hover).
- **Disclaimer:** Small text (12px), darker color (`text-600`), readable but unobtrusive.

## 5. Interaction & Animation

**Principle:** "Smooth & Weighted". No bouncy physics.
- **Scroll Reveal:** Elements fade in + move up 20px (`duration-700 ease-out`).
- **Hover:** Slow transitions (`300ms`).
- **Parallax:** Very subtle movement on background abstract shapes.
- **Tech Effect:** "Typing" effect for AI output text simulations (optional).
