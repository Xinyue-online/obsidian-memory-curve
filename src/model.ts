/**
 * 记忆曲线纯函数模型。
 *
 * 不依赖 Obsidian API，全部是确定性纯函数，因此可以直接单测。
 * 公式与任务书一致：
 *
 *   保持率   R(t) = exp(-t / S)           t 为距上次复习的天数，S 为记忆稳定度（天）
 *   成熟因子 f(n) = min(1, 0.5 + 0.1n)    n 为成功复习次数（q >= 3 的手动打分次数）
 *   熟练度   P    = R(t) * f(n)
 *
 * 打分 q 取 0..5：
 *   q >= 3  →  S ← S * m(q)，m(3)=1.5、m(4)=2.2、m(5)=3.0
 *   q <  3  →  S ← max(1, S * 0.35)，失败次数 +1
 *   首次手动打分时 S 先回到初值 S0（默认 3 天），再套上面的倍率。
 *
 * 到期判据：R(t) < 阈值（默认 0.75），等价于 t > S * ln(1/阈值)。
 */

/** 一天的毫秒数。 */
export const DAY_MS = 86_400_000;

/** 记忆稳定度下限（天）。低于 1 天没有意义。 */
export const MIN_STABILITY = 1;

/** q < 3 时的稳定度惩罚系数。 */
export const FAIL_FACTOR = 0.35;

/** q >= 3 时的稳定度倍率。 */
export const PASS_MULTIPLIER: Readonly<Record<number, number>> = { 3: 1.5, 4: 2.2, 5: 3.0 };

/** 稳定度初值缺省 3 天。任务书「待定」项，做成设置项。 */
export const DEFAULT_INITIAL_STABILITY = 3;

/** 到期保持率阈值缺省 0.75。任务书「待定」项，做成设置项。 */
export const DEFAULT_RETENTION_THRESHOLD = 0.75;

/** history 保留上限，防止无限增长。 */
export const MAX_HISTORY = 2000;

/**
 * 熟练度分档。
 * - mastered / familiar / fuzzy / forgetting：只由「已真实打过分」的熟练度 P 决定；
 * - baseline：还没打过分的冷启动基线（单独一档，不进上面四档，也不参与掌握度平均）；
 * - unreviewed：库里连记录都没有。
 */
export type Bucket = "mastered" | "familiar" | "fuzzy" | "forgetting" | "baseline" | "unreviewed";

/** 分档顺序（从熟练到未复习），图表按此顺序堆叠。 */
export const BUCKET_ORDER: readonly Bucket[] = [
  "mastered",
  "familiar",
  "fuzzy",
  "forgetting",
  "baseline",
  "unreviewed",
];

/** 分档边界：P >= 0.85 熟练、>= 0.60 熟悉、>= 0.30 模糊、< 0.30 遗忘中。 */
export const BUCKET_THRESHOLDS = { mastered: 0.85, familiar: 0.6, fuzzy: 0.3 } as const;

/** 一次手动打分的流水记录。 */
export interface HistoryEntry {
  /** 打分时刻（毫秒时间戳）。 */
  t: number;
  /** 打分 q，0..5。 */
  q: number;
  /** 打分后的稳定度（天）。 */
  s: number;
}

/** 单篇笔记的复习记录，对应 reviews.json 里 notes[path] 的值。 */
export interface ReviewRecord {
  /** 首次纳入统计的时刻。 */
  added: number;
  /** 上次手动打分时刻；未打过分时等于 added。 */
  last: number;
  /** 下次到期时刻。基线笔记等于 added（永远排在待复习队列里）。 */
  due: number;
  /** 手动打分总次数。基线扫描不计数。 */
  times: number;
  /** 失败次数（q < 3 的次数）。 */
  lapses: number;
  /** 记忆稳定度（天）。 */
  stability: number;
  /** 上次打分；从未打分为 -1。 */
  quality: number;
  /** true 表示这条记录来自冷启动基线，不是真实复习。 */
  baseline: boolean;
  /** 打分流水，用于复习日历。 */
  history: HistoryEntry[];
}

