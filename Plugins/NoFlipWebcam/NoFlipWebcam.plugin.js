/**
 * @name NoFlipWebcam
 * @author dededed6
 * @version 1.0.0
 * @description Disables the mirror effect on webcam video
 * @website https://github.com/dededed6/BetterDiscordPlugins
 * @source https://raw.githubusercontent.com/dededed6/BetterDiscordPlugins/master/NoFlipWebcam/NoFlipWebcam.plugin.js
 */

module.exports = class NoFlipWebcam {
    constructor(meta) {
        this.meta = meta;
    }

    start() {
        // Inject CSS to disable webcam mirror effect
        BdApi.DOM.addStyle(this.meta.name, `
            /* Disable all of Discord's mirror classes */
            [class*="mirror-"],
            [class^="mirror-"] {
                transform: scaleX(1) !important;
            }

            /* media-engine-video class (Discord's video engine) */
            .media-engine-video {
                transform: scaleX(1) !important;
            }

            /* Video preview - enhanced selectors */
            video[class*="video"],
            video[class*="Video"],
            div[class*="video"] video,
            div[class*="Video"] video,
            [class*="preview"] video,
            [class*="Preview"] video,
            div[role="img"] video,
            img[class*="preview"],
            img[class*="Preview"],
            img[style*="mirror"],
            img[style*="scaleX(-1)"] {
                transform: scaleX(1) !important;
            }

            /* Your own video during calls */
            div[class*="tile"] video,
            div[class*="Tile"] video,
            div[class*="videoWrapper"] video,
            div[class*="VideoWrapper"] video {
                transform: scaleX(1) !important;
            }

            /* Picture-in-Picture and pop-out - enhanced */
            div[class*="pictureInPicture"] video,
            div[class*="PictureInPicture"] video,
            div[class*="pip"] video,
            div[class*="Pip"] video,
            div[class*="PIP"] video,
            [class*="pictureInPicture"] [class*="mirror"],
            [class*="PictureInPicture"] [class*="mirror"],
            /* All videos inside PIP window */
            [data-pip] video,
            [data-picture-in-picture] video {
                transform: scaleX(1) !important;
            }

            /* Camera preview - comprehensive */
            div[class*="preview"] video,
            div[class*="Preview"] video,
            div[class*="camera"] video,
            div[class*="Camera"] video {
                transform: scaleX(1) !important;
            }

            /* Discord camera preview modal */
            [class*="cameraPreview"] {
                transform: scaleX(1) !important;
            }

            [class*="camera__"] {
                transform: scaleX(1) !important;
            }

        `);
    }

    stop() {
        BdApi.DOM.removeStyle(this.meta.name);
    }
};
