// 在瀏覽器端壓縮圖片，避免上傳手機原圖（4-8 MB）拖慢上傳速度。
// 預設策略：
//   - 最長邊縮到 1600 px（顯示寬度 600px 的兩倍多，畫質肉眼看不出差別）
//   - JPEG 品質 0.85（標準的「高品質」設定）
//   - 跳過 < 300 KB 的小檔（已經夠小，再壓沒意義）
//   - 跳過 GIF（會丟失動畫）
//   - 若壓完反而比原檔大就用原檔

export type CompressOptions = {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
    skipIfSmallerThan?: number; // bytes
};

export async function compressImage(file: File, options: CompressOptions = {}): Promise<File> {
    const {
        maxWidth = 1600,
        maxHeight = 1600,
        quality = 0.85,
        skipIfSmallerThan = 300 * 1024,
    } = options;

    if (!file.type.startsWith("image/")) return file;
    if (file.type === "image/gif") return file; // 保留動畫
    if (file.size <= skipIfSmallerThan) return file;

    const dataUrl = await readAsDataURL(file);
    const img = await loadImage(dataUrl);

    // 計算縮放比例：以「最長邊」決定
    const scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
    const targetW = Math.max(1, Math.round(img.width * scale));
    const targetH = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // 高品質縮圖
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const blob = await canvasToBlob(canvas, "image/jpeg", quality);
    if (!blob || blob.size >= file.size) {
        // 壓縮失敗或反而更大就用原檔
        return file;
    }
    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
}

function readAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("讀取檔案失敗"));
        reader.readAsDataURL(file);
    });
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("無法解析圖片"));
        img.src = src;
    });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
    return new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), type, quality);
    });
}
