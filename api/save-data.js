const { Octokit } = require("@octokit/rest");

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { filePath, data } = req.body;
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_USER = process.env.GITHUB_USER;
  const GITHUB_REPO = process.env.GITHUB_REPO;

  if (!GITHUB_TOKEN || !GITHUB_USER || !GITHUB_REPO) {
    return res.status(500).json({ message: 'Lỗi cấu hình server: Thiếu GitHub credentials.' });
  }

  const octokit = new Octokit({ auth: GITHUB_TOKEN });
  const contentBase64 = Buffer.from(JSON.stringify(data, null, 2)).toString("base64");

  try {
    let currentSha;
    try {
      const { data: fileData } = await octokit.repos.getContent({
        owner: GITHUB_USER,
        repo: GITHUB_REPO,
        path: filePath,
        ref: 'main',
      });
      currentSha = fileData.sha;
    } catch (e) {
      if (e.status !== 404) throw e;
    }

    await octokit.repos.createOrUpdateFileContents({
      owner: GITHUB_USER,
      repo: GITHUB_REPO,
      path: filePath,
      branch: 'main',
      message: `Cập nhật gia phả lúc ${new Date().toLocaleString('vi-VN')}`,
      content: contentBase64,
      sha: currentSha,
    });

    return res.status(200).json({ success: true, message: `Đã lưu ${filePath} lên GitHub!` });
  } catch (error) {
    console.error("Lỗi GitHub:", error);
    return res.status(500).json({ message: "Lỗi khi lưu lên GitHub: " + error.message });
  }
};
