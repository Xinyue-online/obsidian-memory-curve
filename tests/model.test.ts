import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  DEFAULT_INITIAL_STABILITY,
  DEFAULT_RETENTION_THRESHOLD,
  applyGrade,
  applyParams,
  bucketOf,
  buildStats,
  createBaseline,
  dayLabel,
  dueQueue,
  intervalDays,
  localDayIndex,
  maturityFactor,
  nextDue,
  normalizeRecord,
  proficiency,
  retention,
  reviewStreak,
  summarize,
  type ModelParams,
  type ReviewRecord,
} from "../src/model";

const params: ModelParams = {
  initialStability: DEFAULT_INITIAL_STABILITY,
  retentionThreshold: DEFAULT_RETENTION_THRESHOLD,
};

/** 2026-01-15 20:00（UTC+8） */
const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);
const TZ = 480;

/** 造一条已复习记录：S 稳定度、成功 n 次、t 天前复习过。 */
function recordWith(stability: number, successes: number, elapsedDays: number, now = NOW): ReviewRecord {
  const last = now - elapsedDays * DAY_MS;
  return {
    added: last,
    last,
    due: last,
    times: successes,
    lapses: 0,
    stability,
    quality: 4,
    baseline: false,
    history: [],
  };
}

describe("retention R(t) = exp(-t/S)", () => {
  it("t = 0 时保持率为 1", () => {
    expect(retention(0, 10)).toBe(1);
  });

  it("t = S 时保持率为 1/e", () => {
    expect(retention(10, 10)).toBeCloseTo(Math.exp(-1), 12);
  });

  it("t 为负或 S 非法时退化为 1 / 0", () => {
    expect(retention(-3, 10)).toBe(1);
    expect(retention(3, 0)).toBe(0);
  });
});

describe("成熟度因子 f(n) = min(1, 0.5 + 0.1n)", () => {
  it("取任务书给定值", () => {
    expect(maturityFactor(0)).toBeCloseTo(0.5, 12);
    expect(maturityFactor(1)).toBeCloseTo(0.6, 12);
    expect(maturityFactor(3)).toBeCloseTo(0.8, 12);
    expect(maturityFactor(5)).toBeCloseTo(1.0, 12);
  });

  it("封顶 1，负数按 0 处理", () => {
    expect(maturityFactor(50)).toBe(1);
    expect(maturityFactor(-4)).toBeCloseTo(0.5, 12);
  });
});

describe("到期区间", () => {
  it("t = S·ln(1/阈值)", () => {
    expect(intervalDays(6.6, 0.75)).toBeCloseTo(6.6 * Math.log(1 / 0.75), 12);
    expect(intervalDays(10, 0.5)).toBeCloseTo(10 * Math.log(2), 12);
  });

  it("nextDue 从上次复习时刻往后推", () => {
    const due = nextDue(NOW, 6.6, 0.75);
    expect((due - NOW) / DAY_MS).toBeCloseTo(1.8987, 3);
  });

  it("阈值非法时被夹到可用区间", () => {
    expect(Number.isFinite(intervalDays(5, 0))).toBe(true);
    expect(intervalDays(5, 0)).toBeCloseTo(5 * Math.log(1 / 0.01), 12);
  });
});

