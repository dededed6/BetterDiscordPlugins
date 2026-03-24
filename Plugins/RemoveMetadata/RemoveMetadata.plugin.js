/**
 * @name RemoveMetadata
 * @author dededed1024
 * @version 1.3.1
 * @description Strips metadata from files and pasted images before uploading to Discord. Supports 20 formats with optional file name randomization.
 * @website https://github.com/dededed6/BetterDiscordPlugins
 * @source https://raw.githubusercontent.com/dededed6/BetterDiscordPlugins/master/Plugins/RemoveMetadata/RemoveMetadata.plugin.js
 */

const { Data, Patcher, Webpack } = BdApi;

module.exports = class RemoveMetadata {
    constructor() {
        this.settings = { randomizeFileName: true };
    }

    patch() {
        Patcher.unpatchAll("RemoveMetadata");

        const addFile = Webpack.getByKeys("addFile");
        if (addFile) Patcher.before("RemoveMetadata", addFile, "addFiles", async (_, args) => { await this.processAddFiles(args); });

        if (this.settings.randomizeFileName) {
            const sendMsg = Webpack.getByKeys("_sendMessage");
            if (sendMsg) Patcher.before("RemoveMetadata", sendMsg, "_sendMessage", async (_, args) => { await this.randomizeFileNames(args); });
        }
    }

    async processAddFiles(args) {
        const files = args[0]?.files;
        if (!Array.isArray(files)) return;

        await Promise.all(files.map(async (item, i) => {
            const file = item instanceof File ? item : item?.file;
            if (!(file instanceof File)) return;
            const stripped = await MetadataStripper.strip(file);
            if (stripped !== file)
                item instanceof File ? (files[i] = stripped) : (item.file = stripped);
        }));
    }

    async randomizeFileNames(args) {
        if (!this.settings.randomizeFileName) return;
        const attachments = args[2]?.attachmentsToUpload;
        if (!attachments?.length) return;

        const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        const bytes = crypto.getRandomValues(new Uint8Array(14));

        attachments.forEach(attachment => {
            const ext = attachment.filename.split('.').pop() || '';
            const length = (bytes[0] % 13) + 1; // 파일 이름 길이도 1에서 14까지 랜덤임
            const name = Array.from(bytes.subarray(1, 1 + length), b => chars[b % chars.length]).join('');
            attachment.filename = name + '.' + ext;
        });
    }

    getSettingsPanel() {
        const container = document.createElement("div");
        container.style.cssText = "color: var(--text-normal); padding: 10px;";

        const row = document.createElement("label");
        row.style.cssText = "display: flex; align-items: center; margin: 10px 0; cursor: pointer;";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = this.settings["randomizeFileName"];
        checkbox.style.cssText = "margin-right: 10px; cursor: pointer; width: 18px; height: 18px;";
        checkbox.addEventListener("change", () => {
            this.settings["randomizeFileName"] = checkbox.checked;
            Data.save("RemoveMetadata", "settings", this.settings);
            this.patch(); // 설정 바꿀때마다 실시간으로 적용
        });

        row.appendChild(checkbox);
        row.appendChild(document.createTextNode("Randomize file names"));
        container.appendChild(row);
        return container;
    }

    start() {
        this.settings = Data.load("RemoveMetadata", "settings") || this.settings;
        this.patch();
    }

    stop() { Patcher.unpatchAll("RemoveMetadata"); }
};

