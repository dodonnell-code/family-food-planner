import { db } from '../../data/db';
import type { Member, Survey } from '../../domain/types';

export interface MemberWithSurvey {
  member: Member;
  latest?: Survey; // latest submitted
  inProgress?: Survey;
  history: Survey[];
}

export async function loadMembersWithSurveys(): Promise<MemberWithSurvey[]> {
  const [members, surveys] = await Promise.all([db.members.toArray(), db.surveys.toArray()]);
  return members
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .map((member) => {
      const mine = surveys.filter((s) => s.memberId === member.id).sort((a, b) => b.version - a.version);
      return {
        member,
        latest: mine.find((s) => s.status === 'submitted'),
        inProgress: mine.find((s) => s.status === 'in-progress'),
        history: mine,
      };
    });
}

export function surveyBadge(x: MemberWithSurvey): { text: string; tone: '' | 'ok' | 'warn' | 'danger' } {
  if (x.inProgress) return { text: 'In progress', tone: 'warn' };
  if (!x.latest) return { text: 'No survey yet', tone: 'danger' };
  if (x.latest.needsRefresh) return { text: 'Needs refresh', tone: 'warn' };
  return { text: 'Complete', tone: 'ok' };
}