describe("applyGrade：稳定度更新", () => {
  it("首次打分：S 从初值 3 起步再乘倍率", () => {
    const base = createBaseline(NOW, params);
    expect(base.stability).toBe(3);

    expect(applyGrade(base, 3, NOW, params).stability).toBeCloseTo(4.5, 12);
    expect(applyGrade(base, 4, NOW, params).stability).toBeCloseTo(6.6, 12);
    expect(applyGrade(base, 5, NOW, params).stability).toBeCloseTo(9.0, 12);
  });

  it("后续打分：在现有 S 上继续乘倍率", () => {
    const first = applyGrade(createBaseline(NOW, params), 4, NOW, params);
    expect(first.stability).toBeCloseTo(6.6, 12);
    const second = applyGrade(first, 4, NOW + DAY_MS, params);
    expect(second.stability).toBeCloseTo(6.6 * 2.2, 12);
  });

  it("q < 3：S ← max(1, S×0.35)，失败次数 +1", () => {
    const base = createBaseline(NOW, params);
    const bad = applyGrade(base, 2, NOW, params);
    expect(bad.stability).toBeCloseTo(Math.max(1, 3 * 0.35), 12);
    expect(bad.lapses).toBe(1);

    const worse = applyGrade(bad, 0, NOW + DAY_MS, params);
    expect(worse.stability).toBe(1);
    expect(worse.lapses).toBe(2);
  });

  it("打分流水与计数原子更新", () => {
    const base = createBaseline(NOW, params);
    const graded = applyGrade(base, 5, NOW, params);
    expect(graded.times).toBe(1);
    expect(graded.baseline).toBe(false);
    expect(graded.quality).toBe(5);
    expect(graded.last).toBe(NOW);
    expect(graded.added).toBe(base.added);
    expect(graded.history).toEqual([{ t: NOW, q: 5, s: 9 }]);
    expect(graded.due).toBeCloseTo(NOW + 9 * Math.log(1 / 0.75) * DAY_MS, 6);
  });

  it("时间戳越界的打分被夹到 0..5", () => {
    const base = createBaseline(NOW, params);
    expect(applyGrade(base, 7, NOW, params).quality).toBe(5);
    expect(applyGrade(base, -2, NOW, params).quality).toBe(0);
    expect(applyGrade(base, 3.6, NOW, params).quality).toBe(4);
  });

  it("不改原记录（纯函数）", () => {
    const base = createBaseline(NOW, params);
    const snapshot = JSON.stringify(base);
    applyGrade(base, 4, NOW, params);
    expect(JSON.stringify(base)).toBe(snapshot);
  });
});

describe("proficiency P = R(t)·f(n)", () => {
  it("n 次成功后 f 封顶，P 等于 R", () => {
    const rec = recordWith(10, 5, 0);
    expect(proficiency(rec, NOW, params)).toBeCloseTo(1, 12);
  });

  it("按 0.5 基线因子起步", () => {
    const rec = recordWith(10, 0, 0);
    expect(proficiency(rec, NOW, params)).toBeCloseTo(0.5, 12);
  });

  it("时间流逝后按指数衰减", () => {
    const rec = recordWith(10, 5, 10);
    expect(proficiency(rec, NOW, params)).toBeCloseTo(Math.exp(-1), 12);
  });

  it("成功次数 = times - lapses", () => {
    const rec = recordWith(10, 4, 0);
    rec.lapses = 2;
    expect(proficiency(rec, NOW, params)).toBeCloseTo(0.7, 12);
  });
});

describe("分档边界", () => {
  it("四档按 0.85 / 0.60 / 0.30 切开", () => {
    const at = (target: number): ReviewRecord =>
      recordWith(10, 5, (10 * Math.log(1 / target)) / 1);
    expect(bucketOf(at(0.8501), NOW, params)).toBe("mastered");
    expect(bucketOf(at(0.8499), NOW, params)).toBe("familiar");
    expect(bucketOf(at(0.6001), NOW, params)).toBe("familiar");
    expect(bucketOf(at(0.5999), NOW, params)).toBe("fuzzy");
    expect(bucketOf(at(0.3001), NOW, params)).toBe("fuzzy");
    expect(bucketOf(at(0.2999), NOW, params)).toBe("forgetting");
  });

  it("无记录 = 未复习；基线单独一档，不按 P 落进四档", () => {
    expect(bucketOf(undefined, NOW, params)).toBe("unreviewed");
    expect(bucketOf(createBaseline(NOW, params), NOW, params)).toBe("baseline");
    // 基线放久了 P 会衰减，但档位不跟着掉
    expect(bucketOf(createBaseline(NOW - 30 * DAY_MS, params), NOW, params)).toBe("baseline");
    // 打过一次分就脱离基线档，按 P 落档（R=1、f=0.6 → 0.60 → 熟悉）
    const graded = applyGrade(createBaseline(NOW, params), 5, NOW, params);
    expect(bucketOf(graded, NOW, params)).toBe("familiar");
  });
});

