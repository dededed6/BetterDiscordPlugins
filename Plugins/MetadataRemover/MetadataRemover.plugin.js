/**
 * @name MetadataRemover
 * @author dededed6
 * @version 1.1.0
 * @description Remove metadata from files and pasted images
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
        const attachments = args[2]?.attachmentsToUpload;
        if (!attachments?.length) return;

        for (let i = 0; i < attachments.length; i++) {
            const attachment = attachments[i];

            // 원본 파일명 저장
            const originalFilename = attachment.filename || attachment.name || '';
            const originalExt = originalFilename.substring(originalFilename.lastIndexOf('.') + 1) || '';

            // 메타데이터 제거
            if (attachment.file) {
                attachment.file = await MetadataStripper.strip(attachment.file);
            }

            // 이름 난독화 - filename 직접 수정
            if (cfg.randomizeFileName) {
                const randomName = this.generateRandomName(originalExt);
                attachment.filename = randomName;
            }
        }
    }

    generateRandomName(ext) {
        const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        const now = Date.now();
        let seed = now;
        let name = '';
        for (let i = 0; i < 10; i++) {
            seed = (seed * 9301 + 49297) % 233280;
            name += chars.charAt((seed / 233280) * chars.length | 0);
        }
        return ext ? `${name}.${ext}` : name;
    }

    getSettingsPanel() {
        const container = document.createElement("div");
        container.style.cssText = "color: var(--text-normal); padding: 10px;";

        const cfg = this.settings.current;
        const items = [
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

        const info = document.createElement("div");
        info.style.cssText = "color: var(--text-muted); font-size: 12px; margin-top: 15px;";
        info.textContent = "✓ Metadata removal is always enabled";
        container.appendChild(info);

        return container;
    }
};

// 설정 관리
class SettingsManager {
    constructor(name) {
        this.name = name;
        this.defaultSettings = {
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
        'aac': 'stripAacMetadata',
        'mov': 'stripMovMetadata', 'mp4': 'stripMovMetadata'
    };

    static async strip(file) {
        if (!file || !file.name) return file;
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

    static async stripMovMetadata(file) {
        const buffer = await file.arrayBuffer();
        const view = new DataView(buffer);
        const uint8view = new Uint8Array(buffer);
        const atoms = [];
        let offset = 0;

        while (offset < buffer.byteLength) {
            if (offset + 8 > buffer.byteLength) break;
            const size = view.getUint32(offset, false);
            if (size < 8) break;

            const type = String.fromCharCode(
                uint8view[offset + 4],
                uint8view[offset + 5],
                uint8view[offset + 6],
                uint8view[offset + 7]
            );

            const atomEnd = offset + size;
            const metadataAtoms = ['udta', 'meta', 'ilst', 'free'];

            if (!metadataAtoms.includes(type)) {
                if (type === 'moov') {
                    atoms.push(this.stripMovAtom(buffer, offset, size));
                } else {
                    atoms.push(uint8view.slice(offset, atomEnd));
                }
            }

            offset = atomEnd;
        }

        if (atoms.length === 0) return file;
        const strippedBuffer = new Blob(atoms, { type: file.type });
        const mimeType = file.type || 'video/quicktime';
        return new File([strippedBuffer], file.name, { type: mimeType });
    }

    static stripMovAtom(buffer, offset, size) {
        const view = new DataView(buffer);
        const uint8view = new Uint8Array(buffer);
        const atoms = [];
        let atomOffset = offset + 8;

        atoms.push(uint8view.slice(offset, offset + 8));

        while (atomOffset < offset + size) {
            if (atomOffset + 8 > offset + size) break;
            const atomSize = view.getUint32(atomOffset, false);
            if (atomSize < 8) break;

            const atomType = String.fromCharCode(
                uint8view[atomOffset + 4],
                uint8view[atomOffset + 5],
                uint8view[atomOffset + 6],
                uint8view[atomOffset + 7]
            );

            const metadataAtoms = ['udta', 'meta', 'ilst'];
            if (!metadataAtoms.includes(atomType)) {
                // 타임스탬프가 있는 원자들 (mvhd, tkhd, mdhd, elst 등)
                if (['mvhd', 'tkhd', 'mdhd', 'elst', 'gmhd'].includes(atomType)) {
                    const atomData = new Uint8Array(buffer, atomOffset, atomSize);
                    const atomCopy = new Uint8Array(atomSize);
                    atomCopy.set(atomData);
                    const dv = new DataView(atomCopy.buffer, atomCopy.byteOffset);

                    // version 확인 (offset 8)
                    const version = atomCopy[8];

                    if (version === 0) {
                        // version 0: 32-bit 타임스탬프 (offset 12-19)
                        if (atomSize >= 20) {
                            dv.setUint32(12, 0, false);  // creation time
                            dv.setUint32(16, 0, false);  // modification time
                        }
                    } else if (version === 1) {
                        // version 1: 64-bit 타임스탬프 (offset 12-27)
                        if (atomSize >= 28) {
                            dv.setUint32(12, 0, false);  // creation time (high 32)
                            dv.setUint32(16, 0, false);  // creation time (low 32)
                            dv.setUint32(20, 0, false);  // modification time (high 32)
                            dv.setUint32(24, 0, false);  // modification time (low 32)
                        }
                    }

                    atoms.push(atomCopy);
                }
                // 컨테이너 원자 (trak, mdia, minf, stbl 등) - 재귀 처리
                else if (['trak', 'mdia', 'minf', 'stbl', 'edts'].includes(atomType)) {
                    atoms.push(this.stripMovAtom(buffer, atomOffset, atomSize));
                }
                // 나머지 원자
                else {
                    atoms.push(uint8view.slice(atomOffset, atomOffset + atomSize));
                }
            }

            atomOffset += atomSize;
        }

        const result = new Uint8Array(atoms.reduce((a, b) => a + b.length, 0));
        let pos = 0;
        for (const chunk of atoms) {
            result.set(chunk, pos);
            pos += chunk.length;
        }

        const newSize = result.length;
        const sizeView = new DataView(result.buffer);
        sizeView.setUint32(0, newSize, false);

        return result;
    }
}