/** 模型参数（来自插件设置）。 */
export interface ModelParams {
  /** 稳定度初值 S0（天）。 */
  initialStability: number;
  /** 到期保持率阈值，P(R < 阈值) 即到期。 */
  retentionThreshold: number;
}

/** 单篇笔记的派生统计量，供侧边栏与图表使用。 */
export interface NoteStat {
  path: string;
  record: ReviewRecord | undefined;
  /** 熟练度 0..1；无记录为 null。 */
  score: number | null;
  bucket: Bucket;
  /** 是否已进入待复习队列（基线笔记恒为 true）。 */
  due: boolean;
  /** 是否只是冷启动基线。 */
  baseline: boolean;
}

/** 范围汇总。 */
export interface Summary {
  total: number;
  /** 各档篇数。 */
  counts: Record<Bucket, number>;
  /** 全体平均熟练度（含基线，仅供内部参考；界面用 averageReviewed，基线会随时间自然衰减）。 */
  averageAll: number;
  /** 仅已真实复习过的笔记的平均熟练度；一篇都没有时为 null。界面上的「掌握度」用它。 */
  averageReviewed: number | null;
  /** 基线笔记篇数。 */
  baselineCount: number;
  /** 待复习篇数。 */
  dueCount: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/** 把任意输入夹到合法稳定度。 */
export function clampStability(stability: number): number {
  if (!Number.isFinite(stability)) return MIN_STABILITY;
  return Math.max(MIN_STABILITY, stability);
}

/** 把任意输入取整到 0..5 的合法打分。 */
export function clampGrade(grade: number): number {
  if (!Number.isFinite(grade)) return 0;
  return Math.round(clamp(grade, 0, 5));
}

/** 保持率 R(t) = exp(-t / S)。 */
export function retention(elapsedDays: number, stability: number): number {
  if (!(stability > 0)) return 0;
  if (!(elapsedDays > 0)) return 1;
  return Math.exp(-elapsedDays / stability);
}

/** 成功复习次数 n = 手动打分次数 - 失败次数。 */
export function successCount(record: ReviewRecord): number {
  return Math.max(0, record.times - record.lapses);
}

/** 成熟度因子 f(n) = min(1, 0.5 + 0.1n)。 */
export function maturityFactor(successes: number): number {
  return Math.min(1, 0.5 + 0.1 * Math.max(0, successes));
}

/** 距到期天数：R(t) < 阈值 的临界点 t = S * ln(1/阈值)。 */
export function intervalDays(stability: number, threshold: number): number {
  const shaped = clamp(threshold, 0.01, 0.999);
  return clampStability(stability) * Math.log(1 / shaped);
}

/** 由「上次复习时刻 + 稳定度」算出下次到期时刻。 */
export function nextDue(last: number, stability: number, threshold: number): number {
  return last + intervalDays(stability, threshold) * DAY_MS;
}

/** 熟练度 P = R(t) * f(n)。签名保留 params，便于以后把 S 相关参数纳入 P。 */
export function proficiency(record: ReviewRecord, now: number, _params: ModelParams): number {
  const elapsedDays = (now - record.last) / DAY_MS;
  return clamp01(retention(elapsedDays, record.stability) * maturityFactor(successCount(record)));
}

/** 是否已真实复习过（手动打过分）。 */
export function isReviewed(record: ReviewRecord): boolean {
  return record.times > 0 && !record.baseline;
}

/** 是否到期。基线笔记恒为到期，这样第一天的待复习队列就不会是空的。 */
export function isDue(record: ReviewRecord, now: number, params: ModelParams): boolean {
  if (record.baseline || record.times === 0) return true;
  const elapsedDays = (now - record.last) / DAY_MS;
  return retention(elapsedDays, record.stability) < params.retentionThreshold;
}

/** 分档。无记录 = 未复习；基线（从未打过分）= 基线档，不按 P 落进四档。 */
export function bucketOf(record: ReviewRecord | undefined, now: number, params: ModelParams): Bucket {
  if (!record) return "unreviewed";
  if (record.baseline) return "baseline";
  const score = proficiency(record, now, params);
  if (score >= BUCKET_THRESHOLDS.mastered) return "mastered";
  if (score >= BUCKET_THRESHOLDS.familiar) return "familiar";
  if (score >= BUCKET_THRESHOLDS.fuzzy) return "fuzzy";
  return "forgetting";
}

/** 冷启动基线记录：有形状、无复习。 */
export function createBaseline(now: number, params: ModelParams): ReviewRecord {
  return {
    added: now,
    last: now,
    due: now,
    times: 0,
    lapses: 0,
    stability: clampStability(params.initialStability),
    quality: -1,
    baseline: true,
    history: [],
  };
}

/**
 * 套用一次手动打分，返回新记录（不改原对象）。
 *
 * 首次手动打分（times === 0）时先把 S 拉回初值 S0，再套倍率/惩罚。
 */
export function applyGrade(
  record: ReviewRecord,
  grade: number,
  now: number,
  params: ModelParams,
): ReviewRecord {
  const q = clampGrade(grade);
  const firstManual = record.times === 0;
  const base = clampStability(firstManual ? params.initialStability : record.stability);
  const stability =
    q >= 3 ? clampStability(base * (PASS_MULTIPLIER[q] ?? 1)) : Math.max(MIN_STABILITY, base * FAIL_FACTOR);

  const history = record.history.concat({ t: now, q, s: stability });
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }

