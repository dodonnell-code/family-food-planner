import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { db, uid } from '../../data/db';
import { inProgressSurvey, saveAnswer, submitSurvey, updateSurveyProgress } from '../../data/repo';
import { checkFood, checkKinds, isExcluded } from '../../domain/safety';
import { firstName, RESTRICTION_TYPES, STRICTNESS, subjectLabel } from '../../app/ui';
import { SURVEYED_CATEGORIES, type SurveyedCategory } from '../../domain/surveyScope';
import type { BlockedInfo, FoodItem, Member, MemberRestriction, PrepTolerance, RatingCode, RestrictionType, Strictness, Suggestion, Survey as SurveyT, SurveyAnswer } from '../../domain/types';
import { useSession } from '../../app/session';
import './survey.css';

const CATEGORY_TEXT: Record<SurveyedCategory, { title: string; blurb: string }> = {
  protein: { title: 'Meat, fish & protein', blurb: 'Canned, pouch and dried proteins.' },
  legume: { title: 'Beans & lentils', blurb: 'Canned beans are ready to eat. Dry ones need cooking.' },
  grain: { title: 'Grains, bread & cereal', blurb: 'Crackers, cereal, rice, pasta, oats.' },
  fruit: { title: 'Fruit', blurb: 'Canned, freeze-dried and applesauce. Tell us which kinds you like.' },
  vegetable: { title: 'Vegetables', blurb: 'Canned and freeze-dried. Tell us which kinds you like.' },
  meal: { title: 'Ready meals & soups', blurb: 'Soups, chili, pouches and freeze-dried meals. Tell us which kinds you like.' },
  'fat-snack': { title: 'Snacks & spreads', blurb: 'Nut butters, bars, nuts and treats.' },
  'dairy-alt': { title: 'Milk & milk alternatives', blurb: 'Shelf-stable and powdered.' },
  beverage: { title: 'Drinks', blurb: 'Juice, drink mixes, coffee, tea and cocoa.' },
  condiment: { title: 'Condiments & sauces', blurb: 'Ketchup, mustard, jelly, syrup, dressings and more.' },
};
const CATEGORIES = SURVEYED_CATEGORIES.map((id) => ({ id, ...CATEGORY_TEXT[id] }));


export const RATINGS: { v: RatingCode; emoji: string; label: string }[] = [
  { v: 5, emoji: '😍', label: 'Love it' },
  { v: 4, emoji: '🙂', label: 'Like it' },
  { v: 3, emoji: '😐', label: 'It’s OK' },
  { v: 2, emoji: '😕', label: 'Only if I had to' },
  { v: 1, emoji: '🚫', label: 'Would refuse' },
  { v: 'unknown', emoji: '❓', label: 'Not tried / not sure' },
  { v: 'blocked', emoji: '⚠️', label: 'Can’t eat it' },
];

type Step = { kind: 'intro' } | { kind: 'category'; cat: (typeof CATEGORIES)[number] } | { kind: 'prep' } | { kind: 'restrictions' } | { kind: 'open' } | { kind: 'review' };

/** All steps; with `onlyNew`, just the groups that have new questions. */
function buildSteps(foods: FoodItem[], onlyNew?: Set<string>): Step[] {
  const cats = onlyNew ? CATEGORIES.filter((c) => foods.some((f) => f.category === c.id && onlyNew.has(f.id))) : CATEGORIES;
  return [
    { kind: 'intro' },
    ...cats.map((cat) => ({ kind: 'category' as const, cat })),
    ...(onlyNew ? [] : [{ kind: 'prep' }, { kind: 'restrictions' }, { kind: 'open' }] as Step[]),
    { kind: 'review' },
  ];
}

const PREP_METHOD_TEXT: Record<FoodItem['prep']['method'], string> = {
  'ready-to-eat': 'Ready to eat',
  'add-cold-water': 'Add water',
  'add-hot-water': 'Add hot water',
  heat: 'Needs heating',
  simmer: 'Needs cooking',
  boil: 'Needs boiling',
};

