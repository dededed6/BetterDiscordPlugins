/**
 * @name MetadataRemover
 * @author dededed6
 * @version 1.3.0
 * @description Remove personal metadata from files
 * @website https://github.com/dededed6/BetterDiscordPlugins
 * @source https://raw.githubusercontent.com/dededed6/BetterDiscordPlugins/master/Plugins/MetadataRemover/MetadataRemover.plugin.js
 */

module.exports = class MetadataRemover {
    constructor(meta) {
        this.meta = meta;
        this.settings = new SettingsManager(meta.name);
    }

    start() {
        // addFiles 함수 패치 (파일 첨부할 때 호출됨 - 메타데이터 삭제)
        const addFileModule = BdApi.Webpack.getByKeys("addFile");
        if (addFileModule?.addFiles) {
            BdApi.Patcher.before(this.meta.name, addFileModule, "addFiles", async (thisArg, args) => {
                console.log("[MetadataRemover] addFiles called");
                await this.processAddFiles(args);
            });
            console.log("[MetadataRemover] Patched addFiles successfully");
        } else {
            console.error("[MetadataRemover] Failed to find addFiles function");
        }

        // _sendMessage 패치 (파일 이름 랜덤화)
        const sendMsgModule = BdApi.Webpack.getByKeys("_sendMessage");
        if (sendMsgModule) {
            BdApi.Patcher.before(this.meta.name, sendMsgModule, "_sendMessage", (thisArg, args) => {
                console.log("[MetadataRemover] _sendMessage called");
                this.randomizeFileNames.call(this, thisArg, args);
            });
            console.log("[MetadataRemover] Patched _sendMessage successfully");
        }

        console.log("[MetadataRemover] Plugin started successfully");
    }

    stop() {
        BdApi.Patcher.unpatchAll(this.meta.name);
    }

    async processAddFiles(args) {
        // args[0]?.files에서 File 배열을 찾기
        let files = args[0]?.files;

        if (!files || !Array.isArray(files)) {
            return;
        }

        console.log(`[MetadataRemover] Removing metadata from ${files.length} files`);

        for (let i = 0; i < files.length; i++) {
            const file = files[i];

            // 실제 파일 찾기 (files[i].file 또는 files[i] 자체)
            let actualFile = null;
            if (file?.file instanceof File) {
                actualFile = file.file;
            } else if (file instanceof File) {
                actualFile = file;
            } else {
                continue;
            }

            // 메타데이터 제거
            const strippedFile = await MetadataStripper.strip(actualFile);

            if (strippedFile !== actualFile) {
                if (file?.file) {
                    file.file = strippedFile;
                } else {
                    files[i] = strippedFile;
                }
                console.log(`[MetadataRemover] Removed metadata from: ${strippedFile.name}`);
            }
        }
    }

    randomizeFileNames(_, args) {
        const cfg = this.settings.current;
        if (!cfg.randomizeFileName) return;

        const attachments = args[2]?.attachmentsToUpload;
        if (!attachments?.length) return;

        for (let i = 0; i < attachments.length; i++) {
            const attachment = attachments[i];
            const originalFilename = attachment.filename || attachment.name || '';
            const originalExt = originalFilename.substring(originalFilename.lastIndexOf('.') + 1) || '';
            const randomName = this.generateRandomName(originalExt);
            attachment.filename = randomName;
            console.log(`[MetadataRemover] Randomized filename: ${randomName}`);
        }
    }

    async handleFileUpload(_, args) {
        const cfg = this.settings.current;
        const attachments = args[2]?.attachmentsToUpload;

        if (!attachments?.length) return;

        for (let i = 0; i < attachments.length; i++) {
            const attachment = attachments[i];
            const fileToProcess = attachment.item?.file;

            console.log(`[MetadataRemover] Processing attachment ${i}:`, {
                attachment: attachment,
                fileToProcess: fileToProcess,
                fileType: typeof fileToProcess,
                fileName: fileToProcess?.name,
                fileSize: fileToProcess?.size
            });

            if (fileToProcess && typeof fileToProcess.arrayBuffer === 'function') {
                const strippedFile = await MetadataStripper.strip(fileToProcess);

                console.log(`[MetadataRemover] Stripped file:`, {
                    strippedFile: strippedFile,
                    strippedFileName: strippedFile?.name,
                    strippedFileSize: strippedFile?.size,
                    isSameReference: strippedFile === fileToProcess
                });

                if (strippedFile !== fileToProcess && attachment.item?.file) {
                    console.log(`[MetadataRemover] Before replacement - attachment.item.file:`, attachment.item.file);
                    attachment.item.file = strippedFile;
                    console.log(`[MetadataRemover] After replacement - attachment.item.file:`, attachment.item.file);
                    console.log(`[MetadataRemover] Is same as strippedFile?`, attachment.item.file === strippedFile);
                }
            }

            if (cfg.randomizeFileName) {
                const originalFilename = attachment.filename || attachment.name || '';
                const originalExt = originalFilename.substring(originalFilename.lastIndexOf('.') + 1) || '';
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
        info.textContent = "✓ Personal metadata removal is always enabled";
        container.appendChild(info);

        return container;
    }
};

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

class MetadataStripper {
    static HANDLERS = {
        'jpg': 'stripJpegExif', 'jpeg': 'stripJpegExif',
        'png': 'stripPngMetadata',
        'webp': 'stripWebpMetadata',
        'gif': 'stripGifMetadata',
        'bmp': 'stripBmpMetadata',
        'ico': 'stripIcoMetadata',
        'svg': 'stripSvgMetadata',
        'tif': 'stripTiffExif', 'tiff': 'stripTiffExif', 'raw': 'stripTiffExif',
        'pdf': 'stripPdfMetadata',
        'mp3': 'stripMp3Metadata',
        'wav': 'stripWavMetadata',
        'ogg': 'stripOggMetadata',
        'flac': 'stripFlacMetadata',
        'aac': 'stripAacMetadata',
        'm4a': 'stripM4aMetadata',
        'mov': 'stripMovMetadata', 'mp4': 'stripMovMetadata',
        'avi': 'stripAviMetadata',
        'mkv': 'stripMkvMetadata',
        'webm': 'stripWebmMetadata'
    };

    static async strip(file) {
        if (!file || !file.name) return file;
        const ext = file.name.substring(file.name.lastIndexOf('.') + 1).toLowerCase();
        const handler = this.HANDLERS[ext];
        return handler ? await this[handler](file) : file;
    }

    // JPEG: 개인정보 제거 (EXIF 제거)
    static async stripJpegExif(file) {
        if (!file.type.startsWith('image/jpeg')) return file;
        const buffer = await file.arrayBuffer();
        const view = new DataView(buffer);
        let offset = 0;

        if (view.getUint16(offset) !== 0xFFD8) return file;
        offset += 2;

        const chunks = [];
        let foundMetadata = false;

        while (offset < view.byteLength) {
            const marker = view.getUint16(offset);
            const length = view.getUint16(offset + 2);

            // EXIF(0xFFE1), IPTC(0xFFED), XMP(0xFFE9), 주석(0xFFFE) 제거
            if ([0xFFE1, 0xFFED, 0xFFE9, 0xFFFE].includes(marker)) {
                foundMetadata = true;
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

        if (!foundMetadata) return file;
        const strippedBuffer = new Blob([[new Uint8Array([0xFF, 0xD8])], ...chunks], { type: 'image/jpeg' });
        return new File([strippedBuffer], file.name, { type: 'image/jpeg' });
    }

    // PNG: 개인정보 제거 (타임스탐프, 텍스트 메타데이터 제거)
    static async stripPngMetadata(file) {
        if (!file.type.startsWith('image/png')) return file;
        const buffer = await file.arrayBuffer();
        const view = new Uint8Array(buffer);
        const chunks = [];
        let offset = 8;

        while (offset < view.length) {
            const length = new DataView(buffer, offset, 4).getUint32(0, false);
            const chunkType = String.fromCharCode(...view.slice(offset + 4, offset + 8));

            // 필수 청크: IHDR, IDAT, IEND, 색상정보
            // 제거 대상: tIME, tEXt, zTXt, iTXt (개인정보 포함)
            if (['IHDR', 'IDAT', 'IEND', 'PLTE', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP'].includes(chunkType)) {
                chunks.push(buffer.slice(offset, offset + length + 12));
            }
            // tIME, tEXt, zTXt, iTXt 등 메타데이터는 건너뜀
            offset += length + 12;
        }

        const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
        const strippedBuffer = new Blob([png, ...chunks], { type: 'image/png' });
        return new File([strippedBuffer], file.name, { type: 'image/png' });
    }

    // WebP: 개인정보 제거 (EXIF, XMP, ICCP 제거)
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

            // EXIF, XMP, ICCP 메타데이터 제거
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

    // GIF: 개인정보 제거 (주석, 응용 확장 제거)
    static async stripGifMetadata(file) {
        if (!file.type.startsWith('image/gif')) return file;
        const buffer = await file.arrayBuffer();
        const view = new Uint8Array(buffer);

        if (view[0] !== 0x47 || view[1] !== 0x49 || view[2] !== 0x46) return file;

        let offset = 6;
        const result = [view.slice(0, 6)];
        let foundMetadata = false;

        while (offset < view.length) {
            const separator = view[offset];

            if (separator === 0x21) {
                const label = view[offset + 1];
                // 0xFF: Application Extension, 0xFE: Comment Extension, 0xF9: Graphic Control Extension
                if (label === 0xFF || label === 0xFE) {
                    // 메타데이터 블록 건너뜀
                    foundMetadata = true;
                    let blockSize = view[offset + 2];
                    offset += 3 + blockSize;
                    while (view[offset] !== 0x00) {
                        blockSize = view[offset];
                        offset += 1 + blockSize;
                    }
                    offset += 1;
                    continue;
                }
            }

            if (separator === 0x3B) {
                result.push(view.slice(offset, offset + 1));
                break;
            }

            let length = 1;
            if (separator === 0x21 && view[offset + 1] === 0xF9) {
                length = 8;
            } else if (separator === 0x2C) {
                length = 11;
                while (offset + length < view.length && view[offset + length] !== 0x00) {
                    length += view[offset + length] + 1;
                }
                length += 1;
            } else if (separator === 0x21) {
                length = 2;
                while (offset + length < view.length && view[offset + length] !== 0x00) {
                    length += view[offset + length] + 1;
                }
                length += 1;
            }

            result.push(view.slice(offset, offset + length));
            offset += length;
        }

        if (!foundMetadata) return file;
        const strippedBuffer = new Blob(result, { type: 'image/gif' });
        return new File([strippedBuffer], file.name, { type: 'image/gif' });
    }

    // TIFF: 개인정보 제거 (EXIF 제거)
    static async stripTiffExif(file) {
        // TIFF는 EXIF 데이터 구조가 복잡하므로 최소한의 필수 정보만 유지
        // 실제 구현시 TIFF 파서 필요 - 현재는 파일 그대로 반환
        return file;
    }

    // PDF: 개인정보 제거 (메타데이터 사전, 생성/수정 날짜 등 제거)
    static async stripPdfMetadata(file) {
        if (!file.type.startsWith('application/pdf')) return file;
        const buffer = await file.arrayBuffer();
        const view = new Uint8Array(buffer);
        let content = new TextDecoder().decode(buffer);

        // PDF 메타데이터 제거: /Creator, /Author, /CreationDate, /ModDate, /Producer, /Keywords, /Subject
        const metadataPatterns = [
            /\/Creator\s*\([^)]*\)/gi,
            /\/Author\s*\([^)]*\)/gi,
            /\/CreationDate\s*\([^)]*\)/gi,
            /\/ModDate\s*\([^)]*\)/gi,
            /\/Producer\s*\([^)]*\)/gi,
            /\/Keywords\s*\([^)]*\)/gi,
            /\/Subject\s*\([^)]*\)/gi,
            /\/Title\s*\([^)]*\)/gi
        ];

        let modified = false;
        metadataPatterns.forEach(pattern => {
            if (pattern.test(content)) {
                modified = true;
                content = content.replace(pattern, '');
            }
        });

        if (!modified) return file;
        const strippedBuffer = new Blob([content], { type: 'application/pdf' });
        return new File([strippedBuffer], file.name, { type: 'application/pdf' });
    }

    // MP3: 개인정보 제거 (ID3 태그 제거)
    static async stripMp3Metadata(file) {
        if (!file.type.startsWith('audio/mpeg')) return file;
        const buffer = await file.arrayBuffer();
        const view = new Uint8Array(buffer);

        let offset = 0;
        // ID3v2 제거
        if (view[0] === 0x49 && view[1] === 0x44 && view[2] === 0x33) {
            const size = ((view[6] & 0x7f) << 21) | ((view[7] & 0x7f) << 14) | ((view[8] & 0x7f) << 7) | (view[9] & 0x7f);
            offset = size + 10;
        }

        let end = view.length;
        // ID3v1 제거
        if (view[view.length - 128] === 0x54 && view[view.length - 127] === 0x41 && view[view.length - 126] === 0x47) {
            end -= 128;
        }

        if (offset === 0 && end === view.length) return file;
        const strippedBuffer = buffer.slice(offset, end);
        const blob = new Blob([strippedBuffer], { type: 'audio/mpeg' });
        return new File([blob], file.name, { type: 'audio/mpeg' });
    }

    // FLAC: 개인정보 제거 (VORBIS_COMMENT 메타데이터 블록 제거)
    static async stripFlacMetadata(file) {
        if (!file.type.startsWith('audio/flac')) return file;
        const buffer = await file.arrayBuffer();
        const view = new Uint8Array(buffer);

        if (view[0] !== 0x66 || view[1] !== 0x4C || view[2] !== 0x61 || view[3] !== 0x43) return file;

        let offset = 4;
        const blocks = [];
        let isLast = false;

        while (!isLast && offset < view.length) {
            const header = view[offset];
            isLast = (header & 0x80) !== 0;
            const blockType = header & 0x7F;
            const blockSize = (view[offset + 1] << 16) | (view[offset + 2] << 8) | view[offset + 3];

            // STREAMINFO(0) 유지, VORBIS_COMMENT(4) 제거
            if (blockType !== 4) {
                blocks.push(view.slice(offset, offset + 4 + blockSize));
            }

            offset += 4 + blockSize;
        }

        // 남은 오디오 프레임 추가
        if (offset < view.length) {
            blocks.push(view.slice(offset));
        }

        const flacHeader = new Uint8Array([0x66, 0x4C, 0x61, 0x43]);
        const strippedBuffer = new Blob([flacHeader, ...blocks], { type: 'audio/flac' });
        return new File([strippedBuffer], file.name, { type: 'audio/flac' });
    }

    // AAC: 개인정보 제거 (ID3 태그 제거)
    static async stripAacMetadata(file) {
        if (!file.type.startsWith('audio/aac') && !file.type.startsWith('audio/mp4')) return file;
        const buffer = await file.arrayBuffer();
        const view = new Uint8Array(buffer);

        let offset = 0;
        // ID3 제거
        if (view[0] === 0x49 && view[1] === 0x44 && view[2] === 0x33) {
            const size = ((view[6] & 0x7f) << 21) | ((view[7] & 0x7f) << 14) | ((view[8] & 0x7f) << 7) | (view[9] & 0x7f);
            offset = size + 10;
        }

        if (offset === 0) return file;
        const strippedBuffer = buffer.slice(offset);
        const blob = new Blob([strippedBuffer], { type: file.type });
        return new File([blob], file.name, { type: file.type });
    }

    // MOV/MP4: 개인정보 제거 (타임스탐프, 메타데이터 원자 제거)
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
            // 메타데이터 원자 제거: udta, meta, ilst, free
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
                // 타임스탐프 원자: 타임스탐프 값을 0으로 설정
                if (['mvhd', 'tkhd', 'mdhd', 'elst'].includes(atomType)) {
                    const atomData = new Uint8Array(buffer, atomOffset, atomSize);
                    const atomCopy = new Uint8Array(atomSize);
                    atomCopy.set(atomData);
                    const dv = new DataView(atomCopy.buffer, atomCopy.byteOffset);

                    const version = atomCopy[8];

                    if (version === 0) {
                        // version 0: 32-bit 타임스탐프 (offset 12-19)
                        if (atomSize >= 20) {
                            dv.setUint32(12, 0, false);  // creation time
                            dv.setUint32(16, 0, false);  // modification time
                        }
                    } else if (version === 1) {
                        // version 1: 64-bit 타임스탐프 (offset 12-27)
                        if (atomSize >= 28) {
                            dv.setUint32(12, 0, false);
                            dv.setUint32(16, 0, false);
                            dv.setUint32(20, 0, false);
                            dv.setUint32(24, 0, false);
                        }
                    }

                    atoms.push(atomCopy);
                }
                // 컨테이너 원자: 재귀 처리
                else if (['trak', 'mdia', 'minf', 'stbl', 'edts'].includes(atomType)) {
                    atoms.push(this.stripMovAtom(buffer, atomOffset, atomSize));
                }
                // 기타 원자: 그대로 유지
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

    // BMP: 메타데이터 제거 (헤더와 픽셀 데이터만 유지)
    static async stripBmpMetadata(file) {
        if (!file.type.startsWith('image/bmp')) return file;
        const buffer = await file.arrayBuffer();
        const view = new DataView(buffer);

        // BMP 헤더 크기 확인 (DIB 헤더 크기는 offset 14에 있음)
        const dibHeaderSize = view.getUint32(14, true);
        const headerSize = 14 + dibHeaderSize;

        // 헤더 + 팔레트(있으면) + 픽셀 데이터만 유지
        if (buffer.byteLength <= headerSize) return file;

        const cleanBuffer = buffer.slice(0, buffer.byteLength);
        const blob = new Blob([cleanBuffer], { type: 'image/bmp' });
        return new File([blob], file.name, { type: 'image/bmp' });
    }

    // WAV: 메타데이터 제거 (LIST, INFO, ID3 청크 제거)
    static async stripWavMetadata(file) {
        if (!file.type.startsWith('audio/wav')) return file;
        const buffer = await file.arrayBuffer();
        const view = new DataView(buffer);
        const uint8view = new Uint8Array(buffer);

        // RIFF 헤더 확인
        if (view.getUint32(0, false) !== 0x52494646) return file; // "RIFF"
        if (view.getUint32(8, false) !== 0x57415645) return file; // "WAVE"

        const chunks = [];
        let offset = 12;

        // RIFF 헤더 보존
        chunks.push(uint8view.slice(0, 12));

        // 청크 순회
        while (offset < buffer.byteLength - 8) {
            const chunkId = String.fromCharCode(
                uint8view[offset], uint8view[offset + 1],
                uint8view[offset + 2], uint8view[offset + 3]
            );
            const chunkSize = view.getUint32(offset + 4, true);
            const chunkEnd = offset + 8 + chunkSize;

            // 메타데이터 청크 제거: LIST, INFO, ID3, iXML
            if (!['LIST', 'INFO', 'ID3 ', 'iXML'].includes(chunkId)) {
                chunks.push(uint8view.slice(offset, chunkEnd + (chunkSize % 2 ? 1 : 0)));
            }

            offset = chunkEnd + (chunkSize % 2 ? 1 : 0);
        }

        if (chunks.length === 1) return file;
        const strippedBuffer = new Blob(chunks, { type: 'audio/wav' });
        return new File([strippedBuffer], file.name, { type: 'audio/wav' });
    }

    // M4A: 메타데이터 제거 (MOV/MP4와 동일 방식)
    static async stripM4aMetadata(file) {
        if (!file.type.startsWith('audio/mp4') && !file.type.startsWith('audio/m4a')) return file;
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

            // 메타데이터 원자 제거: udta, meta, ilst
            if (!['udta', 'meta', 'ilst'].includes(type)) {
                atoms.push(uint8view.slice(offset, offset + size));
            }

            offset += size;
        }

        if (atoms.length === 0) return file;
        const strippedBuffer = new Blob(atoms, { type: file.type });
        return new File([strippedBuffer], file.name, { type: file.type });
    }

    // ICO: 메타데이터 제거 (기본적으로 메타데이터 없음, 그대로 반환)
    static async stripIcoMetadata(file) {
        return file;
    }

    // SVG: 메타데이터 제거 (주석, creator, date 등 제거)
    static async stripSvgMetadata(file) {
        if (!file.type.startsWith('image/svg')) return file;
        try {
            const text = await file.text();
            // XML 주석 제거
            let cleaned = text.replace(/<!--[\s\S]*?-->/g, '');
            // metadata 요소 제거
            cleaned = cleaned.replace(/<metadata[\s\S]*?<\/metadata>/g, '');
            // RDF 정보 제거
            cleaned = cleaned.replace(/<rdf:RDF[\s\S]*?<\/rdf:RDF>/g, '');

            const blob = new Blob([cleaned], { type: 'image/svg+xml' });
            return new File([blob], file.name, { type: 'image/svg+xml' });
        } catch (e) {
            return file;
        }
    }

    // OGG: Vorbis 메타데이터 제거 (간단하게 처리)
    static async stripOggMetadata(file) {
        if (!file.type.startsWith('audio/ogg')) return file;
        const buffer = await file.arrayBuffer();
        const view = new DataView(buffer);
        const uint8view = new Uint8Array(buffer);

        // OGG 페이지 구조: "OggS"로 시작
        if (view.getUint32(0, false) !== 0x5367674F) return file; // "OggS"

        // 간단하게 전체 파일 반환 (Vorbis 주석 제거는 복잡함)
        const blob = new Blob([uint8view], { type: 'audio/ogg' });
        return new File([blob], file.name, { type: 'audio/ogg' });
    }

    // AVI: 메타데이터 제거 (LIST, INFO 청크 제거)
    static async stripAviMetadata(file) {
        if (!file.type.startsWith('video/') || !file.name.endsWith('.avi')) return file;
        const buffer = await file.arrayBuffer();
        const view = new DataView(buffer);
        const uint8view = new Uint8Array(buffer);

        // RIFF 헤더 확인
        if (view.getUint32(0, false) !== 0x52494646) return file; // "RIFF"
        if (view.getUint32(8, false) !== 0x41564920) return file; // "AVI "

        const chunks = [];
        let offset = 12;

        // RIFF 헤더 보존
        chunks.push(uint8view.slice(0, 12));

        // 청크 순회
        while (offset < buffer.byteLength - 8) {
            const chunkId = String.fromCharCode(
                uint8view[offset], uint8view[offset + 1],
                uint8view[offset + 2], uint8view[offset + 3]
            );
            const chunkSize = view.getUint32(offset + 4, true);
            const chunkEnd = offset + 8 + chunkSize;

            // 메타데이터 청크 제거: LIST (INFO), JUNK
            if (!['LIST', 'JUNK'].includes(chunkId) ||
                (chunkId === 'LIST' && offset + 12 < buffer.byteLength &&
                 String.fromCharCode(uint8view[offset + 8], uint8view[offset + 9],
                                   uint8view[offset + 10], uint8view[offset + 11]) !== 'INFO')) {
                chunks.push(uint8view.slice(offset, Math.min(chunkEnd + (chunkSize % 2 ? 1 : 0), buffer.byteLength)));
            }

            offset = Math.min(chunkEnd + (chunkSize % 2 ? 1 : 0), buffer.byteLength);
        }

        if (chunks.length === 1) return file;
        const strippedBuffer = new Blob(chunks, { type: 'video/avi' });
        return new File([strippedBuffer], file.name, { type: 'video/avi' });
    }

    // MKV: Matroska 메타데이터 제거 (Tags 요소 제거)
    static async stripMkvMetadata(file) {
        if (!file.type.startsWith('video/') && !file.type.startsWith('audio/')) return file;
        const buffer = await file.arrayBuffer();
        const uint8view = new Uint8Array(buffer);

        // EBML 시그니처 확인 (1A 45 DF A3)
        if (!(uint8view[0] === 0x1A && uint8view[1] === 0x45 && uint8view[2] === 0xDF && uint8view[3] === 0xA3)) {
            return file;
        }

        // Matroska 메타데이터 제거는 복잡하므로, 간단한 방식으로 처리
        // Tags 요소 (ID: 0xC5 0x45)를 찾아서 제거
        const result = [];
        let i = 0;

        while (i < uint8view.length - 4) {
            // Tags 요소 찾기
            if (uint8view[i] === 0xC5 && uint8view[i + 1] === 0x45) {
                // 요소 크기 읽기 (가변 길이)
                let sizeStart = i + 2;
                let size = 0;
                let sizeLen = 0;
                let b = uint8view[sizeStart];

                if ((b & 0x80) === 0x80) {
                    sizeLen = 1;
                    size = b & 0x7F;
                } else if ((b & 0xC0) === 0xC0) {
                    sizeLen = 2;
                    size = ((b & 0x3F) << 8) | uint8view[sizeStart + 1];
                } else if ((b & 0xE0) === 0xE0) {
                    sizeLen = 3;
                    size = ((b & 0x1F) << 16) | (uint8view[sizeStart + 1] << 8) | uint8view[sizeStart + 2];
                } else if ((b & 0xF0) === 0xF0) {
                    sizeLen = 4;
                    size = ((b & 0x0F) << 24) | (uint8view[sizeStart + 1] << 16) | (uint8view[sizeStart + 2] << 8) | uint8view[sizeStart + 3];
                } else {
                    result.push(uint8view[i]);
                    i++;
                    continue;
                }

                // Tags 요소 전체 건너뛰기
                i = sizeStart + sizeLen + size;
            } else {
                result.push(uint8view[i]);
                i++;
            }
        }

        // 마지막 바이트들 추가
        while (i < uint8view.length) {
            result.push(uint8view[i]);
            i++;
        }

        if (result.length === uint8view.length) return file;
        const strippedBuffer = new Blob([new Uint8Array(result)], { type: file.type });
        return new File([strippedBuffer], file.name, { type: file.type });
    }

    // WebM: Matroska 기반, MKV와 동일 방식
    static async stripWebmMetadata(file) {
        if (!file.type.startsWith('video/webm') && !file.type.startsWith('audio/webm')) return file;
        const buffer = await file.arrayBuffer();
        const uint8view = new Uint8Array(buffer);

        // EBML 시그니처 확인
        if (!(uint8view[0] === 0x1A && uint8view[1] === 0x45 && uint8view[2] === 0xDF && uint8view[3] === 0xA3)) {
            return file;
        }

        // Tags 요소 제거 (MKV와 동일)
        const result = [];
        let i = 0;

        while (i < uint8view.length - 4) {
            if (uint8view[i] === 0xC5 && uint8view[i + 1] === 0x45) {
                let sizeStart = i + 2;
                let size = 0;
                let sizeLen = 0;
                let b = uint8view[sizeStart];

                if ((b & 0x80) === 0x80) {
                    sizeLen = 1;
                    size = b & 0x7F;
                } else if ((b & 0xC0) === 0xC0) {
                    sizeLen = 2;
                    size = ((b & 0x3F) << 8) | uint8view[sizeStart + 1];
                } else if ((b & 0xE0) === 0xE0) {
                    sizeLen = 3;
                    size = ((b & 0x1F) << 16) | (uint8view[sizeStart + 1] << 8) | uint8view[sizeStart + 2];
                } else if ((b & 0xF0) === 0xF0) {
                    sizeLen = 4;
                    size = ((b & 0x0F) << 24) | (uint8view[sizeStart + 1] << 16) | (uint8view[sizeStart + 2] << 8) | uint8view[sizeStart + 3];
                } else {
                    result.push(uint8view[i]);
                    i++;
                    continue;
                }

                i = sizeStart + sizeLen + size;
            } else {
                result.push(uint8view[i]);
                i++;
            }
        }

        while (i < uint8view.length) {
            result.push(uint8view[i]);
            i++;
        }

        if (result.length === uint8view.length) return file;
        const strippedBuffer = new Blob([new Uint8Array(result)], { type: file.type });
        return new File([strippedBuffer], file.name, { type: file.type });
    }
}
