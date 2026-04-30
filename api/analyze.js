export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    return res.status(200).json({
      estimated_tokens: 100,
      efficient_prompt: "Test response working",
      savings_percent: 25
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
