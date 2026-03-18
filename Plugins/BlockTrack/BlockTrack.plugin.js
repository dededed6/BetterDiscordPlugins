/**
 * @name BlockTrack
 * @author dededed6
 * @version 1.2.0
 * @description Block Discord tracking and analytics events
 * @website https://github.com/dededed6/BetterDiscordPlugins
 * @source https://raw.githubusercontent.com/dededed6/BetterDiscordPlugins/master/Plugins/BlockTrack/BlockTrack.plugin.js
 */

const { Data, Patcher, Webpack, UI } = BdApi;

module.exports = class BlockTrack {
    constructor() {
        this.settings = {
            trackers: true,
            reports: true,
            status: true,
            process: true,
        };
        this.patch_cfg = {};
    }

    loadModules() {
        const Analytics = Webpack.getByKeys("AnalyticEventConfigs")?.default;
        const SentryModule = Webpack.getByKeys("captureException");
        const ExperimentsModule = Webpack.getByKeys("trackExposure");
        const TypingModule = Webpack.getByKeys("startTyping");
        const ReadReceiptsModule = Webpack.getByKeys("ack");
        const ActivityModule = Webpack.getByKeys("getActivities");
        const NativeModule = Webpack.getByKeys("getDiscordUtils");
        const DiscordUtils = NativeModule?.getDiscordUtils?.();

        this.patch_cfg = {
            trackers: [
                [Analytics, "track"],
                [Analytics, "trackMaker"],
                [Analytics, "analyticsTrackingStoreMaker"],
                [Analytics, "getSuperProperties", () => ({})],
                [Analytics, "getSuperPropertiesBase64", () => ""],
                [Analytics, "extendSuperProperties"],
                [Analytics, "expandEventProperties"],
                [Analytics, "encodeProperties"],
                [ExperimentsModule, "trackExposure"],
            ],
            reports: [
                [SentryModule, "captureException"],
                [SentryModule, "captureMessage"],
                [SentryModule, "captureCrash"],
                [SentryModule, "addBreadcrumb"],
                [NativeModule, "submitLiveCrashReport"],
            ],
            status: [
                [TypingModule, "startTyping"],
                [ReadReceiptsModule, "ack"],
                [ActivityModule, "getActivities", () => []],
                [ActivityModule, "getPrimaryActivity", () => null],
            ],
            process: [
                [NativeModule, "setObservedGamesCallback"],
                [NativeModule, "setCandidateGamesCallback"],
                [NativeModule, "setGameDetectionCallback"],
                [NativeModule, "setGameDetectionErrorCallback"],
                [NativeModule, "clearCandidateGamesCallback"],
                [NativeModule, "appViewed"],
                [NativeModule, "appLoaded"],
                [NativeModule, "appFirstRenderAfterReadyPayload"],
                [NativeModule, "ensureModule", (_, [moduleName], original) => { return moduleName === "discord_rpc" ? {} : original(moduleName); }],
                [DiscordUtils, "setObservedGamesCallback2"],
                [DiscordUtils, "startGameEvents"],
                [DiscordUtils, "notifyGameLaunched"],
                [DiscordUtils, "setObserverDebugCallback"],
            ],
        };
    }

    patch() {
        Patcher.unpatchAll("BlockTrack");
        Object.entries(this.settings).forEach(([setting]) => {
            if (this.settings[setting]) {
                this.patch_cfg[setting].forEach(([target, methodName, returns = ()=>{}]) => {
                    Patcher.instead("BlockTrack", target, methodName, returns);
                });
            }
        });
    }

    getSettingsPanel() {
        const container = document.createElement("div");
        container.style.cssText = "color: var(--text-normal); padding: 10px;";

        const initial = { ...this.settings };

        const observer = new MutationObserver(() => {
            if (!document.contains(container)) {
                observer.disconnect();
                if (this.settings.process !== initial.process) location.reload();
                else if (JSON.stringify(this.settings) !== JSON.stringify(initial)) this.patch();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });

        const items = [
            { key: "trackers", label: "Block Trackers" },
            { key: "reports", label: "Block Crash Reporting" },
            { key: "status", label: "Block Activity, Keyboard Status" },
            { key: "process", label: "Block Process Detection (requires restart)" },
        ];

        items.forEach(e => {
            const row = document.createElement("label");
            row.style.cssText = "display: flex; align-items: center; margin: 10px 0; cursor: pointer;";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = this.settings[e.key];
            checkbox.style.cssText = "margin-right: 10px; cursor: pointer;";

            row.addEventListener("click", async (evt) => {
                evt.preventDefault();
                if (e.key === "process" && checkbox.checked === initial.process) {
                    const confirmed = await new Promise(resolve => {
                        UI.showConfirmationModal("Restart Required", "Discord will restart when you close settings.", {
                            confirmText: "OK",
                            cancelText: "Cancel",
                            onConfirm: () => resolve(true),
                            onCancel: () => resolve(false),
                        });
                    });
                    if (!confirmed) return;
                }
                this.settings[e.key] = checkbox.checked = !checkbox.checked;
                Data.save("BlockTrack", "settings", this.settings);
            });

            row.appendChild(checkbox);
            row.appendChild(document.createTextNode(e.label));
            container.appendChild(row);
        });

        return container;
    }
    
    start() {
        this.loadModules();
        this.settings = Data.load("BlockTrack", "settings") || this.settings;

        this.patch();
    }

    stop() { Patcher.unpatchAll("BlockTrack"); }
}