// Cloudinary unsigned upload helper
// 需要在 .env.local 設定：
//   NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
//   NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET

export type CloudinaryUploadResult = {
    secure_url: string;
    public_id: string;
    width: number;
    height: number;
    format: string;
    bytes: number;
};

export async function uploadImageToCloudinary(file: File): Promise<CloudinaryUploadResult> {
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const preset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

    if (!cloudName || !preset) {
        throw new Error("尚未設定 Cloudinary：請在 .env.local 填入 NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME 與 NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET");
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", preset);
    formData.append("folder", "meeting-platform/showcase");

    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: "POST",
        body: formData,
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Cloudinary 上傳失敗 (${res.status})：${text}`);
    }

    return await res.json();
}
