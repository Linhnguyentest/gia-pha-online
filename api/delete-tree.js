const { Octokit } = require("@octokit/rest");

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { filePath, sha } = req.body;
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_USER = process.env.GITHUB_USER;
  const GITHUB_REPO = process.env.GITHUB_REPO;

  if (!GITHUB_TOKEN || !GITHUB_USER || !GITHUB_REPO) {
    return res.status(500).json({ message: 'Lỗi cấu hình server: Thiếu GitHub credentials.' });
  }

  const octokit = new Octokit({ auth: GITHUB_TOKEN });

  try {
    // Để xóa tệp trong Git, ta cần SHA của tệp đó
    let currentSha = sha;
    if (!currentSha) {
        try {
            const { data } = await octokit.repos.getContent({
                owner: GITHUB_USER,
                repo: GITHUB_REPO,
                path: filePath,
                ref: 'main',
            });
            currentSha = data.sha;
        } catch (e) {
            return res.status(404).json({ message: 'Không tìm thấy tệp để xóa.' });
        }
    }

    await octokit.repos.deleteFile({
      owner: GITHUB_USER,
      repo: GITHUB_REPO,
      path: filePath,
      message: `Xóa phả đồ ${filePath} lúc ${new Date().toLocaleString('vi-VN')}`,
      sha: currentSha,
      branch: 'main'
    });

    return res.status(200).json({ success: true, message: `Đã xóa phả đồ ${filePath} thành công!` });
  } catch (error) {
    console.error("Lỗi xóa tệp:", error);
    return res.status(500).json({ message: "Lỗi khi xóa phả đồ: " + error.message });
  }
};