// 실제 메타데이터 삭제 로직
const _TEXT_RULES = [
    { mime: /^application\/pdf/, patterns: [/\/(Creator|Author|CreationDate|ModDate|Producer|Keywords|Subject|Title)\s*\([^)]*\)/gi] },
    { mime: /^image\/svg/,       patterns: [/<!--[\s\S]*?-->/g, /<metadata[\s\S]*?<\/metadata>/g, /<rdf:RDF[\s\S]*?<\/rdf:RDF>/g] }
];
const _RIFF_STRIP_CHUNKS  = new Set(['JUNK', 'JNKR', 'PAD ', 'id3 ', 'ID3 ', 'DISP']);
const _RIFF_STRIP_LISTS   = new Set(['INFO', 'JUNK']);
const _MOV_STRIP_ATOMS    = new Set(['udta', 'meta', 'uuid', 'free', 'skip', 'wide']);
const _MOV_INNER_STRIP    = new Set(['meta', 'udta', 'smta', 'uuid']);
const _MOV_TS_ATOMS       = new Set(['mvhd', 'tkhd', 'mdhd']);
const _MOV_CONTAINER      = new Set(['trak', 'mdia', 'minf', 'dinf', 'stbl', 'edts']);
const _JPEG_STRIP_MARKERS = new Set([0xFFE1, 0xFFE2, 0xFFE3, 0xFFE4, 0xFFE5, 0xFFE6, 0xFFE7, 0xFFE8, 0xFFE9, 0xFFEA, 0xFFEB, 0xFFEC, 0xFFED, 0xFFEE, 0xFFEF, 0xFFFE]);
const _PNG_KEEP_CHUNKS    = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'cHRM', 'gAMA', 'sRGB', 'bKGD', 'hIST', 'sBIT', 'pHYs', 'sPLT', 'acTL', 'fcTL', 'fdAT']);
const _WEBP_STRIP_CHUNKS  = new Set(['EXIF', 'XMP ']);

class MetadataStripper {

    // 4바이트 FourCC 읽기
    static _read4CC = (uint8, offset) =>
        String.fromCharCode(uint8[offset], uint8[offset+1], uint8[offset+2], uint8[offset+3]);

    // EBML VINT(가변 길이 정수) 파싱
    static _readVINT = (uint8, offset) => {
        const b = uint8[offset];
        if      ((b & 0x80) === 0x80) return { size:  b & 0x7F, len: 1 };
        else if ((b & 0xC0) === 0x40) return { size: ((b & 0x3F) << 8)  | uint8[offset+1], len: 2 };
        else if ((b & 0xE0) === 0x20) return { size: ((b & 0x1F) << 16) | (uint8[offset+1] << 8) | uint8[offset+2], len: 3 };
        else if ((b & 0xF0) === 0x10) return { size: ((b & 0x0F) << 24) | (uint8[offset+1] << 16) | (uint8[offset+2] << 8) | uint8[offset+3], len: 4 };
        return null;
    };

    // 포맷 같은거끼리는 묶어놨음. jpg랑 png는 어차피 디스코드에서 없애긴하는데 없애긴 아까우니까
    static strip = async (file) => {
        if (!file?.name) return file;
        if (file.size > 500 * 1024 * 1024) return file;
        const ext = file.name.substring(file.name.lastIndexOf('.') + 1).toLowerCase();
        try {
            switch (ext) {
                case 'pdf': case 'svg':
                    return MetadataStripper.stripText(file);
                case 'wav': case 'avi':
                    return MetadataStripper.stripRIFF(file);
                case 'mp3': case 'aac':
                    return MetadataStripper.stripID3(file);
                case 'mov': case 'mp4': case 'm4a': case '3gp': case '3g2':
                case 'm4b': case 'm4r': case 'f4v': case 'heic': case 'heif': case 'avif':
                    return MetadataStripper.stripISOBMFF(file);
                case 'mkv': case 'webm': case 'mka':
                    return MetadataStripper.stripEBML(file);
                case 'flac':
                    file = await MetadataStripper.stripFLAC(file);
                // falls through
                case 'ogg': case 'opus': case 'oga':
                    return MetadataStripper.stripVorbisComment(file);
                case 'jpg': case 'jpeg':
                    return MetadataStripper.stripJPEG(file);
                case 'png':
                    return MetadataStripper.stripPNG(file);
                case 'webp':
                    return MetadataStripper.stripWebP(file);
                case 'gif':
                    return MetadataStripper.stripGIF(file);
                default:
                    return file;
            }
        } catch (e) {
            console.error('[RemoveMetadata] strip 실패:', file.name, e);
            return file;
        }
    };

    static stripText = async (file) => {
        const rule = _TEXT_RULES.find(r => r.mime.test(file.type));
        if (!rule) return file;
        const text = await file.text();
        const cleaned = rule.patterns.reduce((t, p) => t.replace(p, ''), text);
        if (cleaned === text) return file;
        return new File([cleaned], file.name, { type: file.type });
    };

