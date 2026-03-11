/**
 * @name MetadataRemover
 * @author dededed6
 * @version 1.0.0
 * @description Remove metadata from files (images, audio, documents)
 * @website https://github.com/dededed6/BetterDiscordPlugins
 * @source https://raw.githubusercontent.com/dededed6/BetterDiscordPlugins/master/Plugins/MetadataRemover/MetadataRemover.plugin.js
 */

module.exports = class MetadataRemover {
    constructor(meta) {
        this.meta = meta;
        this.settings = new SettingsManager(meta.name);
    }

    start() {
        BdApi.Patcher.before(this.meta.name, BdApi.Webpack.getByKeys("_sendMessage"), "_sendMessage", this.handleFileUpload.bind(this));
    }

    stop() {
        BdApi.Patcher.unpatchAll(this.meta.name);
    }

    async handleFileUpload(_, args) {
        const cfg = this.settings.current;
        if (!cfg.stripMetadata && !cfg.randomizeFileName) return;

        const attachments = args[2]?.attachmentsToUpload;
        if (!attachments?.length) return;

        for (let i = 0; i < attachments.length; i++) {
            let file = attachments[i];

            if (cfg.stripMetadata) {
                file = await MetadataStripper.strip(file);
            }

            if (cfg.randomizeFileName) {
                const ext = file.name.substring(file.name.lastIndexOf('.') + 1) || '';
                const newName = this.generateRandomName(ext);
                const buffer = await file.arrayBuffer();
                file = new File([buffer], newName, { type: file.type });
            }

            attachments[i] = file;
        }
    }

    generateRandomName(ext) {
        const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let name = '';
        for (let i = 0; i < 10; i++) {
            name += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return ext ? `${name}.${ext}` : name;
    }

    getSettingsPanel() {
        const container = document.createElement("div");
        container.style.cssText = "color: var(--text-normal); padding: 10px;";

        const cfg = this.settings.current;
        const items = [
            { key: "stripMetadata", label: "Remove metadata from files (EXIF, ID3, etc)" },
            { key: "randomizeFileName", label: "Randomize file names" }
        ];

        items.forEach(item => {
            const row = document.createElement("label");
            row.style.cssText = "display: flex; align-items: center; margin: 10px 0; cursor: pointer;";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = cfg[item.key];
            checkbox.style.cssText = "margin-right: 10px; cursor: pointer; width: 18px; height: 18px;";

            checkbox.addEventListener("change", () => {
                cfg[item.key] = checkbox.checked;
                this.settings.save();
            });

            row.appendChild(checkbox);
            row.appendChild(document.createTextNode(item.label));
            container.appendChild(row);
        });

        return container;
    }
};

// 설정 관리
class SettingsManager {
    constructor(name) {
        this.name = name;
        this.defaultSettings = {
            stripMetadata: true,
            randomizeFileName: false
        };
        this.current = Object.assign(structuredClone(this.defaultSettings), BdApi.Data.load(name, "settings") || {});
    }

    save() {
        BdApi.Data.save(this.name, "settings", this.current);
    }
}

// 메타데이터 제거
class MetadataStripper {
    static HANDLERS = {
        'jpg': 'stripJpegExif', 'jpeg': 'stripJpegExif',
        'png': 'stripPngMetadata',
        'webp': 'stripWebpMetadata',
        'gif': 'stripGifMetadata',
        'tif': 'stripTiffExif', 'tiff': 'stripTiffExif', 'raw': 'stripTiffExif',
        'pdf': 'stripPdfMetadata',
        'mp3': 'stripMp3Metadata',
        'flac': 'stripFlacMetadata',
        'aac': 'stripAacMetadata'
    };

    static async strip(file) {
        const ext = file.name.substring(file.name.lastIndexOf('.') + 1).toLowerCase();
        const handler = this.HANDLERS[ext];
        return handler ? await this[handler](file) : file;
    }

    static async stripJpegExif(file) {
        if (!file.type.startsWith('image/jpeg')) return file;
        const buffer = await file.arrayBuffer();
        const view = new DataView(buffer);
        let offset = 0;

        if (view.getUint16(offset) !== 0xFFD8) return file;
        offset += 2;

        const chunks = [];
        let foundExif = false;

        while (offset < view.byteLength) {
            const marker = view.getUint16(offset);
            const length = view.getUint16(offset + 2);

            if (marker === 0xFFE1) {
                foundExif = true;
                offset += length + 2;
                continue;
            }

            chunks.push(buffer.slice(offset, offset + length + 2));
            offset += length + 2;

            if (marker === 0xFFDA) {
                chunks.push(buffer.slice(offset));
                break;
            }
        }

        if (!foundExif) return file;
        const strippedBuffer = new Blob([[new Uint8Array([0xFF, 0xD8])], ...chunks], { type: 'image/jpeg' });
        return new File([strippedBuffer], file.name, { type: 'image/jpeg' });
    }

    static async stripPngMetadata(file) {
        if (!file.type.startsWith('image/png')) return file;
        const buffer = await file.arrayBuffer();
        const view = new Uint8Array(buffer);
        const chunks = [];
        let offset = 8;

        while (offset < view.length) {
            const length = new DataView(buffer, offset, 4).getUint32(0, false);
            const chunkType = String.fromCharCode(...view.slice(offset + 4, offset + 8));

            if (['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB'].includes(chunkType)) {
                chunks.push(buffer.slice(offset, offset + length + 12));
            }
            offset += length + 12;
        }

        const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
        const strippedBuffer = new Blob([png, ...chunks], { type: 'image/png' });
        return new File([strippedBuffer], file.name, { type: 'image/png' });
    }

    static async stripWebpMetadata(file) {
        if (!file.type.startsWith('image/webp')) return file;
        const buffer = await file.arrayBuffer();
        const view = new Uint8Array(buffer);

        if (view[0] !== 0x52 || view[1] !== 0x49 || view[2] !== 0x46 || view[3] !== 0x46) return file;
        if (view[8] !== 0x57 || view[9] !== 0x45 || view[10] !== 0x42 || view[11] !== 0x50) return file;

        let offset = 12;
        const chunks = [];

        while (offset < view.length - 8) {
            const chunkId = String.fromCharCode(view[offset], view[offset + 1], view[offset + 2], view[offset + 3]);
            const chunkSize = view[offset + 4] | (view[offset + 5] << 8) | (view[offset + 6] << 16) | (view[offset + 7] << 24);
            const chunkEnd = offset + 8 + chunkSize;

            if (!['EXIF', 'XMP ', 'ICCP'].includes(chunkId)) {
                chunks.push(view.slice(offset, chunkEnd + (chunkSize % 2 ? 1 : 0)));
            }
            offset = chunkEnd + (chunkSize % 2 ? 1 : 0);
        }

        if (chunks.length === 0) return file;
        const riffHeader = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
        const webpHeader = new Uint8Array([0x57, 0x45, 0x42, 0x50]);
        const totalSize = chunks.reduce((s, c) => s + c.length, 0) + 4;
        const sizeArray = new Uint8Array([(totalSize) & 0xFF, (totalSize >> 8) & 0xFF, (totalSize >> 16) & 0xFF, (totalSize >> 24) & 0xFF]);

        const strippedBuffer = new Blob([riffHeader, sizeArray, webpHeader, ...chunks], { type: 'image/webp' });
        return new File([strippedBuffer], file.name, { type: 'image/webp' });
    }

    static async stripGifMetadata(file) {
        if (!file.type.startsWith('image/gif')) return file;
        const buffer = await file.arrayBuffer();
        const view = new Uint8Array(buffer);

        if (view[0] !== 0x47 || view[1] !== 0x49 || view[2] !== 0x46) return file;

        let offset = 6;
        const result = [view.slice(0, 6)];

        while (offset < view.length) {
            const separator = view[offset];

            if (separator === 0x21) {
                const label = view[offset + 1];
                if ([0xFF, 0xFE, 0xF9].includes(label)) {
                    offset += 2;
                    while (offset < view.length && view[offset] !== 0) {
                        offset += view[offset] + 1;
                    }
                    offset++;
                    continue;
                }
            } else if (separator === 0x2C) {
                const blockSize = 10 + (view[offset + 8] & 0x80 ? Math.pow(2, (view[offset + 8] & 0x07) + 1) * 3 : 0);
                result.push(view.slice(offset, offset + blockSize));
                offset += blockSize;
            } else if (separator === 0x3B) {
                result.push(new Uint8Array([0x3B]));
                break;
            }
            offset++;
        }

        const strippedBuffer = new Blob(result, { type: 'image/gif' });
        return new File([strippedBuffer], file.name, { type: 'image/gif' });
    }

    static async stripTiffExif(file) {
        const buffer = await file.arrayBuffer();
        const view = new DataView(buffer);
        const isLittleEndian = view.getUint16(0) === 0x4949;

        if (!isLittleEndian && view.getUint16(0) !== 0x4D4D) return file;
        const minimalTiff = buffer.slice(0, 8);
        const strippedBuffer = new Blob([minimalTiff], { type: file.type });
        return new File([strippedBuffer], file.name, { type: file.type });
    }

    static async stripPdfMetadata(file) {
        if (!file.type.startsWith('application/pdf')) return file;
        const buffer = await file.arrayBuffer();
        const patterns = [
            { search: '/Producer' },
            { search: '/Creator' },
            { search: '/CreationDate' },
            { search: '/ModDate' }
        ];

        let modified = false;
        const result = new Uint8Array(buffer);

        patterns.forEach(pattern => {
            const searchBytes = new TextEncoder().encode(pattern.search);
            for (let i = 0; i < result.length - searchBytes.length; i++) {
                let match = true;
                for (let j = 0; j < searchBytes.length; j++) {
                    if (result[i + j] !== searchBytes[j]) { match = false; break; }
                }
                if (match) {
                    let end = i + searchBytes.length;
                    while (end < result.length && result[end] !== 10 && result[end] !== 13) end++;
                    for (let k = i; k < end; k++) result[k] = 0x20;
                    modified = true;
                    i = end;
                }
            }
        });

        if (!modified) return file;
        const blob = new Blob([result], { type: 'application/pdf' });
        return new File([blob], file.name, { type: 'application/pdf' });
    }

    static async stripMp3Metadata(file) {
        if (!file.type.startsWith('audio/mpeg')) return file;
        const buffer = await file.arrayBuffer();
        const view = new Uint8Array(buffer);

        let offset = 0;
        if (view[0] === 0x49 && view[1] === 0x44 && view[2] === 0x33) {
            const size = ((view[6] & 0x7f) << 21) | ((view[7] & 0x7f) << 14) | ((view[8] & 0x7f) << 7) | (view[9] & 0x7f);
            offset = size + 10;
        }

        let end = view.length;
        if (view[view.length - 128] === 0x54 && view[view.length - 127] === 0x41 && view[view.length - 126] === 0x47) {
            end -= 128;
        }

        const strippedBuffer = buffer.slice(offset, end);
        const blob = new Blob([strippedBuffer], { type: 'audio/mpeg' });
        return new File([blob], file.name, { type: 'audio/mpeg' });
    }

    static async stripFlacMetadata(file) {
        if (!file.type.startsWith('audio/flac')) return file;
        const buffer = await file.arrayBuffer();
        const view = new Uint8Array(buffer);

        if (view[0] !== 0x66 || view[1] !== 0x4C || view[2] !== 0x61 || view[3] !== 0x43) return file;

        let offset = 4;
        while (offset < view.length) {
            const isLast = (view[offset] & 0x80) !== 0;
            const blockSize = (view[offset + 1] << 16) | (view[offset + 2] << 8) | view[offset + 3];
            offset += blockSize + 4;
            if (isLast) break;
        }

        const flacHeader = new Uint8Array([0x66, 0x4C, 0x61, 0x43]);
        const strippedBuffer = new Blob([flacHeader, view.slice(offset)], { type: 'audio/flac' });
        return new File([strippedBuffer], file.name, { type: 'audio/flac' });
    }

    static async stripAacMetadata(file) {
        if (!file.type.startsWith('audio/aac') && !file.type.startsWith('audio/mp4')) return file;
        const buffer = await file.arrayBuffer();
        const view = new Uint8Array(buffer);

        let offset = 0;
        if (view[0] === 0x49 && view[1] === 0x44 && view[2] === 0x33) {
            const size = ((view[6] & 0x7f) << 21) | ((view[7] & 0x7f) << 14) | ((view[8] & 0x7f) << 7) | (view[9] & 0x7f);
            offset = size + 10;
        }

        if (offset === 0) return file;
        const strippedBuffer = buffer.slice(offset);
        const blob = new Blob([strippedBuffer], { type: file.type });
        return new File([blob], file.name, { type: file.type });
    }
}
