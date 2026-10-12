# 记忆曲线 Memory Curve

一个 Obsidian 桌面端插件：给每篇笔记算「记忆保持率」，把整个库排进一张复习队列。

只认**你手动打的 0–5 分**，不看修改时间、不看打开次数；**不碰笔记正文、不写 frontmatter、不建卡片**，
所有数据只写进插件自己的 `data/reviews.json`。

> `P = R · f`，`R = exp(-t / S)` —— 艾宾浩斯式遗忘曲线，`S`（稳定度）随每次打分放大或缩小。

- 插件 id：`memory-curve` · 版本 `0.1.0` · 最低 Obsidian `1.4.0` · 仅桌面端
- 零运行时依赖：图表是手写 SVG，不引任何图表库
- 中文 / English 双语界面

---

## 目录

- [特性](#特性)
- [安装](#安装)
- [使用](#使用)
- [配置](#配置)
- [算法](#算法)
- [分档口径](#分档口径)
- [数据文件格式](#数据文件格式)
- [项目结构](#项目结构)
- [测试与验收](#测试与验收)
- [已知限制](#已知限制)
- [作者与许可](#作者与许可)

## 特性

- **左栏面板**：范围选择器（全库 / 根目录 / 各文件夹）+ 掌握度仪表盘 + 五张图 + 待复习队列 + 笔记清单。
- **五张图零依赖手写 SVG**：掌握度环形仪表、熟练度分布堆叠条、未来 14 天复习负荷、15 周复习热力图（GitHub 风格）、文件夹对比横条。
- **两种复习方式**：
  - 主区域专用**复习标签页**：`MarkdownRenderer` 只读渲染整篇笔记，底部粘性打分卡，打完自动跳下一篇；关闭标签页不写任何东西。
  - **悬浮打分窗**：在正在读的笔记上按快捷键（默认 `Ctrl/Cmd + Shift + G`）弹出小窗，看完随手打分，默认打完就关窗回到正文。
- **三种打分入口**：鼠标点 0–5、键盘数字键 `0`–`5`、命令面板（`记忆曲线：评价当前笔记` / `开始复习` / `打开侧边栏`）。
- **改名/删除自动跟随**：`vault.on('rename')` 迁移记录（文件夹改名整段前缀重映射），`vault.on('delete')` 清理记录，新建笔记 1.5 秒去抖后自动补基线。
- **双语**、**全部设置可即时生效**，改完 S0/阈值还能一键按新参数重算全库。

## 安装

插件未上架 Obsidian 官方社区列表，手动装。

### 一、普通使用者（三步）

1. 在笔记库的 `.obsidian/plugins/` 下建一个文件夹 `memory-curve`。
2. 把这三个文件放进去：
   - `main.js`（构建产物，仓库不提交，见下节构建）
   - `manifest.json`
   - `styles.css`
3. 打开 Obsidian → 设置 → 第三方插件 → 关闭「受限模式」→ 启用「记忆曲线 Memory Curve」。

> 装完侧边栏（左栏）会出现 `activity` 图标，点它打开面板；也可以用命令面板搜「记忆曲线」。

### 二、从源码构建（推荐，一条命令）

需要 **Node.js 18 或更高**：

```bash
git clone https://github.com/Xinyue-online/obsidian-memory-curve.git
cd obsidian-memory-curve
npm install
npm run build          # 产出 main.js
```

然后把 `main.js`、`manifest.json`、`styles.css` 三个文件拷进 `<你的库>/.obsidian/plugins/memory-curve/`。

如果想让脚本**直接部署进库里**，用下面任一方式给出库路径（脚本里没有任何个人路径）：

```bash
node scripts/deploy.mjs --vault="D:\path\to\your\vault"
# 或
MEMORY_CURVE_VAULT="D:\path\to\your\vault" npm run deploy
# 构建 + 部署一步到位
MEMORY_CURVE_VAULT="D:\path\to\your\vault" npm run ship
```

`npm run dev` 是 watch 模式（带 inline sourcemap），改代码即时重打包，重打包后在 Obsidian 里重新加载插件即可。

## 使用

### 侧边栏面板

自上而下：

1. **范围选择器**：全库 / 根目录 / 各文件夹（文件夹列表从库里现有的 md 路径中派生）
2. **刷新按钮**（同时有一个「评价当前笔记」的入口在命令面板里，不占工具条）
3. **掌握度仪表盘**：环形图 + 笔记数 / 待复习数 / 基线数 / 连续天数；下方两行是「仅已复习」掌握度与「基线」篇数
4. **五张图**
5. **待复习队列**：按到期时间升序，取最该复习的 10 篇，右侧有「开始复习」
6. **笔记清单**：标题 / 相对路径 / 熟练度条 / 上次复习 / 下次到期 / 复习次数

### 复习页

点队列里的笔记、点清单里的笔记，或命令「记忆曲线：开始复习」→ 主区域开一个 `memory-curve-review` 标签页：

- `MarkdownRenderer` **只读渲染**，没有编辑器、没有 `contenteditable`
- 底部粘性打分卡：0 完全忘了 … 5 脱口而出 + 跳过 + 下一篇
- 键盘 `0`–`5` 直接打分
- 打分后写记录、重算稳定度与到期时间、自动跳下一篇
- **关闭标签页不写任何东西**

### 悬浮打分窗

在正文上按 `Ctrl/Cmd + Shift + G`（命令「记忆曲线：评价当前笔记」）打开：

- 顶部是当前笔记的路径与基线徽章
- 六个数据块：熟练度 / 稳定度 / 成功 / 失败 / 复习次数 / 下次到期
- 下面是同一套 0–5 打分卡，**2 行 × 3 列大按钮**，数字键 `0`–`5` 同样直接打分
- **默认打完分就关窗**（窗口里不放「跳过 / 下一篇」——这篇已经复习完了，直接回到正文接着读）
- 想改成「留在窗口里、原地换下一篇」连刷：设置 →「悬浮打分窗：打分后自动关闭」关掉，那两个按钮会重新出现
- 它只写 `data/reviews.json`，笔记正文一个字都不动（实测打分前后笔记 SHA256 与 mtime 完全一致）

打分卡用同一套色阶：0 红 → 5 青绿，鼠标划过会上浮。

## 配置

### 设置页（设置 → 记忆曲线）

| 设置 | 默认 | 说明 |
| --- | --- | --- |
| 初始稳定度 S0 | 3 天 | 冷启动基线用的起始稳定度 |
| 到期阈值 | 0.75 | 保持率 `R` 低于它就算待复习 |
| 默认范围 | 全库 | 面板打开时选中的范围 |
| 只复习当前文件夹 | 关 | 打开后「开始复习」只在面板当前范围里取队列 |
| 悬浮打分窗：打分后自动关闭 | 开 | 开：打完分立即关窗、窗口里不显示「跳过 / 下一篇」；关：留在窗口原地换下一篇 |
| 语言 | 中文 | 中文 / English |
| 按新参数重算 | — | 用当前 S0/阈值把全库记录重算一遍（不动 `times` / `lapses`） |

设置本身存在 `<你的库>/.obsidian/plugins/memory-curve/data.json`（没改过设置时不会生成这个文件；删掉即恢复全部默认值）。

### 快捷键

「设置 → 快捷键」搜「记忆曲线」：

| 命令 | 默认 |
| --- | --- |
| 记忆曲线：评价当前笔记 | `Ctrl/Cmd + Shift + G` |
| 记忆曲线：打开侧边栏 | 未绑 |
| 记忆曲线：开始复习 | 未绑 |

三个都可以自己改键。

### 环境相关的都在外部给

- **库路径**：`--vault=<路径>` 参数或 `MEMORY_CURVE_VAULT` 环境变量（构建脚本里不写死任何库路径）
- **数据目录**：`<库>/.obsidian/plugins/memory-curve/data/`，插件自己按 `manifest.dir` 推断
- **语言 / S0 / 阈值 / 范围 / 打分后是否关窗**：设置页可改

### 目前写死在代码里的常量

想改就得改源码（都集中在 `src/` 一两处）：

| 常量 | 值 | 位置 |
| --- | --- | --- |
| 队列展示篇数 | 10 | `src/sidebar-view.ts` |
| 历史记录上限 | `MAX_HISTORY = 2000` | `src/model.ts` |
| 面板定时刷新 | 15 分钟 | `src/main.ts` |
| 新建笔记去抖 | 1500 ms | `src/main.ts` |
| 分档阈值 | `0.85 / 0.6 / 0.3` | `src/model.ts` |
| 失败惩罚 | `FAIL_FACTOR = 0.35` | `src/model.ts` |
| 稳定度下限 | `MIN_STABILITY = 1` | `src/model.ts` |
| 答对倍率 | `PASS_MULTIPLIER = {3:1.5, 4:2.2, 5:3.0}` | `src/model.ts` |
| 熟练度系数 | `f = min(1, 0.5 + 0.1n)` | `src/model.ts` |
| 图表窗口 | 未来 14 天 / 15 周热力图 / 文件夹对比取前 8 | `src/sidebar-view.ts` |
| 扫描口径 | `vault.getMarkdownFiles()` 全量，无排除规则、无白名单 | `src/scanner.ts` |

面板当前选中的范围（`currentScope`）是运行期状态，不落盘，重启回到「默认范围」。

## 算法

全部在 `src/model.ts`，纯函数、可单测：

| 量 | 公式 |
| --- | --- |
| 保持率 | `R(t) = exp(-t / S)`，t = 距上次复习的天数 |
| 熟练度 | `P = R · f`，`f = min(1, 0.5 + 0.1n)`，`n = times - lapses`（成功复习次数） |
| 答对（q ≥ 3） | `S ← S · m(q)`，`m(3)=1.5`、`m(4)=2.2`、`m(5)=3.0` |
| 答错（q < 3） | `S ← max(1, S · 0.35)`，`lapses += 1` |
| 到期时间 | `due = last + S · ln(1 / 阈值)`，阈值默认 0.75；`R < 阈值` 即待复习 |
| 冷启动基线 | `stability = S0`（默认 3 天）、`baseline = true`、`times = 0`，**不算复习**，不计入「复习次数」「连续天数」 |
| 首次打分 | 先把 `S` 拉回 `S0` 再乘倍率（基线的 `S` 不是真实记忆强度） |

「复习次数」与「连续天数」只统计手动打分；基线只负责让第一天就有图看。

## 分档口径

只看 `P`：

| 档 | 条件 |
| --- | --- |
| 熟练 | `P ≥ 85%` |
| 熟悉 | `60% ≤ P < 85%` |
| 模糊 | `30% ≤ P < 60%` |
| 遗忘中 | `P < 30%` |
| **基线** | 有记录但从未打过分（单列一档，灰显，**不进上面四档**） |
| 未复习 | 完全没有记录 |

基线不走四档是因为：基线的 `P` 同样按 `R = exp(-(now - added)/S0)` 衰减，放着不动会从 50% 一路掉到「遗忘中」，
全库笔记会集体变红，观感与语义都不对。所以**界面上一律把基线显示成 `—`**（环形仪表、熟练度分布、文件夹对比、笔记清单都是），
打过分之后立刻按 `P` 落回四档。掌握度仪表只统计真正复习过的笔记，一篇都没复习时环心显示 `—`。

## 数据文件格式

`<你的库>/.obsidian/plugins/memory-curve/data/reviews.json`：

```json
{
  "version": 1,
  "notes": {
    "文件夹/笔记.md": {
      "added": 1700000000000,
      "last": 1700000000000,
      "due": 1700000000000,
      "times": 0,
      "lapses": 0,
      "stability": 3,
      "quality": -1,
      "baseline": true,
      "history": [{ "t": 1700000000000, "q": 5, "s": 9 }]
    }
  }
}
```

| 字段 | 含义 |
| --- | --- |
| `added` | 首次入库时间（基线创建时间） |
| `last` | 最近一次手动打分时间 |
| `due` | 下次到期时间 |
| `times` | 手动打分次数 |
| `lapses` | `q < 3` 的次数 |
| `stability` | 稳定度 `S`（天） |
| `quality` | 最近一次分数，`-1` = 从未打分（基线） |
| `baseline` | `true` = 冷启动基线，不算复习 |
| `history` | 打分流水（时间 / 分数 / 当次稳定度），最多 2000 条 |

- 键是 **vault 相对路径、正斜杠**；扫不到的键会被清理。
- 写盘：先写 `reviews.json.tmp` 再 `rename` 原子替换；**Windows 上 `DataAdapter.rename` 拒绝覆盖已存在文件**，
  所以 rename 失败会退化为直接写正式文件并删掉临时文件（实测踩到的坑）。
- 想手工改这个文件：**先退出 Obsidian 或禁用插件**，否则运行期内存里的数据会在下次打分时写回覆盖。

## 项目结构

```
obsidian-memory-curve/
├── manifest.json             插件清单（id / 版本 / 最低版本 / 是否仅桌面端）
├── package.json              构建与测试脚本
├── tsconfig.json             TS 配置（strict、noEmit）
├── esbuild.config.mjs        打包：src/main.ts → main.js（cjs / es2018 / external obsidian）
├── styles.css                全部样式（面板、图表、打分卡、悬浮窗）
├── scripts/deploy.mjs        把三个产物拷进 <库>/.obsidian/plugins/memory-curve/
├── src/
│   ├── main.ts               插件入口：命令、ribbon、事件、定时刷新、范围与队列
│   ├── model.ts              纯算法：R(t)、P、S 更新、到期、分档、连续天数、统计
│   ├── store.ts              reviews.json 读写、改名/删除迁移、基线补齐
│   ├── scanner.ts            库内 md 扫描、文件夹清单、范围过滤
│   ├── sidebar-view.ts       左栏面板（ItemView）
│   ├── review-view.ts        主区域复习标签页（ItemView）
│   ├── grade-panel.ts        共用打分卡（复习页页脚 + 悬浮窗）
│   ├── grade-modal.ts        悬浮打分窗（Modal）
│   ├── charts.ts             五张图的 SVG 生成（无第三方库）
│   └── i18n.ts               中英文字符串
└── tests/model.test.ts       35 个单测（算法、分档、时区、统计）
```

## 测试与验收

```bash
npm run typecheck   # tsc --noEmit，零错误
npm test            # vitest run → Tests 35 passed (35)
npm run build       # esbuild 打包
```

在一座含 **88 篇笔记**的真实库（Obsidian 1.13.7 / Windows）上做过端到端验收，全部通过：

| # | 验收项 | 结果 |
| --- | --- | --- |
| 1 | 侧边栏出现图标、可点开面板 | ✅ ribbon `activity` 常驻，左栏 `[memory-curve-sidebar] 记忆曲线` |
| 2 | 面板篇数与库内 md 数一致 | ✅ `app.vault.getMarkdownFiles().length = 88`，面板「88 笔记」，88 条记录 |
| 3 | 手算熟练度与插件一致 | ✅ 打 5 分后 `P = 0.5999871694493571`，手算 `R·f = 1 × 0.6 = 0.6`；`due - last = 2.5891386520668314` 天 vs `9 × ln(1/0.75) = 2.5891386520660276` 天（误差 1e-12） |
| 4 | 点笔记开复习页、只读不可编辑 | ✅ `hasEditor: false`、`contenteditable` 计数 0、Markdown 渲染成功 |
| 5 | 打分后数据更新、笔记内容与 mtime 不变 | ✅ 磁盘 `times=1 S=9 q=5 hist=1`；笔记 SHA256 与 mtime 前后完全一致 |
| 6 | 重启 Obsidian 数据还在 | ✅ 退出进程再启动 → 88 条记录、分数/稳定度/历史原样读回 |
| 7 | 改名记录跟随、删除记录被清 | ✅ 改名后旧键消失、新键保留 `times/S/history/quality`；删除后内存与磁盘同时清零 |
| 8 | `npm test` 全绿、`tsc --noEmit` 零错误 | ✅ `Tests 35 passed (35)`；typecheck 零输出 |

失败路径同样实测：`q=1` → `S = 9 × 0.35 = 3.15`、`lapses=1`、`due - last = 0.9061985282219781` 天（期望 `0.9061985282231096`）。

### 开发中修掉的真 bug

1. **日历脚注整体偏一天**：`new Date(dayIndex * DAY_MS - offset * 60_000)` 对「已经是当地 00:00 的 UTC 瞬间」的日序号又减了一次时区偏移，东八区下脚注比实际早一天。改为 `new Date(dayIndex * DAY_MS).toISOString().slice(0, 10)`，并补了东八区/西五区两个用例。
2. **打分后写盘失败（Windows）**：控制台 `reviews.json 写入失败 {}`，内存已更新、磁盘没变。原因：`DataAdapter.rename` 在 Windows 上拒绝覆盖已存在的目标文件，首次保存能成功只是因为文件还不存在。改为「rename 失败 → 直接写正式文件 + 清掉临时文件」，并加 `Notice` 提示。
3. **悬浮窗按钮文字被裁**：Obsidian 给 `button` 设了固定高度，`.mc-grade-tile` 实际只有 32px 高、内容 41px 高且 `overflow: hidden`，数字与文字被切掉。修：显式 `height: auto; min-height: 56px; overflow: visible`，悬浮窗再加专属规则（620px 宽、2×3 布局、每格约 179×72px）。
4. **基线随时间衰减导致全库变「遗忘中」**：改为基线单独一档、界面显示 `—`（见[分档口径](#分档口径)）。

## 已知限制

- **桌面端专用**（`manifest.json` 里 `isDesktopOnly: true`），未做移动端适配。
- 图表是静态 `<svg>`，除热力图的原生 `<title>` 提示外没有交互。
- 复习页一次性渲染整篇笔记，超大笔记（实测 280 KB 左右）首次渲染约 1 秒。
- 已知悉但**不做**：改笔记正文、写 frontmatter、卡片挖空、接入 LLM。
- 没有做「复习计划」式的长期排程：队列只按到期时间排，不做每天限量。

## 作者与许可

作者：**Xinyue-online** · 仓库：<https://github.com/Xinyue-online/obsidian-memory-curve>

本仓库**未附开源许可证**，默认保留所有权利。如果你希望以某种许可证使用/分发，请开 issue 说明。