    static stripRIFF = async (file) => {
        const buffer = await file.arrayBuffer();
        const view = new DataView(buffer);
        const uint8 = new Uint8Array(buffer);

        if (buffer.byteLength < 12 || view.getUint32(0, false) !== 0x52494646) return file;

        const magic = view.getUint32(8, false);
        const isWAV = magic === 0x57415645 && /^audio\/(wav|x-wav)/.test(file.type);
        const isAVI = magic === 0x41564920 && /^video\/(avi|x-msvideo)/.test(file.type);
        if (!isWAV && !isAVI) return file;

        const chunks = [uint8.subarray(0, 12)];
        let offset = 12, modified = false;

        while (offset + 8 <= buffer.byteLength) {
            const chunkId   = MetadataStripper._read4CC(uint8, offset);
            const chunkSize = view.getUint32(offset + 4, true);
            const chunkEnd  = offset + 8 + chunkSize + (chunkSize % 2);

            let listType = null;
            if (chunkId === 'LIST' && offset + 12 <= buffer.byteLength)
                listType = MetadataStripper._read4CC(uint8, offset + 8);

            if (_RIFF_STRIP_CHUNKS.has(chunkId) || (listType && _RIFF_STRIP_LISTS.has(listType))) {
                modified = true;
            } else {
                chunks.push(uint8.subarray(offset, Math.min(chunkEnd, buffer.byteLength)));
            }
            offset = Math.min(chunkEnd, buffer.byteLength);
        }

        if (!modified) return file;
        return new File(chunks, file.name, { type: file.type });
    };

    // ID3v2: 파일 앞 "ID3" + syncsafe 크기 / ID3v1: 파일 끝 128바이트 "TAG"
    static stripID3 = async (file) => {
        if (!/^audio\/(mpeg|aac|x-aac)/.test(file.type)) return file;

        const buffer = await file.arrayBuffer();
        const view = new Uint8Array(buffer);

        let start = 0;
        if (view[0] === 0x49 && view[1] === 0x44 && view[2] === 0x33) {
            const size = ((view[6] & 0x7F) << 21) | ((view[7] & 0x7F) << 14) |
                         ((view[8] & 0x7F) << 7)  |  (view[9] & 0x7F);
            start = 10 + size;
        }

        let end = view.length;
        if (end >= 128 && view[end-128] === 0x54 && view[end-127] === 0x41 && view[end-126] === 0x47)
            end -= 128;

        if (start === 0 && end === view.length) return file;
        return new File([buffer.slice(start, end)], file.name, { type: file.type });
    };

    static stripISOBMFF = async (file) => {
        const buffer = await file.arrayBuffer();
        const view = new DataView(buffer);
        const uint8 = new Uint8Array(buffer);
        const atoms = [];
        let offset = 0, modified = false;

        while (offset + 8 <= buffer.byteLength) {
            const size = view.getUint32(offset, false);
            if (size < 8) break;
            const type = MetadataStripper._read4CC(uint8, offset + 4);

            if (_MOV_STRIP_ATOMS.has(type)) {
                modified = true;
            } else {
                atoms.push(type === 'moov'
                    ? MetadataStripper._stripISOBMFFBox(buffer, offset, size)
                    : uint8.subarray(offset, offset + size));
            }
            offset += size;
        }

        if (!modified) return file;
        return new File(atoms, file.name, { type: file.type || 'video/quicktime' });
    };

