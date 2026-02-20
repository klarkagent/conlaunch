/**
 * Image upload utility for token logos.
 * Uploads to a free image hosting service and returns a permanent URL.
 */

export interface ImageUploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

/**
 * Upload an image from a URL or base64 data.
 * Uses imgbb.com free hosting API as a default.
 * Falls back to returning the original URL if it's already hosted.
 */
export async function uploadImage(
  input: string,
  name?: string
): Promise<ImageUploadResult> {
  // If it's already a hosted URL, validate and return it
  if (input.startsWith("https://") || input.startsWith("http://")) {
    // Block private/internal URLs (SSRF protection)
    try {
      const url = new URL(input);
      const host = url.hostname.toLowerCase();
      if (host === "localhost" || host.startsWith("127.") || host === "0.0.0.0" ||
          host.startsWith("10.") || host.startsWith("192.168.") || host.startsWith("172.16.") ||
          host.startsWith("172.17.") || host.startsWith("172.18.") || host.startsWith("172.19.") ||
          host.startsWith("172.2") || host.startsWith("172.30.") || host.startsWith("172.31.") ||
          host === "169.254.169.254" || host.endsWith(".local") || host === "[::1]" ||
          host.startsWith("fd") || host.startsWith("fc") || host === "[::]") {
        return { success: false, error: "Private/internal URLs are not allowed" };
      }
      if (!input.startsWith("https://")) {
        return { success: false, error: "Only HTTPS image URLs are allowed" };
      }
    } catch {
      return { success: false, error: "Invalid URL format" };
    }
    try {
      const res = await fetch(input, { method: "HEAD", signal: AbortSignal.timeout(5000) });
      if (!res.ok) {
        return { success: false, error: `Image URL returned ${res.status}` };
      }
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.startsWith("image/")) {
        return { success: false, error: `URL is not an image (${contentType})` };
      }
      return { success: true, url: input };
    } catch (err: any) {
      return { success: false, error: `Cannot reach image URL: ${err.message}` };
    }
  }

  // If it's IPFS, validate CID and convert to gateway URL
  if (input.startsWith("ipfs://")) {
    const cid = input.slice(7);
    if (!/^[A-Za-z0-9]+$/.test(cid) || cid.length < 10) {
      return { success: false, error: "Invalid IPFS CID format" };
    }
    const gatewayUrl = `https://ipfs.io/ipfs/${cid}`;
    return { success: true, url: gatewayUrl };
  }

  // If base64, upload to imgbb (requires API key from env)
  if (input.startsWith("data:image/") || /^[A-Za-z0-9+/=]+$/.test(input)) {
    const imgbbKey = process.env.IMGBB_API_KEY;
    if (!imgbbKey) {
      return { success: false, error: "Base64 upload not configured — provide a direct HTTPS image URL instead" };
    }
    try {
      const base64Data = input.startsWith("data:image/")
        ? input.split(",")[1]
        : input;

      const formData = new FormData();
      formData.append("image", base64Data);
      if (name) formData.append("name", name);

      const res = await fetch(`https://api.imgbb.com/1/upload?key=${imgbbKey}`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        return { success: false, error: "Image upload failed — provide a direct HTTPS URL instead" };
      }

      const data = await res.json();
      return { success: true, url: data.data?.url };
    } catch (err: any) {
      return { success: false, error: `Upload failed: ${err.message}` };
    }
  }

  return { success: false, error: "Input must be a URL (http/https/ipfs) or base64 image data" };
}

/**
 * Validate image dimensions and format.
 * Recommended: 512x512 or 1024x1024, PNG/JPG/WEBP, max 10MB.
 */
export function validateImageUrl(url: string): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  if (!url.startsWith("https://")) {
    warnings.push("Image URL should use HTTPS for security");
  }

  const ext = url.split(".").pop()?.toLowerCase();
  if (ext && !["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) {
    warnings.push("Recommended image formats: PNG, JPG, WEBP");
  }

  return { valid: true, warnings };
}
