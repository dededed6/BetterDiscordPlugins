/**
 * @name BlockLocally
 * @author dededed1024
 * @version 1.0.0
 * @description Block users locally
 * @website https://github.com/dededed6/BetterDiscordPlugins
 * @source https://raw.githubusercontent.com/dededed6/BetterDiscordPlugins/master/BlockLocally/BlockLocally.plugin.js
 */

const { Data, Patcher, Webpack, ContextMenu } = BdApi;

const jumpToPresent = Webpack.getByKeys("jumpToPresent", "fetchMessages")?.jumpToPresent;

module.exports = class BlockLocally {
    constructor() {
        this._cmCallback = null;
    }

    patchStore() {
        // 채팅창 패치
        const isBlockedForMessage = Webpack.getByKeys("isBlockedForMessage");
        if (isBlockedForMessage)
            Patcher.after("BlockLocally", isBlockedForMessage, "isBlockedForMessage", (_, [message], result) => {
                return result || this.blocked.has(message?.author?.id);
            });

        // DM창 패치
        const relationshipStore = Webpack.getByKeys("isBlocked", "isFriend");
        if (relationshipStore) {
            Patcher.after("BlockLocally", relationshipStore, "isBlocked", (_, [userId], result) => {
                return result || this.blocked.has(userId);
            });
        }
    }

    patchContextMenu() {
        this._cmCallback = (tree, props) => {
            const userId = props.user?.id;
            if (!userId) return;

            const blocked = this.blocked.has(userId);
            tree.props.children.push(
                ContextMenu.buildItem({ type: "separator" }),
                ContextMenu.buildItem({
                    label: blocked ? "Unblock Locally" : "Block Locally",
                    danger: !blocked, // 차단할때만 빨갛게
                    action: () => {
                        if (blocked) this.blocked.delete(userId); else this.blocked.add(userId);
                        Data.save("BlockLocally", "blocked", [...this.blocked]);
                        this.updateFriendsCSS();
                        this.rerenderMessages(); // 강제 새로고침 (이미 로드된 메시지에 차단 반영)
                    }
                })
            );
        };
        ContextMenu.patch("user-context", this._cmCallback);
    }

    rerenderMessages() {
        // 모든 채널이랑 DM을 순회하면서
        // store해둔 메시지가 있는지 체크함
        // 있으면 => 다시 로드

        // store해둔 메시지를 순회하는 방식도 해봤는데 채널 ID 추출이 안돼서 포기
        
        const messageStore = Webpack.getByKeys("getMessages", "getMessage", "hasCurrentUserSentMessage");
        
        // 모든 서버의 채널 순회
        const guildStore = Webpack.getByKeys("getGuilds", "getGuild");
        const guildChannelStore = Webpack.getByKeys("getChannels", "getDefaultChannel");

        for (const guildId in (guildStore?.getGuilds() ?? {})) {
            const channels = guildChannelStore?.getChannels(guildId);
            
            for (const { channel } of channels?.SELECTABLE ?? [])
                if (messageStore?.getMessages(channel.id)?.length)
                    jumpToPresent?.(channel.id)
        }
        
        // 모든 dm순회
        const dmStore = Webpack.getByKeys("getSortedPrivateChannels");

        for (const dm of (dmStore?.getSortedPrivateChannels() ?? []))
            if (messageStore?.getMessages(dm.id)?.length)
                jumpToPresent?.(dm.id)
    }

    updateFriendsCSS() {
        const selectors = [...this.blocked]
            .map(id => `[data-list-item-id*="___${id}"]`)
            .join(", "); // 선택자 문자열로
        if (selectors) BdApi.DOM.addStyle("BlockLocally-friends", `${selectors} { display: none !important; }`);
    }

    start() {
        this.blocked = new Set(Data.load("BlockLocally", "blocked") ?? []);
        this.patchStore(); // 실제 차단처리 로직
        this.patchContextMenu(); // 우클릭 패치
        this.updateFriendsCSS(); // 친구 목록에서 없애기
    }

    stop() {
        Patcher.unpatchAll("BlockLocally");
        ContextMenu.unpatch("user-context", this._cmCallback);
        BdApi.DOM.removeStyle("BlockLocally-friends");
    }
};
