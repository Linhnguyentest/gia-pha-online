const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  // Vercel body is parsed if Content-Type is application/json or similar.
  // For file uploads, we might need to handle multipart/form-data.
  // But for simplicity, we can send base64 or use a library like 'busboy'.
  // However, Vercel supports standard body. Let's assume we send JSON with base64 for small avatars.
  
  const { fileName, fileType, base64Data } = req.body;

  const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
  const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
  const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
  const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
  const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL; // e.g. https://pub-xxx.r2.dev

  if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME || !R2_ACCOUNT_ID) {
    return res.status(500).json({ message: 'Lỗi cấu hình server: Thiếu Cloudflare R2 credentials.' });
  }

  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });

  const buffer = Buffer.from(base64Data, 'base64');
  const key = `avatars/${Date.now()}-${fileName}`;

  try {
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: fileType,
    });

    await s3.send(command);

    // Return the public URL
    const url = R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/${key}` : `https://${R2_BUCKET_NAME}.${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`;
    return res.status(200).json({ 
      success: true, 
      url: url,
      message: 'Đã tải ảnh lên Cloudflare R2 thành công!' 
    });
  } catch (error) {
    console.error("Lỗi R2:", error);
    return res.status(500).json({ message: "Lỗi khi tải ảnh lên Cloudflare: " + error.message });
  }
};
