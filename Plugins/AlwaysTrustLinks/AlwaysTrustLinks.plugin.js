/**
 * @name AlwaysTrustLinks
 * @author dededed1024
 * @version 1.0.1
 * @description Skip link warning dialog
 * @website https://github.com/dededed1024/BetterDiscordPlugins
 * @source https://raw.githubusercontent.com/dededed1024/BetterDiscordPlugins/master/AlwaysTrustLinks/AlwaysTrustLinks.plugin.js
 */

const { Patcher, Webpack } = BdApi;

module.exports = class AlwaysTrustLinks {

    start() {
        const transitionModule = Webpack.getByKeys("transitionTo");

        if (transitionModule)
            Patcher.before("AlwaysTrustLinks", transitionModule, "transitionTo", (_, args) => {
                const [url] = args;
                if (typeof url === "string" && url.startsWith("http")) {
                    window.open(url, "_blank");
                    return false;
                }
            });
    }

    stop() {
        Patcher.unpatchAll("AlwaysTrustLinks");
    }
};
