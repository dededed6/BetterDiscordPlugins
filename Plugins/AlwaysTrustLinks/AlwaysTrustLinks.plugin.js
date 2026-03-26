/**
 * @name AlwaysTrustLinks
 * @author dededed1024
 * @version 1.0.0
 * @description Skip link warning dialog
 * @website https://github.com/dededed1024/BetterDiscordPlugins
 * @source https://raw.githubusercontent.com/dededed1024/BetterDiscordPlugins/master/AlwaysTrustLinks/AlwaysTrustLinks.plugin.js
 */

module.exports = class AlwaysTrustLinks {
    
    linkClickHandler = (event) => {
        const link = event.target.closest("a[href^='http']");
        if (!link) return;

        event.stopPropagation();
        window.open(link.href, "_blank");
    };

    start() { document.body.addEventListener("click", this.linkClickHandler, true); }
    stop() { document.body.removeEventListener("click", this.linkClickHandler, true); }
};
