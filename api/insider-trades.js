// api/insider-trades.js - ECHTER SEC API CODE
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

  // In-Memory Cache (für bessere Performance)
  const cache = new Map();
  const CACHE_DURATION = 5 * 60 * 1000; // 5 Minuten

  // Bekannte CIKs für häufig gesuchte Unternehmen
  const COMPANY_CIKS = {
    'TSLA': '0001318605',
    'AAPL': '0000320193', 
    'MSFT': '0000789019',
    'GOOGL': '0001652044',
    'GOOG': '0001652044',
    'AMZN': '0001018724',
    'META': '0001326801',
    'NVDA': '0001045810',
    'BTBT': '0001710350',
    'AMD': '0000002488',
    'NFLX': '0001065280',
    'INTC': '0000050863',
    'ORCL': '0001341439',
    'CRM': '0001108524',
    'ADBE': '0000796343'
  };

  // Rate Limiting
  const requestTimes = [];
  const MAX_REQUESTS_PER_SECOND = 8;

  function checkRateLimit() {
    const now = Date.now();
    const oneSecondAgo = now - 1000;
    
    // Entferne alte Requests
    while (requestTimes.length > 0 && requestTimes[0] < oneSecondAgo) {
      requestTimes.shift();
    }
    
    if (requestTimes.length >= MAX_REQUESTS_PER_SECOND) {
      const waitTime = requestTimes[0] + 1000 - now;
      return waitTime;
    }
    
    requestTimes.push(now);
    return 0;
  }

  async function fetchWithRetry(url, options = {}, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        // Rate Limiting prüfen
        const waitTime = checkRateLimit();
        if (waitTime > 0) {
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        const response = await fetch(url, {
          ...options,
          headers: {
            'User-Agent': 'SEC-Insider-Trading-API contact@yoursite.com',
            'Accept': 'application/json, text/xml, */*',
            'Accept-Encoding': 'gzip, deflate',
            'Host': url.includes('sec.gov') ? 'data.sec.gov' : undefined,
            ...options.headers
          }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return response;
      } catch (error) {
        console.warn(`Attempt ${i + 1} failed:`, error.message);
        if (i === retries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }

  async function getCIKFromTicker(ticker) {
    const upperTicker = ticker.toUpperCase();
    
    // Prüfe bekannte CIKs zuerst
    if (COMPANY_CIKS[upperTicker]) {
      return COMPANY_CIKS[upperTicker];
    }
    
    // Cache-Key für Ticker Lookup
    const cacheKey = `ticker_${upperTicker}`;
    if (cache.has(cacheKey)) {
      const cached = cache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.data;
      }
    }
    
    try {
      const response = await fetchWithRetry('https://data.sec.gov/files/company_tickers.json');
      const data = await response.json();
      
      for (const [key, company] of Object.entries(data)) {
        if (company.ticker === upperTicker) {
          const cik = company.cik_str.toString().padStart(10, '0');
          cache.set(cacheKey, { data: cik, timestamp: Date.now() });
          return cik;
        }
      }
    } catch (error) {
      console.warn('Ticker search failed:', error);
    }
    
    return null;
  }

  async function fetchCompanySubmissions(cik) {
    const cacheKey = `submissions_${cik}`;
    if (cache.has(cacheKey)) {
      const cached = cache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.data;
      }
    }
    
    const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
    const response = await fetchWithRetry(url);
    const data = await response.json();
    
    cache.set(cacheKey, { data, timestamp: Date.now() });
    return data;
  }

  async function fetchForm4XML(accessionNumber, cik) {
    const cacheKey = `form4_${accessionNumber}`;
    if (cache.has(cacheKey)) {
      const cached = cache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.data;
      }
    }
    
    try {
      const cleanAccession = accessionNumber.replace(/-/g, '');
      const xmlUrl = `https://www.sec.gov/Archives/edgar/data/${parseInt(cik)}/${cleanAccession}/ownership.xml`;
      
      const response = await fetchWithRetry(xmlUrl);
      const xmlText = await response.text();
      const parsedData = await parseForm4XML(xmlText);
      
      cache.set(cacheKey, { data: parsedData, timestamp: Date.now() });
      return parsedData;
    } catch (error) {
      console.warn('XML fetch failed for', accessionNumber, error.message);
      return null;
    }
  }

  async function parseForm4XML(xmlText) {
    try {
      const parser = new xml2js.Parser({ 
        explicitArray: false,
        mergeAttrs: true,
        normalizeTags: true,
        normalize: true,
        trim: true
      });
      
      const result = await parser.parseStringPromise(xmlText);
      
      const doc = result.ownershipdocument || result.ownershpdocument;
      if (!doc) {
        console.warn('No ownership document found in XML');
        return null;
      }
      
      // Parse Reporting Person Info
      const reportingOwner = doc.reportingowner;
      if (!reportingOwner) {
        console.warn('No reporting owner found');
        return null;
      }
      
      const reportingOwnerId = reportingOwner.reportingownerid || {};
      const relationship = reportingOwner.reportingownerrelationship || {};
      
      const personName = reportingOwnerId.rptownername || 'Unknown';
      const isDirector = relationship.isdirector === '1';
      const isOfficer = relationship.isofficer === '1';
      const isTenPercentOwner = relationship.istenpercentowner === '1';
      const officerTitle = relationship.officertitle || '';
      
      let title = '';
      if (isDirector) title = 'Director';
      if (isOfficer && officerTitle) title = officerTitle;
      if (isTenPercentOwner) title = title ? title + ', 10% Owner' : '10% Owner';
      if (!title) title = 'Insider';
      
      // Parse Company Info
      const issuer = doc.issuer || {};
      const companyName = issuer.issuername || 'Unknown Company';
      const ticker = issuer.issuertradingsymbol || '';
      
      // Parse Filing Date
      const filingDate = doc.documentdate || doc.periodofReport || '';
      
      // Parse Non-Derivative Transactions
      const transactions = [];
      let nonDerivativeTable = doc.nonderivativetable;
      
      if (nonDerivativeTable) {
        let nonDerivativeTransactions = nonDerivativeTable.nonderivativetransaction;
        
        // Normalisiere zu Array
        if (!Array.isArray(nonDerivativeTransactions)) {
          nonDerivativeTransactions = nonDerivativeTransactions ? [nonDerivativeTransactions] : [];
        }
        
        nonDerivativeTransactions.forEach(transaction => {
          if (!transaction) return;
          
          try {
            const securityTitle = transaction.securitytitle?.value || 'Common Stock';
            const transactionDate = transaction.transactiondate?.value || '';
            const transactionCode = transaction.transactioncoding?.transactioncode || '';
            
            const amounts = transaction.transactionamounts;
            if (!amounts) return;
            
            const shares = parseFloat(amounts.transactionshares?.value || '0');
            const pricePerShare = amounts.transactionpricepershare?.value;
            const price = pricePerShare ? parseFloat(pricePerShare) : 0;
            const acquiredDisposedCode = amounts.transactionacquireddisposedcode?.value || '';
            
            const postTransaction = transaction.posttransactionamounts;
            const sharesAfter = postTransaction ? parseFloat(postTransaction.sharesoaoedfollotransaction?.value || '0') : 0;
            
            const ownershipNature = transaction.ownershipnature || {};
            const ownershipForm = ownershipNature.directorindirectownership?.value || 'D';
            
            if (shares > 0 && !isNaN(shares)) {
              transactions.push({
                personName,
                title,
                companyName,
                ticker,
                shares: Math.round(shares),
                price: price || 0,
                totalValue: Math.round(shares * (price || 0)),
                sharesAfter: Math.round(sharesAfter) || 0,
                transactionDate,
                filingDate,
                transactionType: acquiredDisposedCode, // A = Acquired, D = Disposed
                transactionCode, // P = Purchase, S = Sale, etc.
                securityTitle,
                ownershipForm, // D = Direct, I = Indirect
                footnotes: transaction.footnoteid ? `See footnote ${transaction.footnoteid}` : null
              });
            }
          } catch (parseError) {
            console.warn('Error parsing individual transaction:', parseError.message);
          }
        });
      }
      
      return transactions;
    } catch (error) {
      console.error('XML parsing error:', error.message);
      return null;
    }
  }

  // Haupthandler
  try {
    const { ticker, latest, limit = 10 } = req.query;
    
    if (latest === 'true') {
      // Lade neueste Filings für mehrere populäre Unternehmen
      const popularTickers = ['TSLA', 'AAPL', 'MSFT', 'NVDA', 'AMD', 'META'];
      const allTrades = [];
      
      for (const t of popularTickers) {
        try {
          const cik = await getCIKFromTicker(t);
          if (!cik) continue;
          
          const submissions = await fetchCompanySubmissions(cik);
          
          // Finde neueste Form 4
          const form4Indices = [];
          submissions.filings.recent.form.forEach((form, index) => {
            if (form === '4' || form === '4/A') {
              form4Indices.push(index);
            }
          });
          
          if (form4Indices.length > 0) {
            // Nehme nur das neueste Filing
            const latestIndex = form4Indices[0];
            const accessionNumber = submissions.filings.recent.accessionNumber[latestIndex];
            const trades = await fetchForm4XML(accessionNumber, cik);
            
            if (trades && trades.length > 0) {
              allTrades.push(...trades);
            }
          }
        } catch (error) {
          console.warn(`Failed to load ${t}:`, error.message);
          // Fahre mit nächstem Ticker fort
        }
      }
      
      // Sortiere nach Datum (neueste zuerst)
      allTrades.sort((a, b) => new Date(b.transactionDate) - new Date(a.transactionDate));
      
      return res.json({
        success: true,
        count: allTrades.length,
        trades: allTrades.slice(0, parseInt(limit)),
        source: 'SEC EDGAR API',
        cached: false
      });
    }
    
    if (!ticker) {
      return res.status(400).json({ 
        error: 'Ticker parameter required',
        example: '/api/insider-trades?ticker=TSLA',
        supportedTickers: Object.keys(COMPANY_CIKS)
      });
    }
    
    // Spezifischer Ticker
    const cik = await getCIKFromTicker(ticker);
    if (!cik) {
      return res.status(404).json({ 
        error: `CIK not found for ticker: ${ticker}`,
        supportedTickers: Object.keys(COMPANY_CIKS)
      });
    }
    
    const submissions = await fetchCompanySubmissions(cik);
    
    // Filtere Form 4 Filings
    const form4Indices = [];
    submissions.filings.recent.form.forEach((form, index) => {
      if (form === '4' || form === '4/A') {
        form4Indices.push(index);
      }
    });
    
    if (form4Indices.length === 0) {
      return res.json({
        success: true,
        count: 0,
        trades: [],
        message: `No Form 4 filings found for ${ticker}`,
        ticker: ticker.toUpperCase(),
        cik
      });
    }
    
    const allTrades = [];
    const maxFilings = Math.min(form4Indices.length, parseInt(limit));
    
    for (let i = 0; i < maxFilings; i++) {
      const idx = form4Indices[i];
      const accessionNumber = submissions.filings.recent.accessionNumber[idx];
      
      try {
        const trades = await fetchForm4XML(accessionNumber, cik);
        if (trades && trades.length > 0) {
          allTrades.push(...trades);
        }
      } catch (error) {
        console.warn(`Failed to parse filing ${accessionNumber}:`, error.message);
      }
    }
    
    // Sortiere nach Datum (neueste zuerst)
    allTrades.sort((a, b) => new Date(b.transactionDate) - new Date(a.transactionDate));
    
    res.json({
      success: true,
      ticker: ticker.toUpperCase(),
      cik,
      count: allTrades.length,
      trades: allTrades,
      source: 'SEC EDGAR API',
      filings_checked: maxFilings
    });
    
  } catch (error) {
    console.error('API Error:', error);
    
    res.status(500).json({ 
      success: false,
      error: error.message,
      details: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
}
