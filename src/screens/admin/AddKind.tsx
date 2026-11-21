// Quick ways to grow the catalog: a kind (a new vegetable, soup flavor, bean…) under a food it
// already has, or a new generic food type ("Canned gravy") with its kinds (brown, turkey…). The
// survey asks about the type and lets each person pick the kinds they like.
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../../data/db';
import { blankFood, saveFood } from '../../data/adminRepo';
import { ALLERGENS } from '../../app/ui';
import { CATEGORY_LABELS } from './Catalog';
import type { Allergen, FoodCategory, FoodForm, FoodItem } from '../../domain/types';

const norm = (s: string) => s.trim().toLowerCase().replace(/s\b/g, '');

export function AddKind({ prefill, onBack }: { prefill: string; onBack: () => void }) {
  const nav = useNavigate();
  const foods = useLiveQuery(() => db.foods.filter((f) => f.active).toArray(), []);
  const [foodId, setFoodId] = useState('');
  const [name, setName] = useState(prefill);
  const [icon, setIcon] = useState('');
  const [contains, setContains] = useState<Allergen[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (!foods) return <p className="muted">Loading…</p>;
  const food = foods.find((f) => f.id === foodId);
  // Foods that already have kinds come first: they're the usual home for a new one.
  const byCat = new Map<FoodCategory, FoodItem[]>();
  for (const f of [...foods].sort((a, b) => Number(!a.kinds?.length) - Number(!b.kinds?.length) || a.name.localeCompare(b.name))) {
    byCat.set(f.category, [...(byCat.get(f.category) ?? []), f]);
  }
  // Where this kind already is, so it isn't added twice.
  const term = norm(name);
  // Whole words only: "corn" finds "Corn" and "Corn or bran flakes", not "Corned beef".
  const words = (s: string) => norm(s).split(/[^a-z0-9]+/).filter(Boolean);
  const want = words(name);
  const already = term.length >= 3
    ? foods.flatMap((f) => (f.kinds ?? []).filter((k) => { const have = words(k.name); return want.every((w) => have.includes(w)) || have.every((w) => want.includes(w)); }).map((k) => ({ f, k })))
    : [];
  const dupe = food?.kinds?.find((k) => norm(k.name) === term);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (!food) return setErr('Choose the food it goes under.');
    if (!name.trim()) return setErr('Type the name of the kind.');
    if (dupe) return setErr(`${food.name} already has “${dupe.name}”.`);
    setBusy(true);
    try {
      await saveFood({ ...food, kinds: [...(food.kinds ?? []), { id: '', name: name.trim(), icon: icon.trim() || undefined, contains: contains.length ? contains : undefined }] });
      nav(`/admin/catalog/${food.id}?added=${encodeURIComponent(name.trim())}`, { replace: true });
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={save}>
      <div className="spread">
        <h1 style={{ margin: 0 }}>Add a kind</h1>
        <button type="button" className="ghost" onClick={onBack}>Back</button>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        A new kind shares the food’s package, nutrition and plan amounts. The survey asks about it the next time someone takes it,
        and you can pick it when adding to inventory.
      </p>
      <section className="card stack">
        <label>Name of the kind
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Zucchini" required autoFocus />
        </label>
        {already.length > 0 && (
          <div className="notice small">
            Already in the catalog: {already.map(({ f, k }, i) => (
              <span key={`${f.id}:${k.id}`}>{i > 0 && ', '}{k.icon} {k.name} in <Link to={`/admin/catalog/${f.id}`}>{f.name}</Link></span>
            ))}
          </div>
        )}
        <label>It goes under
          <select value={foodId} onChange={(e) => setFoodId(e.target.value)} required>
            <option value="">Choose a food…</option>
            {[...byCat].map(([cat, list]) => (
              <optgroup key={cat} label={CATEGORY_LABELS[cat]}>
                {list.map((f) => <option key={f.id} value={f.id}>{f.name}{f.kinds?.length ? ` (${f.kinds.length} kinds)` : ''}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        {food && (
          <p className="small muted" style={{ margin: 0 }}>
            {food.kinds?.length ? <>Kinds now: {food.kinds.map((k) => `${k.icon ?? ''} ${k.name}`.trim()).join(', ')}.</> : 'This food has no kinds yet. This will be the first.'}
            {' '}{food.package.description && <>Package: {food.package.description}.</>}
          </p>
        )}
        <label>Icon (optional emoji for the survey)
          <input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="🥒" style={{ width: 80, textAlign: 'center', fontSize: '1.3rem' }} />
        </label>
        <div className="stack" style={{ gap: 6 }}>
          <strong>Allergens this kind adds</strong>
          <span className="small muted">Only ones the food itself doesn’t already have{food?.allergens.contains.length ? ` (${food.allergens.contains.map((a) => ALLERGENS.find((x) => x.code === a)?.label ?? a).join(', ')})` : ''}.</span>
          <div className="row small" style={{ gap: 8 }}>
            {ALLERGENS.map((a) => (
              <label key={a.code} className="inline">
                <input type="checkbox" checked={contains.includes(a.code)} onChange={() => setContains((c) => (c.includes(a.code) ? c.filter((x) => x !== a.code) : [...c, a.code]))} /> {a.label}
              </label>
            ))}
          </div>
        </div>
      </section>
      {err && <div className="notice danger" role="alert">{err}</div>}
      <div className="row"><button className="primary big" disabled={busy}>Add kind</button></div>
    </form>
  );
}

const TYPE_FORMS: { v: FoodForm; l: string }[] = [
  { v: 'canned', l: 'Can' }, { v: 'jar', l: 'Jar' }, { v: 'bottle', l: 'Bottle' }, { v: 'packet', l: 'Packet / mix' },
  { v: 'pouch', l: 'Pouch' }, { v: 'box', l: 'Box' }, { v: 'dry', l: 'Dry goods' }, { v: 'freeze-dried', l: 'Freeze-dried' },
];
const ROLE_FOR: Record<FoodCategory, FoodItem['mealRole']> = {
  protein: 'main', legume: 'side', grain: 'staple', fruit: 'side', vegetable: 'side', meal: 'main',
  'fat-snack': 'snack', 'dairy-alt': 'drink', beverage: 'drink', condiment: 'staple', pantry: 'staple',
};
type KindRow = { name: string; icon: string; contains: Allergen[]; open: boolean };
const blankRow = (): KindRow => ({ name: '', icon: '', contains: [], open: false });
const HINTS = ['e.g. Brown gravy', 'e.g. Turkey gravy', 'e.g. Country (sausage) gravy'];

/** A new generic food type with its kinds. Package and nutrition can be filled in afterwards. */
export function AddType({ prefill, onBack }: { prefill: string; onBack: () => void }) {
  const nav = useNavigate();
  const [name, setName] = useState(prefill);
  const [category, setCategory] = useState<FoodCategory>('condiment');
  const [form, setForm] = useState<FoodForm>('canned');
  const [rows, setRows] = useState<KindRow[]>([blankRow(), blankRow(), blankRow()]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const setRow = (i: number, patch: Partial<KindRow>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    const kinds = rows.filter((r) => r.name.trim());
    if (!name.trim()) return setErr('Type the name of the food type, like “Canned gravy”.');
    if (!kinds.length) return setErr('Add at least one kind, like “Brown gravy”.');
    setBusy(true);
    try {
      const b = blankFood();
      const out = await saveFood({
        ...b, name: name.trim(), category, form, mealRole: ROLE_FOR[category],
        examples: kinds.map((k) => k.name.trim()).join(', '),
        // Package and nutrition are still blank: listed under Needs review until they're filled in.
        needsReview: true,
        kinds: kinds.map((k) => ({ id: '', name: k.name.trim(), icon: k.icon.trim() || undefined, contains: k.contains.length ? k.contains : undefined })),
      });
      nav(`/admin/catalog/${out.id}?created=1`, { replace: true });
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={save}>
      <div className="spread">
        <h1 style={{ margin: 0 }}>New food type</h1>
        <button type="button" className="ghost" onClick={onBack}>Back</button>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        A general food with kinds under it. The survey asks about “{name.trim() || 'Canned gravy'}” and lets each person pick the kinds they like.
        Inventory and the shopping list use the kinds too.
      </p>
      <section className="card stack">
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Canned gravy" required autoFocus /></label>
        <div className="grid">
          <label>Food group
            <select value={category} onChange={(e) => setCategory(e.target.value as FoodCategory)}>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label>Comes in
            <select value={form} onChange={(e) => setForm(e.target.value as FoodForm)}>
              {TYPE_FORMS.map((f) => <option key={f.v} value={f.v}>{f.l}</option>)}
            </select>
          </label>
        </div>
        {category === 'pantry' && <p className="small muted" style={{ margin: 0 }}>Baking &amp; seasonings aren’t in the survey. Pick another group if you want people asked about it.</p>}
      </section>
      <section className="card stack">
        <h2 style={{ margin: 0 }}>Kinds</h2>
        {rows.map((r, i) => (
          <div key={i} className="stack" style={{ gap: 6 }}>
            <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
              <input aria-label={`Kind ${i + 1} icon`} value={r.icon} onChange={(e) => setRow(i, { icon: e.target.value })} placeholder="🙂" style={{ width: 52, textAlign: 'center', fontSize: '1.2rem', flex: 'none' }} />
              <input aria-label={`Kind ${i + 1} name`} value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} placeholder={HINTS[i] ?? 'Another kind'} style={{ flex: 1, minWidth: 0 }} />
            </div>
            <button type="button" className="ghost small" style={{ alignSelf: 'flex-start', marginLeft: 52, minHeight: 32, padding: '0 8px' }} onClick={() => setRow(i, { open: !r.open })} aria-expanded={r.open}>
              {r.open ? '▾' : '▸'} Allergens{r.contains.length ? `: ${r.contains.map((c) => ALLERGENS.find((a) => a.code === c)?.label ?? c).join(', ')}` : ''}
            </button>
            {r.open && (
              <div className="row small" style={{ gap: 8, paddingLeft: 4 }}>
                {ALLERGENS.map((a) => (
                  <label key={a.code} className="inline">
                    <input type="checkbox" checked={r.contains.includes(a.code)} onChange={() => setRow(i, { contains: r.contains.includes(a.code) ? r.contains.filter((x) => x !== a.code) : [...r.contains, a.code] })} /> {a.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
        <div><button type="button" className="small" onClick={() => setRows((r) => [...r, blankRow()])}>Add another kind</button></div>
      </section>
      <p className="small muted" style={{ margin: 0 }}>Next you can fill in the package, nutrition and whether it goes in plans, or leave that for later.</p>
      {err && <div className="notice danger" role="alert">{err}</div>}
      <div className="row"><button className="primary big" disabled={busy}>Create food type</button></div>
    </form>
  );
}

export type AddAs = 'type' | 'kind' | 'food';

/** The first step of “+ Add food”. */
export function AddChoice({ onPick }: { onPick: (as: AddAs) => void }) {
  const big = { textAlign: 'left' as const, padding: 16, minHeight: 0, display: 'block', width: '100%' };
  const choices: { as: AddAs; title: string; text: string }[] = [
    { as: 'kind', title: 'A kind of something we already have', text: 'Like zucchini under Canned vegetables, or a new soup under Canned soups. Just a name; it shares that food’s package and nutrition.' },
    { as: 'type', title: 'A new food type with kinds', text: 'Like Canned gravy, with brown, turkey and chicken gravy under it. The survey asks about gravy and lets people pick the kinds they like.' },
    { as: 'food', title: 'A single new food', text: 'One specific thing with its own package, nutrition and storage (you can look it up by name or barcode).' },
  ];
  return (
    <div className="stack">
      <div className="spread">
        <h1 style={{ margin: 0 }}>What are you adding?</h1>
        <Link to="/admin/catalog" className="btn ghost">Back</Link>
      </div>
      {choices.map((c) => (
        <button key={c.as} type="button" className="card" style={big} onClick={() => onPick(c.as)}>
          <strong style={{ fontSize: '1.1rem' }}>{c.title}</strong>
          <span className="small muted" style={{ display: 'block', marginTop: 4 }}>{c.text}</span>
        </button>
      ))}
    </div>
  );
}
