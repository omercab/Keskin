// Bu dosya, uygulamanın "akıllı belge okuma" özelliğinin güvenli çalışması için gerekli.
// API anahtarı burada, sunucu tarafında kalır — tarayıcıya hiç gönderilmez.
//
// Vercel'de çalışması için: proje ayarlarında bir Environment Variable ekle:
//   İsim:  ANTHROPIC_API_KEY
//   Değer: (kendi Anthropic API anahtarın, console.anthropic.com üzerinden alınır)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Sadece POST istekleri desteklenir' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Sunucuda ANTHROPIC_API_KEY tanımlı değil. Vercel proje ayarlarından ekle.' });
    return;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
}