  return {
    added: record.added,
    last: now,
    due: nextDue(now, stability, params.retentionThreshold),
    times: record.times + 1,
    lapses: record.lapses + (q < 3 ? 1 : 0),
    stability,
    quality: q,
    baseline: false,
    history,
  };
}

/**
 * 设置变更后重算派生字段。
 *
 * - 从未打分的记录（基线）：稳定度回到新的 S0，到期时间回到 added；
 * - 打过分的记录：保持 S，但到期时间按新阈值重算。
 */
export function applyParams(record: ReviewRecord, params: ModelParams): ReviewRecord {
  if (record.times === 0) {
    const stability = clampStability(params.initialStability);
    return { ...record, stability, last: record.added, due: record.added, baseline: true };
  }
  return { ...record, due: nextDue(record.last, record.stability, params.retentionThreshold) };
}

/** 补齐缺失字段，容忍手改过或旧版本的数据文件。 */
export function normalizeRecord(raw: Partial<ReviewRecord> | undefined, now: number, params: ModelParams): ReviewRecord {
  const fallback = createBaseline(now, params);
  if (!raw || typeof raw !== "object") return fallback;
  const num = (value: unknown, backup: number): number =>
    typeof value === "number" && Number.isFinite(value) ? value : backup;
  const history = Array.isArray(raw.history)
    ? raw.history
        .filter((entry): entry is HistoryEntry => !!entry && typeof entry.t === "number")
        .map((entry) => ({ t: entry.t, q: clampGrade(num(entry.q, 0)), s: clampStability(num(entry.s, params.initialStability)) }))
    : [];
  return {
    added: num(raw.added, now),
    last: num(raw.last, now),
    due: num(raw.due, num(raw.added, now)),
    times: Math.max(0, Math.round(num(raw.times, 0))),
    lapses: Math.max(0, Math.round(num(raw.lapses, 0))),
    stability: clampStability(num(raw.stability, params.initialStability)),
    quality: typeof raw.quality === "number" ? clampGrade(raw.quality) : -1,
    baseline: raw.baseline === true || num(raw.times, 0) === 0,
    history,
  };
}