export default function Survey() {
  const { memberId } = useParams<{ memberId: string }>();
  const { lock } = useSession();
  // Handing the iPad over: Admin must be locked whenever a survey is on screen.
  useEffect(() => {
    lock();
  }, [lock]);
  const data = useLiveQuery(async () => {
    const [member, survey] = await Promise.all([db.members.get(memberId!), inProgressSurvey(memberId!)]);
    if (!member || !survey) return { member: null, survey: null } as const;
    const [foods, restrictions, answers] = await Promise.all([
      db.foods.filter((f) => f.active && !f.catalogOnly).toArray(),
      db.restrictions.where('memberId').equals(member.id).filter((r) => r.active).toArray(),
      db.answers.where('surveyId').equals(survey.id).toArray(),
    ]);
    return { member, survey, foods, restrictions, answers };
  }, [memberId]);

  if (!data) return null;
  if (!data.member || !data.survey) return <Navigate to="/welcome" replace />;
  return <Wizard key={data.survey.id} member={data.member} survey={data.survey} foods={data.foods} restrictions={data.restrictions} answers={data.answers} />;
}

function Wizard({ member, survey, foods, restrictions, answers }: {
  member: Member; survey: SurveyT; foods: FoodItem[]; restrictions: MemberRestriction[]; answers: SurveyAnswer[];
}) {
  const nav = useNavigate();
  const name = firstName(member);
  const onlyNew = useMemo(() => (survey.onlyNew ? new Set(survey.onlyNew) : undefined), [survey.onlyNew]);
  // Only the new questions are asked in a "new questions only" survey.
  const asked = useMemo(() => (onlyNew ? foods.filter((f) => onlyNew.has(f.id)) : foods), [foods, onlyNew]);
  const STEPS = useMemo(() => buildSteps(foods, onlyNew), [foods, onlyNew]);
  const [step, setStep] = useState(Math.min(survey.currentStep, STEPS.length - 1));
  const answerMap = useMemo(() => new Map(answers.map((a) => [a.foodItemId, a])), [answers]);
  const cur = STEPS[Math.min(step, STEPS.length - 1)];
  const bodyRef = useRef<HTMLElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [step]);

  async function go(to: number) {
    const next = Math.max(0, Math.min(STEPS.length - 1, to));
    setStep(next);
    await updateSurveyProgress(survey.id, { currentStep: next });
  }

  const pct = Math.round((step / (STEPS.length - 1)) * 100);
  const stepTitle = cur.kind === 'category' ? cur.cat.title : { intro: 'Welcome', prep: 'Preparing food', restrictions: 'About you', open: 'Your ideas', review: 'Finish' }[cur.kind];

  return (
    <div className="survey">
      <header className="survey-top">
        <div className="survey-top-inner">
          <div>
            <div className="small muted">{name}’s survey · step {step + 1} of {STEPS.length}</div>
            <strong>{stepTitle}</strong>
          </div>
          <button className="ghost" onClick={() => nav('/welcome', { replace: true })}>Save &amp; exit</button>
        </div>
        <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${pct}%` }} /></div>
      </header>

      <main className="survey-body" ref={bodyRef}>
        <div className="survey-content">
        {cur.kind === 'intro' && <Intro name={name} newCount={onlyNew?.size} />}
        {cur.kind === 'category' && (
          <CategoryStep cat={cur.cat} foods={asked.filter((f) => f.category === cur.cat.id)} restrictions={restrictions} answers={answerMap} surveyId={survey.id} />
        )}
        {cur.kind === 'prep' && <PrepStep survey={survey} />}
        {cur.kind === 'restrictions' && <RestrictionsStep survey={survey} member={member} restrictions={restrictions} />}
        {cur.kind === 'open' && <OpenStep survey={survey} />}
        {cur.kind === 'review' && <ReviewStep survey={survey} steps={STEPS} foods={asked} restrictions={restrictions} answers={answerMap}
          onSubmit={async () => { await submitSurvey(survey.id); nav('/welcome?done=1', { replace: true }); }} onJump={go} />}
        </div>
      </main>

      {cur.kind !== 'review' && (
        <footer className="survey-bottom">
          <div className="survey-top-inner">
            <button onClick={() => go(step - 1)} disabled={step === 0}>Back</button>
            <button className="primary big" onClick={() => go(step + 1)}>{step === 0 ? 'Let’s start' : 'Next'}</button>
          </div>
        </footer>
      )}
    </div>
  );
}

function Intro({ name, newCount }: { name: string; newCount?: number }) {
  if (newCount) return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <h1>Welcome back, {name}! 👋</h1>
      <p>We added some foods since your last survey. There {newCount === 1 ? 'is just 1 new question' : `are just ${newCount} new questions`}; all your other answers are kept.</p>
      <ul className="stack" style={{ paddingLeft: 20, gap: 6 }}>
        <li>Your answers are <strong>private</strong>. Other family members can’t see them.</li>
        <li>Skip anything you’re not sure about. “Not tried” is a fine answer.</li>
      </ul>
    </div>
  );
  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <h1>Hi {name}! 👋</h1>
      <p>We’re planning which foods to keep at home in case of an emergency, like a power cut or a storm. Your answers help us store food <strong>you</strong> will actually want to eat.</p>
      <ul className="stack" style={{ paddingLeft: 20, gap: 6 }}>
        <li>It takes about 10–15 minutes.</li>
        <li>Your answers are <strong>private</strong>. Other family members can’t see them.</li>
        <li>Skip anything you’re not sure about. “Not tried” is a fine answer.</li>
        <li>You can stop any time. Your answers are saved as you go.</li>
      </ul>
    </div>
  );
}

function CategoryStep({ cat, foods, restrictions, answers, surveyId }: {
  cat: (typeof CATEGORIES)[number]; foods: FoodItem[]; restrictions: MemberRestriction[]; answers: Map<string, SurveyAnswer>; surveyId: string;
}) {
  const withSafety = foods.map((f) => ({ f, safety: checkFood(f, restrictions) }));
  const shown = withSafety.filter((x) => x.safety.blocked.length === 0 && x.safety.disliked.length === 0);
  const hidden = withSafety.filter((x) => x.safety.blocked.length > 0);
  const disliked = withSafety.filter((x) => x.safety.blocked.length === 0 && x.safety.disliked.length > 0);
  const rated = shown.filter((x) => answers.has(x.f.id)).length;

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <h1 style={{ marginBottom: 4 }}>{cat.title}</h1>
          <p className="muted" style={{ margin: 0 }}>{cat.blurb}</p>
        </div>
        <span className="badge">{rated} of {shown.length} answered</span>
      </div>
      {shown.map(({ f }) => <FoodCard key={f.id} food={f} answer={answers.get(f.id)} surveyId={surveyId} restrictions={restrictions} />)}
      {disliked.length > 0 && (
        <details className="card">
          <summary className="muted">{disliked.length} food{disliked.length === 1 ? '' : 's'} skipped because you don’t like {disliked.length === 1 ? 'it' : 'them'}</summary>
          <ul className="small muted">{disliked.map(({ f }) => <li key={f.id}>{f.name}</li>)}</ul>
        </details>
      )}
      {hidden.length > 0 && (
        <details className="card">
          <summary className="muted">{hidden.length} food{hidden.length === 1 ? '' : 's'} skipped to keep you safe</summary>
          <ul className="small muted">{hidden.map(({ f, safety }) => <li key={f.id}>{f.name}: {safety.blocked.join(', ')}</li>)}</ul>
        </details>
      )}
    </div>
  );
}

function FoodCard({ food, answer, surveyId, restrictions }: { food: FoodItem; answer?: SurveyAnswer; surveyId: string; restrictions: MemberRestriction[] }) {
  const [certainWay, setCertainWay] = useState(!!answer?.onlyPreparedCertainWay);
  const [note, setNote] = useState(answer?.prepNotes ?? '');
  const rating = answer?.rating;
  const preference = typeof rating === 'number';
  const liked = new Set(answer?.kinds ?? []);
  // Only kinds that are safe for this person are offered.
  const kinds = food.kinds?.length ? checkKinds(food, restrictions).filter((x) => !x.result.blocked.length).map((x) => x.kind) : [];
  const showKinds = kinds.length > 0 && typeof rating === 'number' && rating >= 3;

  const rate = (v: RatingCode) => saveAnswer(surveyId, food.id, v, { onlyPreparedCertainWay: certainWay && typeof v === 'number', prepNotes: note || undefined, kinds: typeof v === 'number' && v >= 3 ? answer?.kinds : undefined, blockedInfo: v === 'blocked' ? answer?.blockedInfo : undefined });
  const saveExtra = (cw: boolean, n: string) => rating !== undefined && saveAnswer(surveyId, food.id, rating, { onlyPreparedCertainWay: cw, prepNotes: n || undefined, kinds: answer?.kinds });
  const toggleKind = (id: string) => {
    if (rating === undefined) return;
    const next = new Set(liked);
    if (next.has(id)) next.delete(id); else next.add(id);
    saveAnswer(surveyId, food.id, rating, { onlyPreparedCertainWay: certainWay, prepNotes: note || undefined, kinds: kinds.filter((k) => next.has(k.id)).map((k) => k.id) });
  };

  return (
    <article className="card stack food-card" aria-labelledby={`f-${food.id}`}>
      <div>
        <h2 id={`f-${food.id}`} style={{ marginBottom: 4 }}>{food.name}</h2>
        <div className="row small" style={{ gap: 6 }}>
          <span className="badge">{food.form.replace('-', ' ')}</span>
          <span className={`badge ${food.prep.edibleWithoutHeat ? 'ok' : 'warn'}`}>{PREP_METHOD_TEXT[food.prep.method]}</span>
          {food.examples && <span className="muted">e.g. {food.examples}</span>}
        </div>
      </div>
      {kinds.length > 0 && <p style={{ margin: 0 }}><strong>Do you like {food.name.toLowerCase()}?</strong></p>}
      <div className="ratings" role="radiogroup" aria-label={`How do you feel about ${food.name}?`}>
        {RATINGS.map((r) => (
          <button key={String(r.v)} role="radio" aria-checked={rating === r.v} className={`rating ${rating === r.v ? 'on' : ''} ${r.v === 'blocked' ? 'blocked' : ''}`} onClick={() => rate(r.v)}>
            <span className="emoji" aria-hidden>{r.emoji}</span>
            <span>{r.label}</span>
          </button>
        ))}
      </div>
      {showKinds && (
        <div className="stack" style={{ gap: 8 }}>
          <p style={{ margin: 0 }}><strong>Which kinds do you like?</strong> <span className="muted small">Tap all that apply.</span></p>
          <div className="kinds" role="group" aria-label={`Kinds of ${food.name} you like`}>
            {kinds.map((k) => (
              <button key={k.id} type="button" className={`kind ${liked.has(k.id) ? 'on' : ''}`} aria-pressed={liked.has(k.id)} onClick={() => toggleKind(k.id)}>
                <span className="emoji" aria-hidden>{k.icon ?? '🍽️'}</span>
                <span>{k.name}</span>
                {liked.has(k.id) && <span className="check" aria-hidden>✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}
      {rating === 'blocked' && <BlockedFollowUp food={food} info={answer?.blockedInfo ?? {}} save={(info) => saveAnswer(surveyId, food.id, 'blocked', { blockedInfo: info })} />}
      {preference && (
        <div className="stack" style={{ gap: 8 }}>
          <label className="inline">
            <input type="checkbox" checked={certainWay} onChange={(e) => { setCertainWay(e.target.checked); saveExtra(e.target.checked, note); }} />
            I only like this prepared a certain way
          </label>
          {certainWay && (
            <input value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => saveExtra(certainWay, note)} placeholder="How do you like it? (e.g. warm, with rice)" aria-label="How you like it prepared" />
          )}
        </div>
      )}
    </article>
  );
}

// ---------- "Can't eat it" follow-up ----------
const WHY: { type: RestrictionType; emoji: string; label: string }[] = [
  { type: 'allergy', emoji: '🤧', label: 'Allergy' },
  { type: 'intolerance', emoji: '🤢', label: 'Sensitivity (it makes me feel sick)' },
  { type: 'special-diet', emoji: '🥗', label: 'Special diet' },
  { type: 'religious-ethical', emoji: '🙏', label: 'Religious or personal beliefs' },
  { type: 'texture', emoji: '🦷', label: 'Hard to chew or swallow' },
  { type: 'medical-feeding', emoji: '🩺', label: 'Medical reason' },
  { type: 'cannot-eat', emoji: '🤷', label: 'Something else / not sure' },
];
const SEVERITY: { v: NonNullable<BlockedInfo['severity']>; emoji: string; label: string; help: string }[] = [
  { v: 'mild', emoji: '🙂', label: 'Mild', help: 'Itchy mouth, a few hives or an upset tummy' },
  { v: 'moderate', emoji: '😣', label: 'Moderate', help: 'Lots of hives, swelling or throwing up' },
  { v: 'severe', emoji: '🚑', label: 'Severe', help: 'Trouble breathing, or needs an EpiPen or a hospital' },
];
const STRICT_HELP: Record<Strictness, { emoji: string; help: string }> = {
  strict: { emoji: '⛔', help: 'Even a little makes me sick' },
  avoid: { emoji: '✋', help: 'A little is OK now and then, but I’d rather not' },
  minor: { emoji: '🤏', help: 'It bothers me a bit, but I can manage' },
};
const CROSS: { v: NonNullable<BlockedInfo['crossContact']>; emoji: string; label: string }[] = [
  { v: 'concern', emoji: '⚠️', label: 'Yes, that’s a problem' },
  { v: 'fine', emoji: '👍', label: 'No, that’s fine' },
  { v: 'unsure', emoji: '❓', label: 'Not sure' },
];

/** Keep only the answers that apply to the chosen reason. */
function cleanBlocked(i: BlockedInfo): BlockedInfo {
  const allergyLike = i.type === 'allergy' || i.type === 'intolerance';
  const askCross = i.type === 'allergy' || (i.type === 'intolerance' && (i.strictness ?? 'strict') === 'strict');
  return {
    type: i.type,
    subjects: i.subjects?.filter((s) => allergyLike || s.startsWith('food:')),
    severity: i.type === 'allergy' ? i.severity : undefined,
    strictness: i.type === 'intolerance' ? i.strictness : undefined,
    crossContact: askCross ? i.crossContact : undefined,
  };
}

function Choice<T extends string>({ label, options, value, onPick }: {
  label: string; options: { v: T; emoji: string; label: string; help?: string }[]; value?: T; onPick: (v: T) => void;
}) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      <p style={{ margin: 0 }}><strong>{label}</strong></p>
      <div className="kinds" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o.v} type="button" role="radio" aria-checked={value === o.v} className={`kind ${value === o.v ? 'on' : ''}`} onClick={() => onPick(o.v)}>
            <span className="emoji" aria-hidden>{o.emoji}</span>
            <span>{o.label}</span>
            {o.help && <span className="small" style={{ fontWeight: 400 }}>{o.help}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Asks why someone can't eat a food, then (for allergies and sensitivities) what exactly and how careful to be. */
function BlockedFollowUp({ food, info, save }: { food: FoodItem; info: BlockedInfo; save: (info: BlockedInfo) => void }) {
  const set = (patch: Partial<BlockedInfo>) => save(cleanBlocked({ ...info, ...patch }));
  const allergyLike = info.type === 'allergy' || info.type === 'intolerance';
  const askCross = info.type === 'allergy' || (info.type === 'intolerance' && (info.strictness ?? 'strict') === 'strict');
  const lower = food.name.toLowerCase();
  // What exactly: the food's allergens (for allergies/sensitivities) and its kinds.
  const allergens = allergyLike ? [...new Set([...food.allergens.contains, ...(food.allergens.mayContain ?? []), ...(food.kinds ?? []).flatMap((k) => [...(k.contains ?? []), ...(k.mayContain ?? [])])])] : [];
  const kinds = (food.kinds ?? []).map((k) => ({ v: `food:${k.name}`, emoji: k.icon ?? '🍽️', label: k.name }));
  const subjectOptions = [...allergens.map((a) => ({ v: a, emoji: '🧪', label: subjectLabel(a) })), ...kinds];
  const subjects = info.subjects ?? [];
  const toggle = (s: string) => set({ subjects: subjects.includes(s) ? subjects.filter((x) => x !== s) : [...subjects, s] });
  return (
    <div className="stack notice" style={{ gap: 14, margin: 0 }}>
      <Choice label={`Why can’t you eat ${lower}?`} options={WHY.map((w) => ({ v: w.type, emoji: w.emoji, label: w.label }))} value={info.type} onPick={(t) => set({ type: t })} />
      {info.type && subjectOptions.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          <p style={{ margin: 0 }}>
            <strong>{allergyLike ? `What in ${lower} ${info.type === 'allergy' ? 'are you allergic to' : 'bothers you'}?` : `Which kinds can’t you eat?`}</strong>{' '}
            <span className="muted small">Tap all that apply. Tap none if it’s all {lower}{allergyLike ? ' or you’re not sure' : ''}.</span>
          </p>
          <div className="kinds" role="group" aria-label={`What you can’t have in ${food.name}`}>
            {subjectOptions.map((o) => (
              <button key={o.v} type="button" className={`kind ${subjects.includes(o.v) ? 'on' : ''}`} aria-pressed={subjects.includes(o.v)} onClick={() => toggle(o.v)}>
                <span className="emoji" aria-hidden>{o.emoji}</span>
                <span>{o.label}</span>
                {subjects.includes(o.v) && <span className="check" aria-hidden>✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}
      {info.type === 'allergy' && <Choice label="How bad is the reaction?" options={SEVERITY} value={info.severity} onPick={(v) => set({ severity: v })} />}
      {info.type === 'intolerance' && (
        <Choice label="How careful do we need to be?" value={info.strictness} onPick={(v) => set({ strictness: v })}
          options={STRICTNESS.map((s) => ({ v: s.code, emoji: STRICT_HELP[s.code].emoji, label: s.label, help: STRICT_HELP[s.code].help }))} />
      )}
      {askCross && (
        <Choice label="Is cross-contamination a worry? (food made in the same factory or kitchen, or labels that say “may contain”)" options={CROSS} value={info.crossContact} onPick={(v) => set({ crossContact: v })} />
      )}
      <p className="small" style={{ margin: 0 }}>Thanks for telling us. An adult will check this and make sure it’s never planned for you.</p>
    </div>
  );
}

const DEFAULT_PREP: PrepTolerance = { cold: true, addWater: true, boilSimmer: true, rehydrate: true, campStove: true, spicy: 1, sweet: 2, salty: 2 };

function PrepStep({ survey }: { survey: SurveyT }) {
  const [p, setP] = useState<PrepTolerance>(survey.prepTolerance ?? DEFAULT_PREP);
  const set = (patch: Partial<PrepTolerance>) => {
    const next = { ...p, ...patch };
    setP(next);
    updateSurveyProgress(survey.id, { prepTolerance: next });
  };
  // Save defaults once so "skipping" still records an answer.
  useEffect(() => { if (!survey.prepTolerance) updateSurveyProgress(survey.id, { prepTolerance: p }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggles: [keyof PrepTolerance, string][] = [
    ['cold', 'Eat food cold, straight from the can or pouch'],
    ['addWater', 'Add water to food (like oatmeal or drink mixes)'],
    ['rehydrate', 'Eat freeze-dried or dehydrated food once water is added'],
    ['boilSimmer', 'Eat food that needs boiling or simmering'],
    ['campStove', 'Help cook on a camp stove or grill'],
  ];
  const scales: [keyof PrepTolerance, string][] = [['spicy', 'Spicy food'], ['sweet', 'Sweet food'], ['salty', 'Salty food']];
  const SCALE = ['Not at all', 'A little', 'Some', 'Lots'];

  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <h1>Preparing food</h1>
      <p className="muted">In an emergency there might be no power or stove. What would you be OK with?</p>
      <div className="card stack">
        <h2>I would be willing to…</h2>
        {toggles.map(([k, label]) => (
          <label key={k} className="inline"><input type="checkbox" checked={!!p[k]} onChange={(e) => set({ [k]: e.target.checked } as Partial<PrepTolerance>)} /> {label}</label>
        ))}
      </div>
      <div className="card stack">
        <h2>How much do you like…</h2>
        {scales.map(([k, label]) => (
          <div key={k} className="stack" style={{ gap: 6 }}>
            <strong>{label}</strong>
            <div className="row" role="radiogroup" aria-label={label}>
              {SCALE.map((s, i) => (
                <button key={s} role="radio" aria-checked={p[k] === i} className={p[k] === i ? 'primary' : ''} onClick={() => set({ [k]: i } as Partial<PrepTolerance>)}>{s}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RestrictionsStep({ survey, member, restrictions }: { survey: SurveyT; member: Member; restrictions: MemberRestriction[] }) {
  const [sugs, setSugs] = useState<Suggestion[]>(survey.suggestions ?? []);
  const save = (next: Suggestion[]) => { setSugs(next); updateSurveyProgress(survey.id, { suggestions: next }); };

  const removal = (rid: string) => sugs.find((s): s is Extract<Suggestion, { kind: 'remove-restriction' }> => s.kind === 'remove-restriction' && s.restrictionId === rid);
  const add = sugs.find((s): s is Extract<Suggestion, { kind: 'add-restriction' }> => s.kind === 'add-restriction');
  const pname = sugs.find((s): s is Extract<Suggestion, { kind: 'preferred-name' }> => s.kind === 'preferred-name');

  const [addType, setAddType] = useState<RestrictionType>(add?.restrictionType ?? 'cannot-eat');
  const [addText, setAddText] = useState(add?.text ?? '');
  const [nameText, setNameText] = useState(pname?.value ?? '');

  const upsert = (kind: Suggestion['kind'], sg: Suggestion | null) => save([...sugs.filter((s) => s.kind !== kind || (kind === 'remove-restriction')), ...(sg ? [sg] : [])]);

  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <h1>About you</h1>
      <p className="muted">Please check what we have on file. If something is wrong, tell us and an adult will review it.</p>

      <section className="card stack">
        <h2>Allergies &amp; foods you can’t eat</h2>
        {restrictions.length === 0 && <p className="muted">Nothing on file.</p>}
        {[...restrictions].sort((a, b) => Number(a.type === 'dislike') - Number(b.type === 'dislike')).map((r) => {
          const flagged = removal(r.id);
          return (
            <div key={r.id} className="stack" style={{ gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
              <div className="spread">
                <span><strong>{subjectLabel(r.subject)}</strong> <span className="badge">{RESTRICTION_TYPES.find((t) => t.code === r.type)?.label}</span></span>
                <div className="row" role="radiogroup" aria-label={`Is ${subjectLabel(r.subject)} right?`}>
                  <button role="radio" aria-checked={!flagged} className={!flagged ? 'primary' : ''} onClick={() => save(sugs.filter((s) => !(s.kind === 'remove-restriction' && s.restrictionId === r.id)))}>That’s right</button>
                  <button role="radio" aria-checked={!!flagged} className={flagged ? 'primary' : ''} onClick={() => !flagged && save([...sugs, { id: uid(), kind: 'remove-restriction', restrictionId: r.id }])}>That’s not right</button>
                </div>
              </div>
              {flagged && (
                <input defaultValue={flagged.reason ?? ''} placeholder="What’s changed? (optional)" aria-label="Reason"
                  onBlur={(e) => save(sugs.map((s) => (s.id === flagged.id ? { ...flagged, reason: e.target.value } : s)))} />
              )}
            </div>
          );
        })}
        {restrictions.some((r) => r.verifiedAt) && <p className="small muted" style={{ margin: 0 }}>Confirmed allergies stay in place until an adult reviews your note.</p>}
      </section>

      <section className="card stack">
        <h2>Anything missing?</h2>
        <div className="grid">
          <label>What kind?
            <select value={addType} onChange={(e) => { setAddType(e.target.value as RestrictionType); if (addText.trim()) upsert('add-restriction', { id: add?.id ?? uid(), kind: 'add-restriction', restrictionType: e.target.value as RestrictionType, text: addText }); }}>
              <option value="cannot-eat">I can’t eat it</option>
              <option value="allergy">Allergy</option>
              <option value="intolerance">It makes me feel unwell</option>
              <option value="religious-ethical">I don’t eat it for religious or personal reasons</option>
              <option value="dislike">I just don’t like it</option>
            </select>
          </label>
          <label>Which foods?
            <input value={addText} onChange={(e) => setAddText(e.target.value)} placeholder="e.g. mushrooms, coconut"
              onBlur={() => upsert('add-restriction', addText.trim() ? { id: add?.id ?? uid(), kind: 'add-restriction', restrictionType: addType, text: addText } : null)} />
          </label>
        </div>
      </section>

      <section className="card stack">
        <h2>What should we call you?</h2>
        <label>Name you’d like to see (optional)
          <input value={nameText} onChange={(e) => setNameText(e.target.value)} placeholder={member.preferredName || member.displayName}
            onBlur={() => upsert('preferred-name', nameText.trim() && nameText.trim() !== (member.preferredName ?? '') ? { id: pname?.id ?? uid(), kind: 'preferred-name', value: nameText.trim() } : null)} />
        </label>
      </section>
    </div>
  );
}

function OpenStep({ survey }: { survey: SurveyT }) {
  const [o, setO] = useState(survey.openResponses ?? {});
  const save = () => updateSurveyProgress(survey.id, { openResponses: o });
  const fields: [keyof NonNullable<SurveyT['openResponses']>, string, string][] = [
    ['foodsToAdd', 'Foods we should add', 'Anything you’d want that we didn’t ask about'],
    ['neverStock', 'Foods you never want stocked for you', 'We’ll avoid planning these for you'],
    ['comfortMeals', 'Meals that feel comforting when things are stressful', 'e.g. hot cocoa, mac & cheese'],
  ];
  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <h1>Your ideas</h1>
      <p className="muted">All optional.</p>
      {fields.map(([k, label, ph]) => (
        <label key={k}>{label}
          <textarea value={o[k] ?? ''} placeholder={ph} onChange={(e) => setO({ ...o, [k]: e.target.value })} onBlur={save} />
        </label>
      ))}
    </div>
  );
}

function ReviewStep({ survey, steps, foods, restrictions, answers, onSubmit, onJump }: {
  survey: SurveyT; steps: Step[]; foods: FoodItem[]; restrictions: MemberRestriction[]; answers: Map<string, SurveyAnswer>; onSubmit: () => Promise<void>; onJump: (step: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const STEPS = steps;
  const onlyNew = survey.onlyNew ? new Set(survey.onlyNew) : undefined;
  const rows = steps.flatMap((s, i) => {
    if (s.kind !== 'category') return [];
    const safe = foods.filter((f) => f.category === s.cat.id && !isExcluded(f, restrictions));
    return [{ c: s.cat, step: i, total: safe.length, done: safe.filter((f) => answers.has(f.id)).length }];
  });
  const total = rows.reduce((a, r) => a + r.total, 0);
  const done = rows.reduce((a, r) => a + r.done, 0);
  const notes = (survey.suggestions ?? []).length + [...answers.values()].filter((a) => a.rating === 'blocked' && (!onlyNew || onlyNew.has(a.foodItemId))).length;

  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <h1>All done?</h1>
      <p>You answered <strong>{done} of {total}</strong> {onlyNew ? 'new ' : ''}foods. Anything you skipped counts as “not sure”, which is fine.{onlyNew ? ' Your earlier answers are kept.' : ''}</p>
      <div className="card list">
        {rows.map((r) => (
          <div key={r.c.id} className="spread">
            <span>{r.c.title}</span>
            <span className="row"><span className={`badge ${r.done === r.total ? 'ok' : ''}`}>{r.done}/{r.total}</span><button className="ghost" onClick={() => onJump(r.step)}>Edit</button></span>
          </div>
        ))}
      </div>
      {notes > 0 && <p className="small muted">You left {notes} note{notes === 1 ? '' : 's'} for an adult to review.</p>}
      <p className="small muted">After you submit, your answers are locked. An adult can let you take it again later.</p>
      <div className="row">
        <button onClick={() => onJump(STEPS.length - 2)}>Back</button>
        <button className="primary big" disabled={busy} onClick={async () => { setBusy(true); await onSubmit(); }}>Submit my answers</button>
      </div>
    </div>
  );
}
