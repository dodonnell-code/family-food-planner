import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db } from '../../data/db';
import { blankFood, saveFood, setFoodActive } from '../../data/adminRepo';
import { ALLERGENS } from '../../app/ui';
import { CATEGORY_LABELS } from './Catalog';
import type { Allergen, FoodCategory, FoodForm, FoodItem, PrepMethod } from '../../domain/types';

const FORMS: FoodForm[] = ['canned', 'pouch', 'dry', 'freeze-dried', 'dehydrated', 'jar', 'box', 'bottle', 'packet', 'bulk'];
const METHODS: { v: PrepMethod; l: string }[] = [
  { v: 'ready-to-eat', l: 'Ready to eat (no heat, no water)' },
  { v: 'add-cold-water', l: 'Add cold/room-temperature water' },
  { v: 'add-hot-water', l: 'Add hot water' },
  { v: 'heat', l: 'Heat / bake' },
  { v: 'simmer', l: 'Simmer' },
  { v: 'boil', l: 'Boil' },
];
const ROLES: { v: FoodItem['mealRole']; l: string }[] = [
  { v: 'main', l: 'Main dish' }, { v: 'side', l: 'Side' }, { v: 'staple', l: 'Staple / ingredient' }, { v: 'snack', l: 'Snack' }, { v: 'drink', l: 'Drink' },
];

export default function FoodEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const food = useLiveQuery(async () => (isNew ? blankFood() : ((await db.foods.get(id!)) ?? null)), [id]);
  if (food === undefined) return <p className="muted">Loading…</p>;
  if (!food) return <p>Food not found. <Link to="/admin/catalog">Back to catalog</Link></p>;
  return <Editor key={food.id || 'new'} initial={food} isNew={isNew} />;
}

const num = (v: string): number | undefined => (v.trim() === '' ? undefined : Number(v));

