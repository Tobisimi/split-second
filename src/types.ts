export type Subject = 'AM' | 'DA' | 'VR' | 'GK';
export type Stage = 'group' | 'qf' | 'sf' | 'third' | 'final';
// confirmed: the show displayed this answer, or a contestant said it and got the points
// disputed: the show displayed something else (showKey) that looks wrong; this is the worked answer
// worked_out: the show's answer wasn't captured, so this answer was worked out (not confirmed)
export type Tag = 'confirmed' | 'disputed' | 'worked_out';

export interface Question {
  id: string;
  video: string;          // YouTube video id
  t: number;              // seconds into the video
  match: string;
  stage: Stage;
  half: 'QB' | 'BM';      // Quick Buzz or Brain Match
  subject: Subject;
  topic?: string;
  level: 1 | 2 | 3;
  q: string;              // question text; maths inside \( ... \) is rendered with KaTeX
  options?: string[];     // three options when the show offered them
  answer: string;
  accept?: string[];      // other accepted forms
  tol?: number;           // absolute tolerance for numeric answers
  unitMatters?: boolean;
  tag: Tag;
  showKey?: string;       // what the show displayed, when it differs from answer
  showNote?: string;
  result?: 'right' | 'wrong' | 'none';   // how the contestant did on the show
  player?: string;
  school?: string;
  solution?: string;
  trick?: string;
}

export type Result = 'right' | 'wrong' | 'none' | 'skip';

export interface ItemRec { id: string; r: Result; ms?: number; given?: string }

export interface SessionRec {
  id: string;
  at: number;
  mode: 'practice' | 'brain';
  subject: Subject | 'MIX';
  level: 1 | 2 | 3 | 0;   // 0 = all levels
  secs: number;           // seconds per question (0 = untimed)
  scoring: ScoringRule;
  score: number;
  items: ItemRec[];
}

export interface Flag { note: string; at: number }

export interface Progress {
  v: 1;
  profile: string;
  updated: number;
  sessions: SessionRec[];
  flags: Record<string, Flag>;
}

export type ScoringRule = 'practice' | 'show_qb' | 'ladder';
export type AnswerMode = 'say' | 'type';

export interface Setup {
  mode: 'practice' | 'brain';
  subject: Subject | 'MIX';
  level: 1 | 2 | 3 | 0;
  count: number;          // practice only
  secs: number;           // per question; 0 = untimed (practice only)
  answerMode: AnswerMode;
  skips: boolean;
  skipsCount: boolean;    // count a skip as unanswered instead of replacing it
  scoring: ScoringRule;
  quarterSecs: number;    // brain match only
  missesOnly: boolean;
}

export const SUBJECT_NAMES: Record<Subject | 'MIX', string> = {
  AM: 'Applied Maths', DA: 'Data Analysis', VR: 'Verbal Reasoning', GK: 'General Knowledge', MIX: 'Mixed',
};
export const STAGE_NAMES: Record<Stage, string> = {
  group: 'Group stage', qf: 'Quarter-final', sf: 'Semi-final', third: 'Third place', final: 'Final',
};
