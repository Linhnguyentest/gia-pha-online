const { Octokit } = require("@octokit/rest");

module.exports = async (req, res) => {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_USER = process.env.GITHUB_USER;
  const GITHUB_REPO = process.env.GITHUB_REPO;

  if (!GITHUB_TOKEN || !GITHUB_USER || !GITHUB_REPO) {
    return res.status(500).json({ message: 'Lỗi cấu hình server: Thiếu GitHub credentials.' });
  }

  const octokit = new Octokit({ auth: GITHUB_TOKEN });

  try {
    const { data } = await octokit.repos.getContent({
      owner: GITHUB_USER,
      repo: GITHUB_REPO,
      path: 'data',
      ref: 'main',
    });

    // Lọc ra các tệp .json (đại diện cho các dòng họ)
    const trees = data
      .filter(item => item.name.endsWith('.json') && item.type === 'file')
      .map(item => ({
        name: item.name,
        path: item.path,
        sha: item.sha,
        size: item.size
      }));

    return res.status(200).json({ success: true, trees });
  } catch (error) {
    console.error("Lỗi liệt kê tệp:", error);
    return res.status(500).json({ message: "Lỗi khi lấy danh sách phả đồ: " + error.message });
  }
};