    // mvhd/tkhd/mdhd 타임스탬프를 0으로 초기화, 메타 atom 제거
    static _stripISOBMFFBox = (buffer, offset, size) => {
        const view = new DataView(buffer);
        const uint8 = new Uint8Array(buffer);
        const atoms = [uint8.subarray(offset, offset + 8)];
        let atomOffset = offset + 8;
        let totalSize = 8;

        while (atomOffset + 8 <= offset + size) {
            const atomSize = view.getUint32(atomOffset, false);
            if (atomSize < 8) break;
            const atomType = MetadataStripper._read4CC(uint8, atomOffset + 4);

            if (_MOV_INNER_STRIP.has(atomType)) {
                // skip
            } else if (_MOV_TS_ATOMS.has(atomType)) {
                const atomCopy = uint8.slice(atomOffset, atomOffset + atomSize);
                const dv = new DataView(atomCopy.buffer);
                const version = atomCopy[8];
                if (version === 0 && atomSize >= 20) {
                    dv.setUint32(12, 0, false);
                    dv.setUint32(16, 0, false);
                } else if (version === 1 && atomSize >= 28) {
                    dv.setUint32(12, 0, false); dv.setUint32(16, 0, false);
                    dv.setUint32(20, 0, false); dv.setUint32(24, 0, false);
                }
                atoms.push(atomCopy);
                totalSize += atomCopy.length;
            } else if (_MOV_CONTAINER.has(atomType)) {
                const nested = MetadataStripper._stripISOBMFFBox(buffer, atomOffset, atomSize);
                atoms.push(nested);
                totalSize += nested.length;
            } else {
                atoms.push(uint8.subarray(atomOffset, atomOffset + atomSize));
                totalSize += atomSize;
            }
            atomOffset += atomSize;
        }

        const result = new Uint8Array(totalSize);
        let pos = 0;
        for (const chunk of atoms) { result.set(chunk, pos); pos += chunk.length; }
        new DataView(result.buffer).setUint32(0, result.length, false);
        return result;
    };

    // Tags element(0x1254C367) 선형 스캔 제거
    static stripEBML = async (file) => {
        if (!file.type.startsWith('video/') && !file.type.startsWith('audio/')) return file;
        const buffer = await file.arrayBuffer();
        const uint8 = new Uint8Array(buffer);
        if (!(uint8[0] === 0x1A && uint8[1] === 0x45 && uint8[2] === 0xDF && uint8[3] === 0xA3)) return file;
        return MetadataStripper._stripEBMLData(uint8, file);
    };

    static _stripEBMLData = (uint8view, file) => {
        const parts = [];
        let i = 0, rangeStart = 0, modified = false;

        while (i < uint8view.length - 8) {
            if (uint8view[i]   === 0x12 && uint8view[i+1] === 0x54 &&
                uint8view[i+2] === 0xC3 && uint8view[i+3] === 0x67) {

                const vint = MetadataStripper._readVINT(uint8view, i + 4);
                if (!vint) { i++; continue; }

                if (rangeStart < i) parts.push(uint8view.subarray(rangeStart, i));
                i = (i + 4) + vint.len + vint.size;
                rangeStart = i;
                modified = true;
            } else { i++; }
        }

        if (!modified) return file;
        if (rangeStart < uint8view.length) parts.push(uint8view.subarray(rangeStart));
        return new File(parts, file.name, { type: file.type });
    };

    // Vorbis Comment / Opus Tags 패킷을 빈 패킷으로 교체 (페이지 삭제 시 스트림 구조 깨짐)
    static stripVorbisComment = async (file) => {
        if (!file.type.startsWith('audio/ogg') && !file.type.startsWith('audio/opus') &&
            !file.type.startsWith('video/ogg')) return file;

        const buffer = await file.arrayBuffer();
        const uint8 = new Uint8Array(buffer);
        if (MetadataStripper._read4CC(uint8, 0) !== 'OggS') return file;

        const pages = [];
        let offset = 0, modified = false;

        while (offset + 27 <= uint8.length) {
            if (MetadataStripper._read4CC(uint8, offset) !== 'OggS') break;

            const numSegments = uint8[offset + 26];
            if (offset + 27 + numSegments > uint8.length) break;

            let dataSize = 0;
            for (let s = 0; s < numSegments; s++) dataSize += uint8[offset + 27 + s];

            const pageEnd = offset + 27 + numSegments + dataSize;
            if (pageEnd > uint8.length) break;

            const dataStart = offset + 27 + numSegments;
            const isVorbisComment = uint8[dataStart]   === 0x03 && uint8[dataStart+1] === 0x76 &&
                                    uint8[dataStart+2] === 0x6F && uint8[dataStart+3] === 0x72;
            const isOpusTags = uint8[dataStart]   === 0x4F && uint8[dataStart+1] === 0x70 &&
                               uint8[dataStart+2] === 0x75 && uint8[dataStart+3] === 0x73 &&
                               uint8[dataStart+4] === 0x54 && uint8[dataStart+5] === 0x61 &&
                               uint8[dataStart+6] === 0x67 && uint8[dataStart+7] === 0x73;

            if (isVorbisComment || isOpusTags) {
                const minPayload = isVorbisComment
                    ? new Uint8Array([0x03, 0x76, 0x6F, 0x72, 0x62, 0x69, 0x73, 0,0,0,0, 0,0,0,0])
                    : new Uint8Array([0x4F, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73, 0,0,0,0, 0,0,0,0]);

                const newSegments = [];
                let remaining = minPayload.length;
                while (remaining > 0) { const s = Math.min(255, remaining); newSegments.push(s); remaining -= s; }
                if (newSegments[newSegments.length - 1] === 255) newSegments.push(0);

                const newPage = new Uint8Array(27 + newSegments.length + minPayload.length);
                newPage.set(uint8.subarray(offset, offset + 27));
                newPage[26] = newSegments.length;
                newPage.set(new Uint8Array(newSegments), 27);
                newPage.set(minPayload, 27 + newSegments.length);
                newPage[22] = 0; newPage[23] = 0; newPage[24] = 0; newPage[25] = 0; // CRC = 0

                pages.push(newPage);
                modified = true;
            } else {
                pages.push(uint8.subarray(offset, pageEnd));
            }
            offset = pageEnd;
        }

        if (!modified) return file;
        return new File(pages, file.name, { type: file.type });
    };

