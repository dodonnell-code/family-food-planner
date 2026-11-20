import { useEffect, useRef, useState } from 'react';
import { ALLERGENS } from '../../app/ui';
import { lookupFoods } from '../../data/foodLookup';
import type { LookupResult } from '../../domain/foodLookup';
import type { FoodItem } from '../../domain/types';

/** "Best Choice Old Fashioned Oats", without doubling a brand the name already starts with. */
const withBrand = (r: LookupResult) => (r.brand && !r.name.toLowerCase().startsWith(r.brand.toLowerCase()) ? `${r.brand} ${r.name}` : r.name);
const n1 = (n?: number) => (n === undefined ? '' : n.toLocaleString(undefined, { maximumFractionDigits: 1 }));

/** Apply a lookup to the food being edited: fills package, nutrition and allergens found. */
export function applyLookup(f: FoodItem, r: LookupResult): FoodItem {
  const defined = Object.fromEntries(Object.entries(r.nutrition).filter(([, v]) => v !== undefined));
  return {
    ...f,
    name: f.name.trim() ? f.name : r.name,
    package: { ...f.package, description: r.packageDesc ?? f.package.description, servingsPerPackage: r.servingsPerPackage ?? f.package.servingsPerPackage },
    nutrition: {
      ...f.nutrition,
      ...defined,
      servingDesc: r.servingDesc ?? f.nutrition.servingDesc,
      source: `USDA FoodData Central label data${r.brand ? ` (${r.brand})` : ''}. Brands differ; check your label.`,
    },
    allergens: { ...f.allergens, contains: [...new Set([...f.allergens.contains, ...r.contains])], verifyLabel: true },
  };
}

/**
 * Look a food up by name or barcode and fill in the details. Sends only the typed text to the
 * USDA; the admin checks the result against the label.
 */
export function FoodLookup({ initialQuery, onPick }: { initialQuery: string; onPick: (r: LookupResult) => void }) {
  const [q, setQ] = useState(initialQuery);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [results, setResults] = useState<LookupResult[]>();
  const [picked, setPicked] = useState<LookupResult>();
  const abort = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => abort.current?.abort(), []);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setErr(''); setBusy(true); setPicked(undefined);
    try { setResults(await lookupFoods(q, ctl.signal)); } catch (x) { if (!ctl.signal.aborted) setErr(x instanceof Error ? x.message : String(x)); } finally { if (!ctl.signal.aborted) setBusy(false); }
  }

  return (
    <section className="card stack">
      <h2 style={{ margin: 0 }}>Look it up</h2>
      <p className="small muted" style={{ margin: 0 }}>Search US packaged foods by name, brand or the barcode number to fill in the package size, servings, nutrition and allergens from the label. Only what you type is sent, to the USDA’s FoodData Central.</p>
      {/* A form inside the editor's form isn't allowed, so this is a div that submits on Enter. */}
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label style={{ flex: '1 1 240px' }}>Food name or barcode
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Quaker old fashioned oats" onKeyDown={(e) => { if (e.key === 'Enter') void search(e); }} />
        </label>
        <button type="button" className="primary" disabled={busy || !q.trim()} onClick={search}>{busy ? 'Searching…' : 'Look up'}</button>
      </div>
      {err && <div className="notice danger" role="alert">{err}</div>}
      {picked && (
        <div className="notice ok" role="status">
          Filled in from <strong>{withBrand(picked)}</strong>. Check it against your label, then Save.
          {picked.contains.length > 0 && <> Allergens found in the ingredients: <strong>{picked.contains.map((a) => ALLERGENS.find((x) => x.code === a)?.label ?? a).join(', ')}</strong>.</>}
          {picked.ingredients && <div className="small" style={{ marginTop: 6 }}><strong>Ingredients:</strong> {picked.ingredients}</div>}
        </div>
      )}
      {results && !picked && (results.length === 0 ? <p className="muted" style={{ margin: 0 }}>Nothing found. Try fewer words, or the brand name.</p> : (
        <div className="list">
          {results.map((r) => (
            <div key={r.fdcId} className="spread" style={{ alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <strong>{r.name}</strong>{r.brand && <span className="small muted"> · {r.brand}</span>}
                <div className="small muted">
                  {[r.packageDesc, r.servingsPerPackage && `${n1(r.servingsPerPackage)} servings`, r.servingDesc && `serving ${r.servingDesc}`, r.nutrition.caloriesPerServing !== undefined && `${r.nutrition.caloriesPerServing} kcal`].filter(Boolean).join(' · ') || 'No package or serving details'}
                </div>
              </div>
              <button type="button" onClick={() => { setPicked(r); onPick(r); }}>Use this</button>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
