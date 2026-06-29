export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { acquirer, target, acqData, tgtData } = req.body;

  if (!acquirer || !target) {
    return res.status(400).json({ error: 'Missing acquirer or target' });
  }

  const fmt = {
    money: v => v == null ? 'N/A' : v >= 1e12 ? `$${(v/1e12).toFixed(2)}T`
      : v >= 1e9 ? `$${(v/1e9).toFixed(2)}B`
      : v >= 1e6 ? `$${(v/1e6).toFixed(1)}M`
      : `$${Number(v).toLocaleString()}`,
    pct: v => v == null ? 'N/A' : `${(v*100).toFixed(1)}%`,
    days: v => v == null ? 'N/A' : `${Math.round(v)}d`,
  };

  const acq = acqData || {};
  const tgt = tgtData || {};

  const prompt = `You are an M&A supply chain analyst. ${acquirer} is acquiring ${target}.

Financial context (from Yahoo Finance):
- ${acquirer}: Revenue ${fmt.money(acq.revenue)}, Gross Margin ${fmt.pct(acq.grossMargin)}, Inventory Days ${fmt.days(acq.inventoryDays)}, Working Capital ${fmt.money(acq.workingCapital)}, Total Debt ${fmt.money(acq.totalDebt)}, EBITDA ${fmt.money(acq.ebitda)}
- ${target}: Revenue ${fmt.money(tgt.revenue)}, Gross Margin ${fmt.pct(tgt.grossMargin)}, Inventory Days ${fmt.days(tgt.inventoryDays)}, Working Capital ${fmt.money(tgt.workingCapital)}, Total Debt ${fmt.money(tgt.totalDebt)}, EBITDA ${fmt.money(tgt.ebitda)}

Use web search to find current (2026) information on:
1. What industries are ${acquirer} and ${target} in? Their full company names?
2. Each company's key supplier geographic concentration and known supply chain risks
3. Whether these companies have overlapping or competing supply chains
4. Current geopolitical, trade, or logistics risks affecting either company in 2026

Return ONLY a JSON object, no markdown, no explanation:
{
  "acqFullName": "<full company name>",
  "tgtFullName": "<full company name>",
  "acqIndustry": "<industry>",
  "tgtIndustry": "<industry>",
  "integrationScore": <integer 1-100, higher means harder integration>,
  "scoreRationale": "<one sentence>",
  "acqSupplyChain": "<2-3 sentences on acquirer supply chain exposure and risks>",
  "tgtSupplyChain": "<2-3 sentences on target supply chain exposure and risks>",
  "overlapRisk": "<2 sentences on supplier overlap or conflict between the two>",
  "geopoliticalRisks": "<2-3 sentences on current 2026 risks affecting this deal>",
  "workingCapitalNote": "<1-2 sentences interpreting combined working capital position>",
  "inventoryNote": "<1-2 sentences on inventory days comparison and integration implications>",
  "riskFlags": [
    { "level": "high", "label": "<short label>", "detail": "<one sentence>" },
    { "level": "medium", "label": "<short label>", "detail": "<one sentence>" },
    { "level": "medium", "label": "<short label>", "detail": "<one sentence>" },
    { "level": "low", "label": "<short label>", "detail": "<one sentence>" }
  ],
  "recommendations": [
    "<specific actionable recommendation 1>",
    "<specific actionable recommendation 2>",
    "<specific actionable recommendation 3>",
    "<specific actionable recommendation 4>"
  ]
}`;

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      return res.status(500).json({ error: 'Claude API error: ' + err });
    }

    const data = await claudeRes.json();
    const textBlock = data.content?.find(b => b.type === 'text');
    const raw = textBlock?.text || '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: 'Could not parse AI response' });

    const parsed = JSON.parse(match[0]);
    return res.status(200).json({ success: true, ai: parsed });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