/** 本地日序号（自 1970-01-01 起的天数）。tzOffsetMinutes 为「东经为正」的分钟偏移。 */
export function localDayIndex(time: number, tzOffsetMinutes?: number): number {
  const offset = tzOffsetMinutes ?? -new Date(time).getTimezoneOffset();
  return Math.floor((time + offset * 60_000) / DAY_MS);
}

/**
 * 本地日序号转 YYYY-MM-DD。
 * dayIndex * DAY_MS 本身就是「当地 00:00」对应的 UTC 瞬间，直接取日期部分即可；
 * 再减一次偏移会整体提前一天（东八区下 2026-10-11 会显示成 2026-10-10）。
 */
export function dayLabel(dayIndex: number, _tzOffsetMinutes?: number): string {
  return new Date(dayIndex * DAY_MS).toISOString().slice(0, 10);
}

/** 把所有记录的打分流水摊平成「日序号 → 当天复习次数」。 */
export function activityByDay(
  records: Iterable<ReviewRecord>,
  tzOffsetMinutes?: number,
): Map<number, number> {
  const days = new Map<number, number>();
  for (const record of records) {
    for (const entry of record.history) {
      const day = localDayIndex(entry.t, tzOffsetMinutes);
      days.set(day, (days.get(day) ?? 0) + 1);
    }
  }
  return days;
}

/**
 * 连续复习天数：从今天往回数，每天至少一次手动打分。
 * 今天还没打分但昨天打了，也算连上（当天尚未开始的宽限）。
 */
export function reviewStreak(records: Iterable<ReviewRecord>, now: number, tzOffsetMinutes?: number): number {
  const days = activityByDay(records, tzOffsetMinutes);
  if (days.size === 0) return 0;
  const today = localDayIndex(now, tzOffsetMinutes);
  let cursor = days.has(today) ? today : today - 1;
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor -= 1;
  }
  return streak;
}

/** 由路径列表与记录表算出逐篇统计量。 */
export function buildStats(
  paths: readonly string[],
  records: ReadonlyMap<string, ReviewRecord>,
  now: number,
  params: ModelParams,
): NoteStat[] {
  return paths.map((path) => {
    const record = records.get(path);
    return {
      path,
      record,
      score: record ? proficiency(record, now, params) : null,
      bucket: bucketOf(record, now, params),
      due: record ? isDue(record, now, params) : true,
      baseline: record?.baseline ?? false,
    };
  });
}

/** 汇总一组统计量。 */
export function summarize(stats: readonly NoteStat[]): Summary {
  const counts = {} as Record<Bucket, number>;
  for (const key of BUCKET_ORDER) counts[key] = 0;

  let sumAll = 0;
  let sumReviewed = 0;
  let reviewed = 0;
  let baselineCount = 0;
  let dueCount = 0;

  for (const stat of stats) {
    counts[stat.bucket] += 1;
    if (stat.baseline) baselineCount += 1;
    if (stat.due) dueCount += 1;
    if (stat.score !== null) {
      sumAll += stat.score;
      if (!stat.baseline) {
        sumReviewed += stat.score;
        reviewed += 1;
      }
    }
  }

  const total = stats.length;
  return {
    total,
    counts,
    averageAll: total === 0 ? 0 : sumAll / total,
    averageReviewed: reviewed === 0 ? null : sumReviewed / reviewed,
    baselineCount,
    dueCount,
  };
}

/** 按到期时间升序排待复习队列；同刻按熟练度升序（更该复习的排前面）。 */
export function dueQueue(stats: readonly NoteStat[], limit = Number.POSITIVE_INFINITY): NoteStat[] {
  return stats
    .filter((stat) => stat.due)
    .slice()
    .sort((a, b) => {
      const da = a.record?.due ?? 0;
      const db = b.record?.due ?? 0;
      if (da !== db) return da - db;
      return (a.score ?? 0) - (b.score ?? 0);
    })
    .slice(0, limit);
}
