export default function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const challenges = [
      {
        id: 1,
        prompt: "Explain how to grow on TikTok with short form content in a simple way."
      },
      {
        id: 2,
        prompt: "Create a step by step guide to making banana bread for beginners."
      },
      {
        id: 3,
        prompt: "Write a short explanation of how email marketing works for a beginner."
      }
    ];

    // pick random challenge
    const random = challenges[Math.floor(Math.random() * challenges.length)];

    return res.status(200).json({
      challenge: random
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
}