describe("applyParams：设置变更重算", () => {
  it("未打分的记录跟着新的 S0 走，到期时间回到 added", () => {
    const base = createBaseline(NOW - 5 * DAY_MS, params);
    const updated = applyParams(base, { initialStability: 7, retentionThreshold: 0.9 });
    expect(updated.stability).toBe(7);
    expect(updated.last).toBe(base.added);
    expect(updated.due).toBe(base.added);
    expect(updated.baseline).toBe(true);
  });

  it("打过分的记录保留 S，只按新阈值重算到期", () => {
    const graded = applyGrade(createBaseline(NOW, params), 4, NOW, params);
    const updated = applyParams(graded, { initialStability: 7, retentionThreshold: 0.5 });
    expect(updated.stability).toBeCloseTo(6.6, 12);
    expect(updated.times).toBe(1);
    expect(updated.due).toBeCloseTo(NOW + 6.6 * Math.log(2) * DAY_MS, 6);
  });
});

describe("normalizeRecord：容忍脏数据", () => {
  it("空值退化为基线", () => {
    const rec = normalizeRecord(undefined, NOW, params);
    expect(rec.baseline).toBe(true);
    expect(rec.stability).toBe(3);
  });

  it("缺字段补默认，非法字段被替换", () => {
    const rec = normalizeRecord({ added: 100, times: 2, stability: -5, history: "x" as never }, NOW, params);
    expect(rec.added).toBe(100);
    expect(rec.times).toBe(2);
    expect(rec.stability).toBe(1);
    expect(rec.history).toEqual([]);
    expect(rec.baseline).toBe(false);
  });

  it("保留合法 history", () => {
    const rec = normalizeRecord(
      { added: 1, last: 2, due: 3, times: 1, stability: 4, history: [{ t: 9, q: 4, s: 8 }] },
      NOW,
      params,
    );
    expect(rec.history).toEqual([{ t: 9, q: 4, s: 8 }]);
  });
});

describe("复习日历与连续天数", () => {
  const localNoon = (dayIndex: number): number => dayIndex * DAY_MS - TZ * 60_000 + 12 * 3_600_000;

  it("localDayIndex 按给定时区切天", () => {
    expect(localDayIndex(NOW, TZ)).toBe(Math.floor((NOW + TZ * 60_000) / DAY_MS));
  });

  it("dayLabel 是 localDayIndex 的逆运算（东八区，不能整体偏一天）", () => {
    const tz = 480;
    // 本地 2026-10-11 11:33
    expect(dayLabel(localDayIndex(Date.UTC(2026, 9, 11, 3, 33), tz), tz)).toBe("2026-10-11");
    // 本地当天第一分钟：本地 2026-10-11 00:00
    expect(dayLabel(localDayIndex(Date.UTC(2026, 9, 10, 16, 0), tz), tz)).toBe("2026-10-11");
    // 本地当天最后一分钟：本地 2026-10-11 23:59
    expect(dayLabel(localDayIndex(Date.UTC(2026, 9, 11, 15, 59), tz), tz)).toBe("2026-10-11");
    // 本地前一天 23:59 必须还是前一天
    expect(dayLabel(localDayIndex(Date.UTC(2026, 9, 10, 15, 59), tz), tz)).toBe("2026-10-10");
  });

  it("dayLabel 在西五区同样不偏天", () => {
    const tz = -300;
    // 本地 2026-10-10 23:30（= UTC 2026-10-11T04:30Z）
    expect(dayLabel(localDayIndex(Date.UTC(2026, 9, 11, 4, 30), tz), tz)).toBe("2026-10-10");
    // 本地 2026-10-11 00:30（= UTC 2026-10-11T05:30Z）
    expect(dayLabel(localDayIndex(Date.UTC(2026, 9, 11, 5, 30), tz), tz)).toBe("2026-10-11");
  });

  it("连续三天打卡 = 3", () => {
    const today = localDayIndex(NOW, TZ);
    const recs = [0, 1, 2].map((back) => ({
      ...recordWith(5, 3, 0),
      history: [{ t: localNoon(today - back), q: 4, s: 5 }],
    }));
    expect(reviewStreak(recs, NOW, TZ)).toBe(3);
  });

  it("今天没打但昨天打了，仍算连上", () => {
    const today = localDayIndex(NOW, TZ);
    const recs = [1, 2].map((back) => ({
      ...recordWith(5, 3, 0),
      history: [{ t: localNoon(today - back), q: 4, s: 5 }],
    }));
    expect(reviewStreak(recs, NOW, TZ)).toBe(2);
  });

  it("断了就归零，且空数据为 0", () => {
    const today = localDayIndex(NOW, TZ);
    const rec = { ...recordWith(5, 3, 0), history: [{ t: localNoon(today - 3), q: 4, s: 5 }] };
    expect(reviewStreak([rec], NOW, TZ)).toBe(0);
    expect(reviewStreak([], NOW, TZ)).toBe(0);
  });
});