function Editor({ initial, isNew }: { initial: FoodItem; isNew: boolean }) {
  const nav = useNavigate();
  const [f, setF] = useState<FoodItem>(initial);
  const [tags, setTags] = useState(initial.tags.join(', '));
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState('');

  const set = <K extends keyof FoodItem>(k: K, v: FoodItem[K]) => setF((x) => ({ ...x, [k]: v }));
  const setIn = <K extends 'allergens' | 'prep' | 'shelfLife' | 'nutrition' | 'package'>(k: K, patch: Partial<FoodItem[K]>) =>
    setF((x) => ({ ...x, [k]: { ...x[k], ...patch } }));

  const toggleAllergen = (list: 'contains' | 'mayContain', a: Allergen) => {
    const cur = new Set(f.allergens[list] ?? []);
    if (cur.has(a)) cur.delete(a);
    else cur.add(a);
    setIn('allergens', { [list]: [...cur] } as Partial<FoodItem['allergens']>);
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      const out = await saveFood({ ...f, tags: tags.split(',') });
      if (isNew) nav(`/admin/catalog/${out.id}`, { replace: true });
      setSaved('Saved. The change is listed in Review.');
      window.setTimeout(() => setSaved(''), 2500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  const noHeat = f.prep.method === 'ready-to-eat' || f.prep.method === 'add-cold-water';

  return (
    <form className="stack" onSubmit={save}>
      <div className="spread">
        <h1 style={{ margin: 0 }}>{isNew ? 'Add a food' : f.name}</h1>
        <div className="row">
          {!isNew && (f.active
            ? <button type="button" className="danger" onClick={() => confirm(`Retire “${f.name}”? It won’t appear in surveys or new plans, but past answers keep it. You can restore it later.`) && setFoodActive(f.id, false).then(() => nav('/admin/catalog'))}>Retire</button>
            : <button type="button" onClick={() => setFoodActive(f.id, true).then(() => set('active', true))}>Restore</button>)}
          <Link to="/admin/catalog" className="btn ghost">Back</Link>
        </div>
      </div>
      {!f.active && <div className="notice">This food is retired. It isn’t used in surveys or new plans.</div>}
      {saved && <div className="notice ok" role="status">{saved}</div>}

      <section className="card stack">
        <h2>Basics</h2>
        <div className="grid">
          <label>Name<input value={f.name} onChange={(e) => set('name', e.target.value)} required /></label>
          <label>Category
            <select value={f.category} onChange={(e) => set('category', e.target.value as FoodCategory)}>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label>Form
            <select value={f.form} onChange={(e) => set('form', e.target.value as FoodForm)}>
              {FORMS.map((x) => <option key={x} value={x}>{x.replace('-', ' ')}</option>)}
            </select>
          </label>
          <label>Role in a meal
            <select value={f.mealRole} onChange={(e) => set('mealRole', e.target.value as FoodItem['mealRole'])}>
              {ROLES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
            </select>
          </label>
        </div>
        <label>Examples (shown in the survey)<input value={f.examples ?? ''} onChange={(e) => set('examples', e.target.value || undefined)} placeholder="e.g. chunk white chicken" /></label>
        <label>Tags (comma-separated)
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. vegetarian, vegan, kid-friendly, pork, beef, rapid-carb, soft-texture" />
          <span className="small muted" style={{ fontWeight: 400 }}>Diet rules use these tags: “vegetarian”, “vegan”, “pork”, “beef”, “soft-texture”. “rapid-carb” marks fast-acting carb foods.</span>
        </label>
      </section>

      <section className="card stack">
        <h2>Allergens</h2>
        <p className="small muted" style={{ margin: 0 }}>Any food containing someone’s allergen is left out of the stockpile. Never assume a food is allergen-free from its name.</p>
        {(['contains', 'mayContain'] as const).map((list) => (
          <div key={list} className="stack" style={{ gap: 6 }}>
            <strong>{list === 'contains' ? 'Contains' : 'May contain (cross-contact)'}</strong>
            <div className="row" style={{ gap: 8 }}>
              {ALLERGENS.map((a) => {
                const on = (f.allergens[list] ?? []).includes(a.code);
                const disabled = list === 'mayContain' && f.allergens.contains.includes(a.code);
                return (
                  <button type="button" key={a.code} aria-pressed={on} disabled={disabled} onClick={() => toggleAllergen(list, a.code)}
                    style={{ minHeight: 44, borderRadius: 999, padding: '0 14px', background: on ? (list === 'contains' ? 'var(--danger)' : 'var(--warn)') : 'var(--surface)', color: on ? '#fff' : 'var(--text)', borderColor: on ? 'transparent' : 'var(--border)' }}>
                    {on ? '✓ ' : ''}{a.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <label className="inline"><input type="checkbox" checked={f.allergens.verifyLabel} onChange={(e) => setIn('allergens', { verifyLabel: e.target.checked })} /> Generic entry: check the actual product label</label>
      </section>

      <section className="card stack">
        <h2>Preparation</h2>
        <div className="grid">
          <label>How it’s prepared
            <select value={f.prep.method} onChange={(e) => setIn('prep', { method: e.target.value as PrepMethod })}>
              {METHODS.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
            </select>
          </label>
          {!noHeat && <label>Cook time (minutes)<input type="number" min={0} value={f.prep.cookMinutes} onChange={(e) => setIn('prep', { cookMinutes: num(e.target.value) ?? 0 })} /></label>}
          <label>Prep water per serving (cups)<input type="number" min={0} step={0.25} value={f.prep.waterCupsPerServing} onChange={(e) => setIn('prep', { waterCupsPerServing: num(e.target.value) ?? 0 })} /></label>
        </div>
        <span className={`badge ${noHeat ? 'ok' : 'warn'}`} style={{ alignSelf: 'flex-start' }}>{noHeat ? 'Counts for the no-cook (no power) plan' : 'Needs heat and fuel: limited-cooking plans only'}</span>
      </section>

      <section className="card stack">
        <h2>Nutrition &amp; package</h2>
        <div className="grid">
          <label>Serving size<input value={f.nutrition.servingDesc} onChange={(e) => setIn('nutrition', { servingDesc: e.target.value })} /></label>
          <label>Calories per serving<input type="number" min={0} value={f.nutrition.caloriesPerServing} onChange={(e) => setIn('nutrition', { caloriesPerServing: num(e.target.value) ?? 0 })} /></label>
          <label>Carbs per serving (g)<input type="number" min={0} value={f.nutrition.carbsG ?? ''} onChange={(e) => setIn('nutrition', { carbsG: num(e.target.value) })} /></label>
          <label>Protein per serving (g)<input type="number" min={0} value={f.nutrition.proteinG ?? ''} onChange={(e) => setIn('nutrition', { proteinG: num(e.target.value) })} /></label>
          <label>Package<input value={f.package.description} onChange={(e) => setIn('package', { description: e.target.value })} placeholder="e.g. 15 oz can" /></label>
          <label>Servings per package<input type="number" min={0.1} step={0.1} value={f.package.servingsPerPackage} onChange={(e) => setIn('package', { servingsPerPackage: num(e.target.value) ?? 0 })} /></label>
          <label>Package volume (liters, optional)<input type="number" min={0} step={0.05} value={f.package.volumeL ?? ''} onChange={(e) => setIn('package', { volumeL: num(e.target.value) })} /></label>
          <label>Price per package (optional, your own)<input type="number" min={0} step={0.01} value={f.priceEstimate ?? ''} onChange={(e) => set('priceEstimate', num(e.target.value))} placeholder="Not set" /></label>
        </div>
      </section>

      <section className="card stack">
        <h2>Storage &amp; shelf life</h2>
        <p className="small muted" style={{ margin: 0 }}>Guidance, not a guarantee. The package date always wins.</p>
        <div className="grid">
          <label>Shelf life from (months)<input type="number" min={0} value={f.shelfLife.unopenedMonthsMin} onChange={(e) => setIn('shelfLife', { unopenedMonthsMin: num(e.target.value) ?? 0 })} /></label>
          <label>up to (months)<input type="number" min={0} value={f.shelfLife.unopenedMonthsMax} onChange={(e) => setIn('shelfLife', { unopenedMonthsMax: num(e.target.value) ?? 0 })} /></label>
          <label>Source<input value={f.shelfLife.source} onChange={(e) => setIn('shelfLife', { source: e.target.value })} /></label>
          <label>Source date<input type="date" value={f.shelfLife.sourceDate ?? ''} onChange={(e) => setIn('shelfLife', { sourceDate: e.target.value || undefined })} /></label>
        </div>
        <label>Storage conditions<input value={f.shelfLife.storage} onChange={(e) => setIn('shelfLife', { storage: e.target.value })} /></label>
        <div className="grid">
          <label>Rotation priority
            <select value={f.rotationPriority} onChange={(e) => set('rotationPriority', Number(e.target.value) as 1 | 2 | 3)}>
              <option value={3}>High (rotate soon)</option><option value={2}>Medium</option><option value={1}>Low (keeps long)</option>
            </select>
          </label>
          <label>Packaging durability
            <select value={f.packagingDurability} onChange={(e) => set('packagingDurability', Number(e.target.value) as 1 | 2 | 3)}>
              <option value={3}>High (cans, #10 tins)</option><option value={2}>Medium</option><option value={1}>Low (boxes, bags)</option>
            </select>
          </label>
          <label>Relative cost
            <select value={f.relativeCost} onChange={(e) => set('relativeCost', Number(e.target.value) as 1 | 2 | 3)}>
              <option value={1}>Low</option><option value={2}>Medium</option><option value={3}>High</option>
            </select>
          </label>
        </div>
        <label>Safety notes<textarea value={f.safetyNotes ?? ''} onChange={(e) => set('safetyNotes', e.target.value || undefined)} /></label>
        <label className="inline"><input type="checkbox" checked={f.needsReview} onChange={(e) => set('needsReview', e.target.checked)} /> Needs review (details not yet checked)</label>
      </section>

      {err && <div className="notice danger" role="alert">{err}</div>}
      <div className="row"><button className="primary big">{isNew ? 'Add food' : 'Save changes'}</button></div>
    </form>
  );
}
