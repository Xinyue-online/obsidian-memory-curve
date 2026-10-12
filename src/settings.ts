/** 插件设置：稳定度初值、到期阈值、默认范围、只复习当前文件夹、打分后关窗、语言。 */

import { App, PluginSettingTab, Setting } from "obsidian";
import type MemoryCurvePlugin from "./main";
import { strings, type Lang } from "./i18n";
import { DEFAULT_INITIAL_STABILITY, DEFAULT_RETENTION_THRESHOLD } from "./model";
import { ALL_SCOPE, ROOT_SCOPE, listFolders } from "./scanner";

export interface MemoryCurveSettings {
  /** 稳定度初值 S0（天）。 */
  initialStability: number;
  /** 到期保持率阈值。 */
  retentionThreshold: number;
  /** 面板默认范围：空串 = 全库。 */
  defaultScope: string;
  /** 待复习队列是否只含当前范围。 */
  onlyCurrentFolder: boolean;
  /** 悬浮打分窗：打分后直接关窗（关窗模式下不再显示跳过/下一篇）。 */
  closeAfterGrade: boolean;
  language: Lang;
}

export const DEFAULT_SETTINGS: MemoryCurveSettings = {
  initialStability: DEFAULT_INITIAL_STABILITY,
  retentionThreshold: DEFAULT_RETENTION_THRESHOLD,
  defaultScope: ALL_SCOPE,
  onlyCurrentFolder: false,
  closeAfterGrade: true,
  language: "zh",
};

export class MemoryCurveSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: MemoryCurvePlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    const s = strings(this.plugin.settings.language);
    containerEl.empty();
    containerEl.createEl("h2", { text: s.settingsTitle });

    new Setting(containerEl)
      .setName(s.settingStability)
      .setDesc(s.settingStabilityDesc)
      .addSlider((slider) =>
        slider
          .setLimits(1, 30, 0.5)
          .setValue(this.plugin.settings.initialStability)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.initialStability = value;
            await this.plugin.saveSettings();
            await this.plugin.recalculate();
          }),
      );

    new Setting(containerEl)
      .setName(s.settingThreshold)
      .setDesc(s.settingThresholdDesc)
      .addSlider((slider) =>
        slider
          .setLimits(0.5, 0.95, 0.01)
          .setValue(this.plugin.settings.retentionThreshold)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.retentionThreshold = value;
            await this.plugin.saveSettings();
            await this.plugin.recalculate();
          }),
      );

    new Setting(containerEl)
      .setName(s.settingScope)
      .setDesc(s.settingScopeDesc)
      .addDropdown((dropdown) => {
        dropdown.addOption(ALL_SCOPE, s.scopeAll);
        dropdown.addOption(ROOT_SCOPE, s.scopeRoot);
        for (const folder of listFolders(this.app)) {
          dropdown.addOption(folder, folder);
        }
        dropdown.setValue(this.plugin.settings.defaultScope);
        dropdown.onChange(async (value) => {
          this.plugin.settings.defaultScope = value;
          await this.plugin.saveSettings();
          this.plugin.setScope(value);
        });
      });

    new Setting(containerEl)
      .setName(s.settingOnlyCurrent)
      .setDesc(s.settingOnlyCurrentDesc)
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.onlyCurrentFolder).onChange(async (value) => {
          this.plugin.settings.onlyCurrentFolder = value;
          await this.plugin.saveSettings();
          await this.plugin.refreshViews(true);
        }),
      );

    new Setting(containerEl)
      .setName(s.settingAutoClose)
      .setDesc(s.settingAutoCloseDesc)
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.closeAfterGrade).onChange(async (value) => {
          this.plugin.settings.closeAfterGrade = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName(s.settingLanguage)
      .setDesc(s.settingLanguageDesc)
      .addDropdown((dropdown) =>
        dropdown
          .addOption("zh", "中文")
          .addOption("en", "English")
          .setValue(this.plugin.settings.language)
          .onChange(async (value) => {
            this.plugin.settings.language = value === "en" ? "en" : "zh";
            await this.plugin.saveSettings();
            this.display();
            await this.plugin.refreshViews(true);
          }),
      );

    new Setting(containerEl)
      .setName(s.settingRecalc)
      .setDesc(s.settingRecalcDesc)
      .addButton((button) =>
        button.setButtonText(s.settingRecalcButton).onClick(async () => {
          await this.plugin.recalculate();
        }),
      );
  }
}
