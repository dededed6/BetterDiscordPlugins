/**
 * @name CleanURLs
 * @author dededed1024
 * @version 1.4.4
 * @description Remove tracking parameters from URLs
 * @website https://github.com/dededed6/BetterDiscordPlugins
 * @source https://raw.githubusercontent.com/dededed6/BetterDiscordPlugins/master/CleanUrls/CleanUrls.plugin.js
 */

const { Data, Patcher, Webpack, Net } = BdApi;

const URL_PROTOCOL_PATTERN = /https?:\/\//;
const URL_EXTRACTION_PATTERN = /https?:\/\/[^\s]+/g;
const RULES_URL = "https://rules2.clearurls.xyz/data.minify.json";

module.exports = class CleanURLs {
    constructor() {
        this.compiledRules = null;
        this.messageObserver = null;
        this._jumpToPresent = null; // 재로드 하는 방법 찾았음
        this._channelStore = null; // 스크롤 위치를 기억할 수 없다는 단점이 아직 있긴함
        // 투두? - 스크롤 위치 기억 기능 추가
    }

    // Rules
    async updateRules() {
        try {
            // 서버에서 수정됐을때만 규칙 새로 다운로드
            const lastModified = Data.load("CleanURLs", "localLastModified");
            const headers = lastModified ? { "If-Modified-Since": lastModified } : {};
            const response = await Net.fetch(RULES_URL, { headers });

            if (response.ok) {
                const freshRules = await response.json();
                Data.save("CleanURLs", "rules", freshRules);
                Data.save("CleanURLs", "localLastModified", response.headers.get("last-modified"));
                this.compiledRules = this.preprocessRules(freshRules);
            }
        } catch (e) {
            console.error("[CleanURLs] Failed to update rules:", e);
        }
    }

    preprocessRules(rules) {
        if (!rules?.providers) return [];
        return Object.values(rules.providers).map(provider => ({
            urlPattern: new RegExp(provider.urlPattern, "i"),
            exceptions: (provider.exceptions || []).map(e => new RegExp(e, "i")),
            combinedRawRegex: provider.rawRules?.length
                ? new RegExp(provider.rawRules.join("|"), "gi")
                : null,
            combinedRulesRegex: provider.rules?.length
                ? new RegExp(provider.rules.map(r => `^${r}$`).join("|"), "i")
                : null,
            completeProvider: provider.completeProvider,
        })); // 정규식째로 저장할 수 있으면 좋을듯
    }

    // Patch Sending
    patchMessageSending() {
        const m = Webpack.getByKeys("sendMessage");
        if (m) Patcher.before("CleanURLs", m, "sendMessage", (_, [, msg]) => {
            if (msg?.content) msg.content = msg.content.replace(URL_EXTRACTION_PATTERN, url => this.cleanUrl(url));
        });
    }

    // Patch Incoming
    patchIncomingMessages() {
        document.querySelectorAll('[role="article"]').forEach(c => this.cleanMessageContent(c));

        const callback = mutations => {
            const seen = new Set();
            for (const { addedNodes } of mutations) { // m.target.closest('[class*="scrollerContent"]')로 탐색 가지치기 하려 했는데 이러면 이미 캐시된 메시지가 패치되지않음 -> 원래 방식으로 돌아왔음
                for (const node of addedNodes) {
                    if (node.nodeType !== Node.ELEMENT_NODE) continue;
                    const articles = node.matches('[role="article"]') ? [node] : node.querySelectorAll('[role="article"]');
                    for (const article of articles) {
                        if (!seen.has(article)) {
                            seen.add(article);
                            this.cleanMessageContent(article);
                        }
                    }
                }
            }
        };

        this.messageObserver = new MutationObserver(callback);
        this.messageObserver.observe(document.body, { childList: true, subtree: true });
    }

    cleanMessageContent(container) {
        const content = container.querySelector('[id^="message-content-"]');
        if (!content || !URL_PROTOCOL_PATTERN.test(content.textContent)) return;

        const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, null); // walker말고 본문을 직접 지정하면 더 나을듯
        let node;
        while (node = walker.nextNode()) {
            const original = node.textContent;
            const cleaned = original.replace(URL_EXTRACTION_PATTERN, url => this.cleanUrl(url));
            if (cleaned !== original) node.textContent = cleaned;
        }

        for (const link of content.querySelectorAll("a[href]")) {
            const href = link.getAttribute("href");
            if (URL_PROTOCOL_PATTERN.test(href)) {
                const cleaned = this.cleanUrl(href);
                if (cleaned !== href) link.setAttribute("href", cleaned); // 이렇게해도 임베드까지 클린 가능
            }
        }
    }

    // Util
    cleanUrl(urlString) {
        if (!this.compiledRules?.length) return urlString;

        let cleanedUrl = urlString;

        for (const { urlPattern, exceptions, combinedRawRegex, combinedRulesRegex } of this.compiledRules) {
            if (!urlPattern.test(urlString) || exceptions.some(r => r.test(urlString))) continue;

            if (combinedRawRegex) cleanedUrl = cleanedUrl.replace(combinedRawRegex, "");

            if (combinedRulesRegex) {
                try {
                    const url = new URL(cleanedUrl);
                    for (const key of [...url.searchParams.keys()]) {
                        if (combinedRulesRegex.test(key)) url.searchParams.delete(key);
                    }
                    cleanedUrl = url.toString();
                } catch (e) { }
            }
        }

        return cleanedUrl;
    }

    start() {
        this.updateRules();
        this.compiledRules = this.preprocessRules(Data.load("CleanURLs", "rules"));
        this._jumpToPresent = Webpack.getModule((_, e) => e.id === 843472)?.A?.jumpToPresent;
        this._channelStore = Webpack.getByKeys("getLastSelectedChannelId", "getChannelId");

        this.patchMessageSending();
        this.patchIncomingMessages();
    }

    stop() {
        Patcher.unpatchAll("CleanURLs");

        if (this.messageObserver) {
            this.messageObserver.disconnect();
            this.messageObserver = null;
        }

        // Discord 내부 캐시(원본 URL)에서 재렌더링
        const channelId = this._channelStore?.getChannelId?.();
        if (channelId) this._jumpToPresent?.(channelId);
    }

};
