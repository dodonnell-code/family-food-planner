# Extending beyond food

The planner starts food-only, but is structured so medical needs, equipment and other
long-term planning areas can be added without restructuring stored data.

## Member needs (`src/domain/needs.ts`)
- Every need is a `MemberNeed` record with a `domain` (`food`, `medical`, `equipment`, `other`)
  and a `kind`. Members can have any number of needs and conditions.
- To add an area: set `enabled: true` on its entry in `NEED_DOMAINS` and add its kinds to
  `NEED_KINDS` (label, description, numeric/text params). The member screen renders a
  section for each enabled domain automatically.
- Numeric params are stored plainly so planners can use them; text params are encrypted.
  Numbers seeded from a `placeholder` stay flagged "unconfirmed" until the admin sets them.

## Planning (Phase 5 onward)
- The recommendation engine will be organized as one planning module per domain. Each
  module reads the needs it understands, ignores the rest, and contributes sections to a
  shared plan/report output. A future medical or equipment module plugs in alongside food.
- The food catalog (`FoodItem`) is food-specific. Non-food items will get their own catalog
  table rather than overloading food entries.

## Data safety
- Schema changes go through Dexie version upgrades in `src/data/db.ts`, with a test that
  upgrades a database written in the previous format (see `repo.test.ts`).
