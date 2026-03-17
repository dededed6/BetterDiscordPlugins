/**
 * @name BlockTrack
 * @author dededed6
 * @version 1.2.0
 * @description Block Discord tracking and analytics events (Based on Vencord NoTrack)
 * @website https://github.com/dededed6/BetterDiscordPlugins
 * @source https://raw.githubusercontent.com/dededed6/BetterDiscordPlugins/master/Plugins/BlockTrack/BlockTrack.plugin.js
 */

const { Data, Patcher, Webpack } = BdApi;

const Analytics = Webpack.getByKeys("AnalyticEventConfigs");
const SentryModule = Webpack.getByKeys("captureException");
const ExperimentsModule = Webpack.getByKeys("trackExposure");
const TypingModule = Webpack.getByKeys("startTyping");
const ReadReceiptsModule = Webpack.getByKeys("ack");
const ActivityModule = Webpack.getByKeys("getActivities");
const NativeModule = Webpack.getByKeys("getDiscordUtils");
const DiscordUtils = NativeModule?.getDiscordUtils?.();

const method_cfg = {
    science: [
        [Analytics?.default, "track"],
        [Analytics?.default, "trackMaker"],
        [Analytics?.default, "analyticsTrackingStoreMaker"],
        [Analytics?.default, "getSuperProperties", () => ({})],
        [Analytics?.default, "getSuperPropertiesBase64", () => ""],
        [Analytics?.default, "extendSuperProperties"],
        [Analytics?.default, "expandEventProperties"],
        [Analytics?.default, "encodeProperties"],
    ],
    sentry: [
        [SentryModule, "captureException"],
        [SentryModule, "captureMessage"],
        [SentryModule, "captureCrash"],
        [SentryModule, "addBreadcrumb"],
        [NativeModule, "submitLiveCrashReport"],
    ],
    experiments: [
        [ExperimentsModule, "trackExposure"],
    ],
    typing: [
        [TypingModule, "startTyping"],
    ],
    readReceipts: [
        [ReadReceiptsModule, "ack"],
    ],
    activity: [
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
        [NativeModule, "ensureModule", (_, [moduleName], original) => {
            if (moduleName?.includes("discord_rpc")) return;
            return original(moduleName);
        }],
        [DiscordUtils, "setObservedGamesCallback2"],
        [DiscordUtils, "startGameEvents"],
        [DiscordUtils, "notifyGameLaunched"],
        [DiscordUtils, "setObserverDebugCallback"],
    ],
}

module.exports = class BlockTrack {
    constructor() {
        this.settings = {
            science: true,
            sentry: true,
            experiments: true,
            typing: false,
            readReceipts: false,
            activity: false,
            process: true,
        };
    }

    patch(methods) {
        methods.forEach(([target, methodName, returns = () => {}]) => {
            if (!target || !target[methodName]) {
                console.warn(`[BlockTrack] Failed to find ${methodName}`);
                return;
            }
            Patcher.instead("BlockTrack", target, methodName, returns);
        });
    }

    start() {
        this.settings = Data.load("BlockTrack", "settings") || this.settings;

        Object.entries(this.settings).forEach(([setting, enabled]) => {
            if (enabled && method_cfg[setting]) {
                this.patch(method_cfg[setting]);
            }
        });
    }

    stop() {
        Patcher.unpatchAll("BlockTrack");
    }

    getSettingsPanel() {
        const container = document.createElement("div");
        container.style.cssText = "color: var(--text-normal); padding: 10px;";

        const items = [
            { key: "science", label: "Block Analytics & Metrics" },
            { key: "sentry", label: "Block Crash Reporting" },
            { key: "experiments", label: "Block A/B Testing" },
            { key: "typing", label: "Block Typing Indicator" },
            { key: "readReceipts", label: "Block Read Receipts" },
            { key: "activity", label: "Block Activity Status" },
            { key: "process", label: "Block Game Detection" }
        ];

        items.forEach(e => {
            const row = document.createElement("label");
            row.style.cssText = "display: flex; align-items: center; margin: 10px 0; cursor: pointer;";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = this.settings[e.key];
            checkbox.style.cssText = "margin-right: 10px; cursor: pointer;";

            checkbox.addEventListener("change", () => {
                this.settings[e.key] = checkbox.checked;
                Data.save("BlockTrack", "settings", this.settings);
            });

            row.appendChild(checkbox);
            row.appendChild(document.createTextNode(e.label));
            container.appendChild(row);
        });

        return container;
    }
}