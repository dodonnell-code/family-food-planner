import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '../../data/db';
import { subjectLabel } from '../../app/ui';
import type { FoodCategory } from '../../domain/types';

export const CATEGORY_LABELS: Record<FoodCategory, string> = {
  protein: 'Meat, fish & protein', legume: 'Beans & lentils', grain: 'Grains, bread & cereal', fruit: 'Fruit', vegetable: 'Vegetables',
  meal: 'Ready meals & soups', 'fat-snack': 'Snacks & spreads', 'dairy-alt': 'Milk & alternatives', beverage: 'Drinks', condiment: 'Condiments & sauces', pantry: 'Baking & seasonings',
};

export default function Catalog() {
  const foods = useLiveQuery(() => db.foods.toArray(), []);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<'' | FoodCategory>('');
  const [show, setShow] = useState<'active' | 'retired' | 'review'>('active');

  const term = q.trim().toLowerCase();
  const list = (foods ?? [])
    .filter((f) => (show === 'retired' ? !f.active : show === 'review' ? f.active && f.needsReview : f.active))
    .filter((f) => !cat || f.category === cat)
    .filter((f) => !term || `${f.name} ${f.examples ?? ''} ${f.tags.join(' ')}`.toLowerCase().includes(term))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  const counts = {
    active: foods?.filter((f) => f.active).length ?? 0,
    retired: foods?.filter((f) => !f.active).length ?? 0,
    review: foods?.filter((f) => f.active && f.needsReview).length ?? 0,
  };

  return (
    <div className="stack">
      <div className="spread">
        <h1 style={{ margin: 0 }}>Food catalog</h1>
        <Link to="/admin/catalog/new" className="btn primary">+ Add food</Link>
      </div>
      <p className="small muted" style={{ margin: 0 }}>Generic foods the survey asks about and the planner chooses from. Details are typical values; always check the actual package label.</p>

      <div className="card row">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search foods or tags" aria-label="Search" style={{ flex: 1, minWidth: 200 }} />
        <select value={cat} onChange={(e) => setCat(e.target.value as FoodCategory | '')} aria-label="Category">
          <option value="">All categories</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div className="row" role="tablist">
          {(['active', 'review', 'retired'] as const).map((k) => (
            <button key={k} role="tab" aria-selected={show === k} className={show === k ? 'primary' : ''} onClick={() => setShow(k)}>
              {{ active: 'In use', review: 'Needs review', retired: 'Retired' }[k]} ({counts[k]})
            </button>
          ))}
        </div>
      </div>

      <div className="card list">
        {list.length === 0 && <p className="muted">No foods match.</p>}
        {list.map((f) => (
          <Link key={f.id} to={`/admin/catalog/${f.id}`} className="spread" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div>
              <strong>{f.name}</strong>
              <div className="small muted">{CATEGORY_LABELS[f.category]} · {f.package.description || 'package not set'} · {f.package.servingsPerPackage} servings · {f.nutrition.caloriesPerServing} kcal{f.nutrition.carbsG !== undefined ? ` · ${f.nutrition.carbsG} g carbs` : ''}</div>
            </div>
            <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
              <span className={`badge ${f.prep.edibleWithoutHeat ? 'ok' : 'warn'}`}>{f.prep.edibleWithoutHeat ? 'no-cook' : 'needs cooking/heat'}</span>
              {f.allergens.contains.slice(0, 3).map((a) => <span key={a} className="badge danger">{subjectLabel(a)}</span>)}
              {f.allergens.contains.length > 3 && <span className="badge danger">+{f.allergens.contains.length - 3}</span>}
              {f.needsReview && <span className="badge warn">needs review</span>}
              {f.catalogOnly && <span className="badge">catalog only</span>}
              {f.revision > 1 && <span className="badge">edited</span>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