    // APP1~APP15, Comment 마커 제거; EOI/RST는 길이 필드 없는 독립 마커
    static stripJPEG = async (file) => {
        if (!file.type.startsWith('image/jpeg')) return file;
        const buffer = await file.arrayBuffer();
        const view = new DataView(buffer);

        if (view.byteLength < 4 || view.getUint16(0) !== 0xFFD8) return file;

        let offset = 2;
        const chunks = [];
        let foundMetadata = false;

        while (offset + 2 <= view.byteLength) {
            const marker = view.getUint16(offset);

            if (marker === 0xFFD9) { chunks.push(buffer.slice(offset, offset + 2)); break; }

            if ((marker & 0xFFF8) === 0xFFD0) {
                chunks.push(buffer.slice(offset, offset + 2));
                offset += 2;
                continue;
            }

            if (offset + 4 > view.byteLength) break;
            const length = view.getUint16(offset + 2);

            if (_JPEG_STRIP_MARKERS.has(marker)) {
                foundMetadata = true;
            } else {
                chunks.push(buffer.slice(offset, offset + 2 + length));
            }
            offset += 2 + length;

            if (marker === 0xFFDA) { chunks.push(buffer.slice(offset)); break; }
        }

        if (!foundMetadata) return file;
        return new File([new Uint8Array([0xFF, 0xD8]), ...chunks], file.name, { type: 'image/jpeg' });
    };

    // 화이트리스트 방식: tEXt/iTXt/zTXt/eXIf/tIME 등 제거
    static stripPNG = async (file) => {
        if (!file.type.startsWith('image/png')) return file;
        const buffer = await file.arrayBuffer();
        const view = new DataView(buffer);
        const uint8 = new Uint8Array(buffer);

        const chunks = [];
        let offset = 8, modified = false;

        while (offset + 12 <= uint8.length) {
            const length    = view.getUint32(offset, false);
            const chunkType = MetadataStripper._read4CC(uint8, offset + 4);
            const chunkTotal = length + 12;

            if (_PNG_KEEP_CHUNKS.has(chunkType)) {
                chunks.push(uint8.subarray(offset, offset + chunkTotal));
            } else {
                modified = true;
            }
            offset += chunkTotal;
        }

        if (!modified) return file;
        const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
        return new File([sig, ...chunks], file.name, { type: 'image/png' });
    };

