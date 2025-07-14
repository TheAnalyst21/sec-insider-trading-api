// api/insider-trades.js - VERBESSERTE VERSION MIT DEBUGGING
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
    
    return null; // Für Debug erstmal nur bekannte CIKs
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
      
      console.log(`Fetching XML: ${xmlUrl}`);
      const response = await fetchWithRetry(xmlUrl);
      const xmlText = await response.text();
      
      console.log(`XML Response length: ${xmlText.length}`);
      console.log(`XML Preview: ${xmlText.substring(0, 500)}...`);
      
      const parsedData = await parseForm4XML(xmlText, accessionNumber);
      
      cache.set(cacheKey, { data: parsedData, timestamp: Date.now() });
      return parsedData;
    } catch (error) {
      console.warn('XML fetch failed for', accessionNumber, error.message);
      return { error: error.message, accessionNumber };
    }
  }

  async function parseForm4XML(xmlText, accessionNumber) {
    try {
      // Zuerst rohe XML Struktur analysieren
      console.log(`\n=== PARSING XML FOR ${accessionNumber} ===`);
      
      const parser = new xml2js.Parser({ 
        explicitArray: false,
        mergeAttrs: false,
        normalizeTags: false,
        normalize: false,
        trim: true,
        explicitRoot: true
      });
      
      const result = await parser.parseStringPromise(xmlText);
      console.log('Root keys:', Object.keys(result));
      
      // Finde das ownership document
      let doc;
      if (result.ownershipDocument) {
        doc = result.ownershipDocument;
        console.log('Found ownershipDocument');
      } else if (result.OwnershipDocument) {
        doc = result.OwnershipDocument;
        console.log('Found OwnershipDocument');
      } else {
        console.log('Available root keys:', Object.keys(result));
        return { error: 'No ownership document found', structure: Object.keys(result) };
      }
      
      console.log('Document keys:', Object.keys(doc));
      
      // Parse Reporting Person Info
      const reportingOwner = doc.reportingOwner || doc.ReportingOwner;
      if (!reportingOwner) {
        console.log('No reporting owner found');
        return { error: 'No reporting owner found', docKeys: Object.keys(doc) };
      }
      
      console.log('Reporting owner keys:', Object.keys(reportingOwner));
      
      const reportingOwnerId = reportingOwner.reportingOwnerId || reportingOwner.ReportingOwnerId || {};
      const relationship = reportingOwner.reportingOwnerRelationship || reportingOwner.ReportingOwnerRelationship || {};
      
      const personName = (reportingOwnerId.rptOwnerName || reportingOwnerId.RptOwnerName || 'Unknown').trim();
      
      // Relationship parsing
      const isDirector = (relationship.isDirector || relationship.IsDirector) === '1';
      const isOfficer = (relationship.isOfficer || relationship.IsOfficer) === '1';
      const isTenPercentOwner = (relationship.isTenPercentOwner || relationship.IsTenPercentOwner) === '1';
      const officerTitle = (relationship.officerTitle || relationship.OfficerTitle || '').trim();
      
      let title = '';
      if (isDirector) title = 'Director';
      if (isOfficer && officerTitle) title = officerTitle;
      if (isTenPercentOwner) title = title ? title + ', 10% Owner' : '10% Owner';
      if (!title) title = 'Insider';
      
      console.log(`Person: ${personName}, Title: ${title}`);
      
      // Parse Company Info
      const issuer = doc.issuer || doc.Issuer || {};
      const companyName = (issuer.issuerName || issuer.IssuerName || 'Unknown Company').trim();
      const ticker = (issuer.issuerTradingSymbol || issuer.IssuerTradingSymbol || '').trim();
      
      console.log(`Company: ${companyName} (${ticker})`);
      
      // Parse Filing Date
      const filingDate = doc.documentDate || doc.DocumentDate || doc.periodOfReport || '';
      console.log(`Filing Date: ${filingDate}`);
      
      // Parse Non-Derivative Transactions
      const transactions = [];
      let nonDerivativeTable = doc.nonDerivativeTable || doc.NonDerivativeTable;
      
      if (nonDerivativeTable) {
        console.log('Non-derivative table found');
        let nonDerivativeTransactions = nonDerivativeTable.nonDerivativeTransaction || nonDerivativeTable.NonDerivativeTransaction;
        
        // Normalisiere zu Array
        if (!Array.isArray(nonDerivativeTransactions)) {
          nonDerivativeTransactions = nonDerivativeTransactions ? [nonDerivativeTransactions] : [];
        }
        
        console.log(`Found ${nonDerivativeTransactions.length} transactions`);
        
        nonDerivativeTransactions.forEach((transaction, index) => {
          if (!transaction) return;
          
          try {
            console.log(`\n--- Transaction ${index + 1} ---`);
            console.log('Transaction keys:', Object.keys(transaction));
            
            const securityTitle = (
              transaction.securityTitle?.value || 
              transaction.SecurityTitle?.Value || 
              transaction.securityTitle || 
              'Common Stock'
            ).trim();
            
            const transactionDate = (
              transaction.transactionDate?.value || 
              transaction.TransactionDate?.Value ||
              transaction.transactionDate ||
              ''
            ).trim();
            
            const transactionCoding = transaction.transactionCoding || transaction.TransactionCoding || {};
            const transactionCode = (
              transactionCoding.transactionCode || 
              transactionCoding.TransactionCode ||
              transactionCoding.code ||
              ''
            ).trim();
            
            console.log(`Security: ${securityTitle}, Date: ${transactionDate}, Code: ${transactionCode}`);
            
            const amounts = transaction.transactionAmounts || transaction.TransactionAmounts;
            if (!amounts) {
              console.log('No transaction amounts found');
              return;
            }
            
            console.log('Amounts keys:', Object.keys(amounts));
            
            const sharesField = amounts.transactionShares || amounts.TransactionShares;
            const shares = parseFloat(
              sharesField?.value || 
              sharesField?.Value ||
              sharesField ||
              '0'
            );
            
            const priceField = amounts.transactionPricePerShare || amounts.TransactionPricePerShare;
            const price = parseFloat(
              priceField?.value || 
              priceField?.Value ||
              priceField ||
              '0'
            );
            
            const disposalField = amounts.transactionAcquiredDisposedCode || amounts.TransactionAcquiredDisposedCode;
            const acquiredDisposedCode = (
              disposalField?.value || 
              disposalField?.Value ||
              disposalField ||
              ''
            ).trim();
            
            console.log(`Shares: ${shares}, Price: ${price}, A/D Code: ${acquiredDisposedCode}`);
            
            const postTransaction = transaction.postTransactionAmounts || transaction.PostTransactionAmounts;
            let sharesAfter = 0;
            if (postTransaction) {
              const sharesAfterField = postTransaction.sharesOwnedFollowingTransaction || 
                                     postTransaction.SharesOwnedFollowingTransaction;
              sharesAfter = parseFloat(
                sharesAfterField?.value || 
                sharesAfterField?.Value ||
                sharesAfterField ||
                '0'
              );
            }
            
            console.log(`Shares After: ${sharesAfter}`);
            
            if (shares > 0 && !isNaN(shares)) {
              const trade = {
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
                ownershipForm: 'D', // Default to Direct
                footnotes: null
              };
              
              transactions.push(trade);
              console.log('✅ Valid transaction added');
            } else {
              console.log('❌ Invalid transaction (shares <= 0 or NaN)');
            }
          } catch (parseError) {
            console.warn('Error parsing individual transaction:', parseError.message);
          }
        });
      } else {
        console.log('No non-derivative table found');
        console.log('Available doc keys:', Object.keys(doc));
      }
      
      console.log(`\n=== FINAL RESULT: ${transactions.length} transactions ===`);
      
      return { 
        transactions, 
        debug: {
          personName,
          companyName,
          ticker,
          filingDate,
          transactionCount: transactions.length
        }
      };
      
    } catch (error) {
      console.error('XML parsing error:', error.message);
      return { 
        error: `XML parsing failed: ${error.message}`, 
        rawXmlPreview: xmlText.substring(0, 1000) 
      };
    }
  }

  // Haupthandler
  try {
    const { ticker, latest, limit = 10, debug = false } = req.query;
    
    if (latest === 'true') {
      // Lade neueste Filings für bekannte Unternehmen mit Insider-Aktivität
      const activeTickerList = ['BTBT', 'NVDA', 'AMD', 'CRM']; // Unternehmen mit bekannter Aktivität
      const allTrades = [];
      const debugInfo = [];
      
      for (const t of activeTickerList) {
        try {
          const cik = await getCIKFromTicker(t);
          if (!cik) continue;
          
          const submissions = await fetchCompanySubmissions(cik);
          
          // Finde Form 4 Filings (erweitert auf mehr als nur das neueste)
          const form4Indices = [];
          submissions.filings.recent.form.forEach((form, index) => {
            if (form === '4' || form === '4/A') {
              form4Indices.push(index);
            }
          });
          
          if (form4Indices.length > 0) {
            // Nehme die neuesten 3 Form 4s für bessere Chance auf Daten
            const maxToCheck = Math.min(form4Indices.length, 3);
            
            for (let i = 0; i < maxToCheck; i++) {
              const idx = form4Indices[i];
              const accessionNumber = submissions.filings.recent.accessionNumber[idx];
              const filingDate = submissions.filings.recent.reportDate[idx];
              
              const result = await fetchForm4XML(accessionNumber, cik);
              
              if (result && result.transactions) {
                allTrades.push(...result.transactions);
                debugInfo.push({
                  ticker: t,
                  accessionNumber,
                  filingDate,
                  transactionCount: result.transactions.length,
                  debug: result.debug
                });
              } else if (result && result.error) {
                debugInfo.push({
                  ticker: t,
                  accessionNumber,
                  error: result.error
                });
              }
            }
          }
        } catch (error) {
          console.warn(`Failed to load ${t}:`, error.message);
          debugInfo.push({
            ticker: t,
            error: error.message
          });
        }
      }
      
      // Sortiere nach Datum (neueste zuerst)
      allTrades.sort((a, b) => new Date(b.transactionDate) - new Date(a.transactionDate));
      
      return res.json({
        success: true,
        count: allTrades.length,
        trades: allTrades.slice(0, parseInt(limit)),
        source: 'SEC EDGAR API',
        cached: false,
        debug: debug === 'true' ? debugInfo : undefined,
        message: allTrades.length === 0 ? 'No recent insider transactions found. This is normal - insider trading is not daily activity.' : undefined
      });
    }
    
    if (!ticker) {
      return res.status(400).json({ 
        error: 'Ticker parameter required',
        example: '/api/insider-trades?ticker=BTBT',
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
        cik,
        availableFilings: submissions.filings.recent.form.slice(0, 10)
      });
    }
    
    const allTrades = [];
    const debugInfo = [];
    const maxFilings = Math.min(form4Indices.length, parseInt(limit));
    
    for (let i = 0; i < maxFilings; i++) {
      const idx = form4Indices[i];
      const accessionNumber = submissions.filings.recent.accessionNumber[idx];
      const filingDate = submissions.filings.recent.reportDate[idx];
      
      try {
        const result = await fetchForm4XML(accessionNumber, cik);
        
        if (result && result.transactions) {
          allTrades.push(...result.transactions);
          debugInfo.push({
            accessionNumber,
            filingDate,
            transactionCount: result.transactions.length,
            debug: result.debug
          });
        } else if (result && result.error) {
          debugInfo.push({
            accessionNumber,
            filingDate,
            error: result.error
          });
        }
      } catch (error) {
        console.warn(`Failed to parse filing ${accessionNumber}:`, error.message);
        debugInfo.push({
          accessionNumber,
          error: error.message
        });
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
      filings_checked: maxFilings,
      debug: debug === 'true' ? debugInfo : undefined
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