describe("汇总与队列", () => {
  const paths = ["A/1.md", "A/2.md", "B/3.md", "B/4.md"];
  const records = new Map<string, ReviewRecord>([
    ["A/1.md", recordWith(10, 5, 0)], // P=1.00 熟练
    ["A/2.md", recordWith(10, 5, 10 * Math.log(1 / 0.7))], // P≈0.70 熟悉
    ["B/3.md", { ...recordWith(10, 5, 10 * Math.log(1 / 0.2)), baseline: true, times: 0 }], // 基线
  ]);

  it("buildStats 逐篇算分并标注到期", () => {
    const stats = buildStats(paths, records, NOW, params);
    expect(stats).toHaveLength(4);
    expect(stats[0].bucket).toBe("mastered");
    expect(stats[0].due).toBe(false);
    expect(stats[1].bucket).toBe("familiar");
    expect(stats[2].baseline).toBe(true);
    expect(stats[2].bucket).toBe("baseline");
    expect(stats[2].due).toBe(true);
    expect(stats[3].bucket).toBe("unreviewed");
    expect(stats[3].score).toBeNull();
    expect(stats[3].due).toBe(true);
  });

  it("summarize 给出各档篇数与两种平均值", () => {
    const summary = summarize(buildStats(paths, records, NOW, params));
    expect(summary.total).toBe(4);
    expect(summary.counts.mastered).toBe(1);
    expect(summary.counts.familiar).toBe(1);
    expect(summary.counts.fuzzy).toBe(0);
    expect(summary.counts.baseline).toBe(1);
    expect(summary.counts.unreviewed).toBe(1);
    expect(summary.baselineCount).toBe(1);
    expect(summary.dueCount).toBe(3);
    // A/1 → 1.0；A/2 → 0.7；B/3 是基线（times=0，f=0.5）→ 0.2×0.5=0.1；B/4 无记录 → 0
    expect(summary.averageAll).toBeCloseTo((1 + 0.7 + 0.1 + 0) / 4, 6);
    // 基线不算复习，所以只取 A/1 与 A/2
    expect(summary.averageReviewed).toBeCloseTo((1 + 0.7) / 2, 6);
  });

  it("dueQueue 按到期时间升序、可限量", () => {
    const base = createBaseline(NOW - 9 * DAY_MS, params);
    const later = applyGrade(createBaseline(NOW - 5 * DAY_MS, params), 3, NOW - 5 * DAY_MS, params);
    const stats = buildStats(["base.md", "later.md"], new Map([["base.md", base], ["later.md", later]]), NOW, params);
    const queue = dueQueue(stats);
    expect(queue.map((s) => s.path)).toContain("base.md");
    expect(dueQueue(stats, 1)).toHaveLength(1);
  });

  it("空集合不炸", () => {
    const summary = summarize([]);
    expect(summary.total).toBe(0);
    expect(summary.averageAll).toBe(0);
    expect(summary.averageReviewed).toBeNull();
    expect(dueQueue([])).toEqual([]);
  });
});
