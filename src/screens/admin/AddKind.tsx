// Adding a kind (a new vegetable, soup flavor, bean…) to a food the catalog already has, instead
// of creating a whole new food with its own package and nutrition.
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../../data/db';
import { saveFood } from '../../data/adminRepo';
import { ALLERGENS } from '../../app/ui';
import { CATEGORY_LABELS } from './Catalog';
import type { Allergen, FoodCategory, FoodItem } from '../../domain/types';

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

/** The first step of “+ Add food”: a kind of something we have, or a whole new food. */
export function AddChoice({ onPick }: { onPick: (as: 'kind' | 'food') => void }) {
  const big = { textAlign: 'left' as const, padding: 16, minHeight: 0, display: 'block', width: '100%' };
  return (
    <div className="stack">
      <div className="spread">
        <h1 style={{ margin: 0 }}>What are you adding?</h1>
        <Link to="/admin/catalog" className="btn ghost">Back</Link>
      </div>
      <button type="button" className="card" style={big} onClick={() => onPick('kind')}>
        <strong style={{ fontSize: '1.1rem' }}>A kind of something we already have</strong>
        <span className="small muted" style={{ display: 'block', marginTop: 4 }}>Like zucchini under Canned vegetables, or a new soup under Canned soups. Just a name; it shares that food’s package and nutrition.</span>
      </button>
      <button type="button" className="card" style={big} onClick={() => onPick('food')}>
        <strong style={{ fontSize: '1.1rem' }}>A new food</strong>
        <span className="small muted" style={{ display: 'block', marginTop: 4 }}>Something different, with its own package, nutrition and storage (you can look it up by name or barcode).</span>
      </button>
    </div>
  );
}