    // EXIF/XMP 청크 제거, RIFF/WEBP 헤더 크기 재작성
    static stripWebP = async (file) => {
        if (!file.type.startsWith('image/webp')) return file;
        const buffer = await file.arrayBuffer();
        const view = new Uint8Array(buffer);

        if (view.length < 12) return file;
        if (MetadataStripper._read4CC(view, 0) !== 'RIFF' || MetadataStripper._read4CC(view, 8) !== 'WEBP') return file;

        let offset = 12;
        const chunks = [];
        let modified = false;

        while (offset + 8 <= view.length) {
            const chunkId   = MetadataStripper._read4CC(view, offset);
            const chunkSize = view[offset+4] | (view[offset+5] << 8) | (view[offset+6] << 16) | (view[offset+7] << 24);
            const chunkEnd  = Math.min(offset + 8 + chunkSize + (chunkSize % 2), view.length);

            if (_WEBP_STRIP_CHUNKS.has(chunkId)) {
                modified = true;
            } else {
                chunks.push(view.subarray(offset, chunkEnd));
            }
            offset = chunkEnd;
        }

        if (!modified) return file;

        const contentSize = chunks.reduce((s, c) => s + c.length, 0) + 4;
        const header = new Uint8Array(12);
        header.set([0x52, 0x49, 0x46, 0x46]);
        new DataView(header.buffer).setUint32(4, contentSize, true);
        header.set([0x57, 0x45, 0x42, 0x50], 8);
        return new File([header, ...chunks], file.name, { type: 'image/webp' });
    };

    // Application Extension(XMP 등), Comment Extension 제거
    static stripGIF = async (file) => {
        if (!file.type.startsWith('image/gif')) return file;
        const buffer = await file.arrayBuffer();
        const view = new Uint8Array(buffer);

        if (view.length < 6 || view[0] !== 0x47 || view[1] !== 0x49 || view[2] !== 0x46) return file;

        let offset = 6;
        const result = [view.subarray(0, 6)];
        let foundMetadata = false;

        while (offset < view.length) {
            const separator = view[offset];

            if (separator === 0x21) {
                const label = view[offset + 1];
                if (label === 0xFF || label === 0xFE) {
                    foundMetadata = true;
                    const blockSize = view[offset + 2];
                    offset += 3 + blockSize;
                    while (offset < view.length && view[offset] !== 0x00)
                        offset += 1 + view[offset];
                    offset += 1;
                    continue;
                }
            }

            if (separator === 0x3B) { result.push(view.subarray(offset, offset + 1)); break; }

            let length = 1;
            if (separator === 0x21 && view[offset+1] === 0xF9) {
                length = 9; // GCE 고정 9바이트
            } else if (separator === 0x2C) {
                length = 10;
                const packed = view[offset + 9];
                if (packed & 0x80) length += 3 * (2 << (packed & 0x07)); // LCT
                length += 1; // LZW min code size
                while (offset + length < view.length && view[offset + length] !== 0x00)
                    length += 1 + view[offset + length];
                length += 1;
            } else if (separator === 0x21) {
                length = 2;
                while (offset + length < view.length && view[offset + length] !== 0x00)
                    length += 1 + view[offset + length];
                length += 1;
            }

            result.push(view.subarray(offset, offset + length));
            offset += length;
        }

        if (!foundMetadata) return file;
        return new File(result, file.name, { type: 'image/gif' });
    };

    // VORBIS_COMMENT(타입 4) 제거; 새 마지막 블록에 isLast 비트 설정
    static stripFLAC = async (file) => {
        if (!file.type.startsWith('audio/flac')) return file;
        const buffer = await file.arrayBuffer();
        const view = new Uint8Array(buffer);

        if (MetadataStripper._read4CC(view, 0) !== 'fLaC') return file;

        let offset = 4;
        const blocks = [];
        let isLast = false, modified = false;

        while (!isLast && offset + 4 <= view.length) {
            const header    = view[offset];
            isLast          = (header & 0x80) !== 0;
            const blockType = header & 0x7F;
            const blockSize = (view[offset+1] << 16) | (view[offset+2] << 8) | view[offset+3];

            if (blockType === 4) {
                modified = true;
            } else {
                blocks.push(view.slice(offset, offset + 4 + blockSize));
            }
            offset += 4 + blockSize;
        }

        if (!modified) return file;

        if (blocks.length > 0) blocks[blocks.length - 1][0] |= 0x80;
        if (offset < view.length) blocks.push(view.subarray(offset));

        const sig = new Uint8Array([0x66, 0x4C, 0x61, 0x43]);
        return new File([sig, ...blocks], file.name, { type: 'audio/flac' });
    };
}
