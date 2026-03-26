/**
 * @name MuteServer
 * @author dededed1024
 * @version 1.0.0
 * @description Locally hide notifications and message indicators from servers
 * @website https://github.com/dededed1024/BetterDiscordPlugins
 * @source https://raw.githubusercontent.com/dededed1024/BetterDiscordPlugins/master/Plugins/MuteServer/MuteServer.plugin.js
 */

const { Data, Patcher, Webpack, ContextMenu } = BdApi;

module.exports = class MuteServer {
    start() {
        this.blocked = new Set(Data.load("MuteServer", "blocked") ?? []);

        // 안읽음 표시 패치
        const ChannelStore = Webpack.getStore("ChannelStore");
        const ReadState = Webpack.getByKeys("hasUnread");

        if (ReadState?.hasUnread) {
            Patcher.instead("MuteServer", ReadState, "hasUnread", (_, [channelId], orig) => {
                const guildId = ChannelStore.getChannel(channelId)?.guild_id;
                return guildId && this.blocked.has(guildId) ? false : orig(channelId);
            });
        }

        // 알림 패치
        const NotifModule = Webpack.getByKeys("showNotification");

        if (NotifModule) {
            Patcher.instead("MuteServer", NotifModule, "showNotification", (_, args, orig) => {
                const guildId = args[3]?.guild_id;
                return guildId && this.blocked.has(guildId) ? Promise.resolve() : orig(...args);
            });
        }

        this.menuPatch = ContextMenu.patch("guild-context", (tree, props) => {
            const guildId = props.guild?.id;
            if (!guildId) return;

            const isBlocked = this.blocked.has(guildId);
            tree.props.children.push(
                ContextMenu.buildItem({ type: "separator" }),
                ContextMenu.buildItem({
                    type: "toggle",
                    label: "Mute Server",
                    checked: isBlocked,
                    action: () => {
                        this.blocked[isBlocked ? "delete" : "add"](guildId);
                        Data.save("MuteServer", "blocked", [...this.blocked]);
                    }
                })
            );
        });
    }

    stop() {
        Patcher.unpatchAll("MuteServer");
        this.menuPatch?.();
    }
};
