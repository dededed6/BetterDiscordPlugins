/**
 * @name NoMirrorWebcam
 * @author dededed1024
 * @version 1.1.0
 * @description Disables the mirror effect on your webcam. Right-click your camera tile to toggle.
 * @website https://github.com/dededed1024/BetterDiscordPlugins
 * @source https://raw.githubusercontent.com/dededed1024/BetterDiscordPlugins/master/NoMirrorWebcam/NoMirrorWebcam.plugin.js
 */

module.exports = class NoMirrorWebcam {
    get enabled() {
        return BdApi.Data.load("NoMirrorWebcam", "enabled") ?? true;
    }

    start() {
        this.applyCSS();
        this.patchContextMenu();
    }

    stop() {
        BdApi.DOM.removeStyle("NoMirrorWebcam");
        BdApi.ContextMenu.unpatch("user-context", this._menuPatch);
    }

    applyCSS() {
        BdApi.DOM.removeStyle("NoMirrorWebcam");
        if (this.enabled) {
            BdApi.DOM.addStyle("NoMirrorWebcam", `
                [class*="mirror__"], [class^="camera__"] { transform: scaleX(1) !important; }
            `);
        }
    }

    patchContextMenu() {
        this._UserStore = BdApi.Webpack.getModule(m => m?.getCurrentUser && m?.getUser);

        this._menuPatch = (menu, props) => {
            const currentUser = this._UserStore?.getCurrentUser?.();
            if (!currentUser || props?.user?.id !== currentUser.id) return;

            menu.props.children.push(
                BdApi.ContextMenu.buildItem({
                    type: "toggle",
                    label: "No Mirror Webcam",
                    checked: this.enabled,
                    action: () => {
                        BdApi.Data.save("NoMirrorWebcam", "enabled", !this.enabled);
                        this.applyCSS();
                    }
                })
            );
        };

        BdApi.ContextMenu.patch("user-context", this._menuPatch);
    }
};
