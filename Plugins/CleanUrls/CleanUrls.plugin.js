/**
 * @name CleanURLs
 * @author dededed6
 * @version 1.4.1
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
        this.originals = [];
    }

    // Rules
    async updateRules() {
        try {
            const lastModified = Data.load("CleanURLs", "localLastModified");
            const headers = lastModified ? { "If-Modified-Since": lastModified } : {};
            const response = await Net.fetch(RULES_URL, { headers });

            if (response.ok) {
                const freshRules = await response.json();
                Data.save("CleanURLs", "rules", freshRules);
                Data.save("CleanURLs", "localLastModified", response.headers.get("last-modified"));
                this.compiledRules = this.preprocessRules(freshRules);
            }
        } catch (e) {}
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
        }));
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

        const newMessageCallback = mutations => {
            mutations
                .flatMap(m => m.target.closest?.('[class*="scrollerContent"]') ? Array.from(m.addedNodes) : [])
                .flatMap(n => {
                    const a = n.nodeType === Node.ELEMENT_NODE && n.querySelector('[role="article"]');
                    return a ? [a] : [];
                }).forEach(c => this.cleanMessageContent(c));
        };
        this.messageObserver = new MutationObserver(newMessageCallback);
        this.messageObserver.observe(document.body, { childList: true, subtree: true });
    }

    cleanMessageContent(container) {
        const content = container.querySelector('[id^="message-content-"]');
        if (!content || !URL_PROTOCOL_PATTERN.test(content.textContent)) return;

        const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, null);
        let node;
        while (node = walker.nextNode()) {
            const original = node.textContent;
            const cleaned = original.replace(URL_EXTRACTION_PATTERN, url => this.cleanUrl(url));
            if (cleaned !== original) {
                this.originals.push({ node, original });
                node.textContent = cleaned;
            }
        }

        for (const link of content.querySelectorAll("a[href]")) {
            const href = link.getAttribute("href");
            if (URL_PROTOCOL_PATTERN.test(href)) {
                const cleaned = this.cleanUrl(href);
                if (cleaned !== href) {
                    this.originals.push({ node: link, attr: "href", original: href });
                    link.setAttribute("href", cleaned);
                }
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
                const url = new URL(cleanedUrl);
                for (const key of [...url.searchParams.keys()]) {
                    if (combinedRulesRegex.test(key)) url.searchParams.delete(key);
                }
                cleanedUrl = url.toString();
            }
        }

        return cleanedUrl;
    }

    start() {
        this.updateRules();
        this.compiledRules = this.preprocessRules(Data.load("CleanURLs", "rules"));

        this.patchMessageSending();
        this.patchIncomingMessages();
    }

    stop() {
        Patcher.unpatchAll("CleanURLs");
        
        if (this.messageObserver) {
            this.messageObserver.disconnect();
            this.messageObserver = null;
        }

        for (const { node, attr, original } of this.originals) {
            if (attr) node.setAttribute(attr, original);
            else node.textContent = original;
        }
        this.originals = [];
    }

};
