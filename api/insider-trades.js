// api/insider-trades.js
export default async function handler(req, res) {
  // Dynamische Imports
  const fetch = (await import('node-fetch')).default;
  const xml2js = await import('xml2js');

  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // In-Memory Cache
  const cache = new Map();
  const CACHE_DURATION = 5 * 60 * 1000; // 5 Minuten

  // Bekannte CIKs
  const COMPANY_CIKS = {
    'TSLA': '0001318605',
    'AAPL': '0000320193', 
    'MSFT': '0000789019',
    'NVDA': '0001045810',
    'AMD': '0000002488'
  };

  async function fetchWithRetry(url, options = {}, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, {
          ...options,
          headers: {
            'User-Agent': 'SEC-Backend-Service contact@yoursite.com',
            'Accept': 'application/json, text/xml, */*',
            ...options.headers
          }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return response;
      } catch (error) {
        if (i === retries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }

  async function getCIKFromTicker(ticker) {
    const upperTicker = ticker.toUpperCase();
    return COMPANY_CIKS[upperTicker] || null;
  }

  try {
    const { ticker, latest, limit = 10 } = req.query;
    
    if (latest === 'true') {
      // Einfache Test-Response für "latest"
      return res.json({
        success: true,
        count: 1,
        trades: [{
          personName: "Test Person",
          title: "CEO", 
          companyName: "Test Company",
          ticker: "TEST",
          shares: 1000,
          price: 100.00,
          totalValue: 100000,
          sharesAfter: 10000,
          transactionDate: "2025-07-14",
          filingDate: "2025-07-14",
          transactionType: "A",
          transactionCode: "P"
        }]
      });
    }
    
    if (!ticker) {
      return res.status(400).json({ 
        error: 'Ticker parameter required',
        example: '/api/insider-trades?ticker=TSLA'
      });
    }
    
    const cik = await getCIKFromTicker(ticker);
    if (!cik) {
      return res.status(404).json({ 
        error: `CIK not found for ticker: ${ticker}` 
      });
    }
    
    // Einfache Test-Response
    res.json({
      success: true,
      ticker: ticker.toUpperCase(),
      cik,
      count: 1,
      trades: [{
        personName: "Test Insider",
        title: "Chief Executive Officer",
        companyName: `${ticker.toUpperCase()} Inc`,
        ticker: ticker.toUpperCase(),
        shares: 50000,
        price: 250.00,
        totalValue: 12500000,
        sharesAfter: 500000,
        transactionDate: "2025-07-14",
        filingDate: "2025-07-14",
        transactionType: "A",
        transactionCode: "P"
      }]
    });
    
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message
    });
  }
}
