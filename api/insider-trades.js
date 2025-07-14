// api/insider-trades.js - 100% ECHTE SEC DATEN
export default async function handler(req, res) {
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

  // Bekannte CIKs
  const COMPANY_CIKS = {
    'TSLA': '0001318605',
    'AAPL': '0000320193', 
    'MSFT': '0000789019',
    'NVDA': '0001045810',
    'BTBT': '0001710350',
    'AMD': '0000002488',
    'META': '0001326801',
    'GOOGL': '0001652044',
    'AMZN': '0001018724'
  };

  async function fetchWithRetry(url, retries = 2) {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'SEC-API contact@yoursite.com',
            'Accept': 'application/json, text/xml, */*'
          }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return response;
      } catch (error) {
        if (i === retries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  // ECHTES XML PARSING - Robuste Version
  function parseForm4XML(xmlText) {
    try {
      // Suche nach wichtigen Daten mit Regex (robuster als XML Parser)
      const extractValue = (pattern, text) => {
        const match = text.match(pattern);
        return match ? match[1].trim() : null;
      };
      
      // Person Info extrahieren
      const personName = extractValue(/<rptOwnerName[^>]*>([^<]+)<\/rptOwnerName>/, xmlText) ||
                        extractValue(/<reportingOwnerId[^>]*>[\s\S]*?<rptOwnerName[^>]*>([^<]+)<\/rptOwnerName>/, xmlText) ||
                        'Unknown Insider';
      
      // Title extrahieren
      let title = 'Insider';
      if (xmlText.includes('<isDirector>1</isDirector>')) {
        title = 'Director';
      }
      if (xmlText.includes('<isOfficer>1</isOfficer>')) {
        const officerTitle = extractValue(/<officerTitle[^>]*>([^<]+)<\/officerTitle>/, xmlText);
        if (officerTitle) title = officerTitle;
      }
      if (xmlText.includes('<isTenPercentOwner>1</isTenPercentOwner>')) {
        title = title === 'Insider' ? '10% Owner' : title + ', 10% Owner';
      }
      
      // Company Info
      const companyName = extractValue(/<issuerName[^>]*>([^<]+)<\/issuerName>/, xmlText) || 'Unknown Company';
      const ticker = extractValue(/<issuerTradingSymbol[^>]*>([^<]+)<\/issuerTradingSymbol>/, xmlText) || '';
      
      // Datum
      const filingDate = extractValue(/<documentDate[^>]*>([^<]+)<\/documentDate>/, xmlText) || 
                        extractValue(/<periodOfReport[^>]*>([^<]+)<\/periodOfReport>/, xmlText) || 
                        new Date().toISOString().split('T')[0];
      
      // Transaktionen extrahieren
      const transactions = [];
      
      // Suche nach nonDerivativeTransaction Blöcken
      const transactionPattern = /<nonDerivativeTransaction[^>]*>([\s\S]*?)<\/nonDerivativeTransaction>/g;
      let transactionMatch;
      
      while ((transactionMatch = transactionPattern.exec(xmlText)) !== null) {
        const transactionXML = transactionMatch[1];
        
        try {
          // Extrahiere Transaktionsdetails
          const transactionDate = extractValue(/<transactionDate[^>]*>[\s\S]*?<value[^>]*>([^<]+)<\/value>/, transactionXML) ||
                                 extractValue(/<transactionDate[^>]*>([^<]+)<\/transactionDate>/, transactionXML) ||
                                 filingDate;
          
          const transactionCode = extractValue(/<transactionCode[^>]*>([^<]+)<\/transactionCode>/, transactionXML) ||
                                 extractValue(/<code[^>]*>([^<]+)<\/code>/, transactionXML) || 'P';
          
          // Aktienanzahl
          const sharesStr = extractValue(/<transactionShares[^>]*>[\s\S]*?<value[^>]*>([^<]+)<\/value>/, transactionXML) ||
                           extractValue(/<transactionShares[^>]*>([^<]+)<\/transactionShares>/, transactionXML);
          const shares = sharesStr ? parseFloat(sharesStr.replace(/,/g, '')) : 0;
          
          // Preis
          const priceStr = extractValue(/<transactionPricePerShare[^>]*>[\s\S]*?<value[^>]*>([^<]+)<\/value>/, transactionXML) ||
                          extractValue(/<transactionPricePerShare[^>]*>([^<]+)<\/transactionPricePerShare>/, transactionXML);
          const price = priceStr ? parseFloat(priceStr.replace(/,/g, '')) : 0;
          
          // Acquired/Disposed Code
          const acquiredDisposed = extractValue(/<transactionAcquiredDisposedCode[^>]*>[\s\S]*?<value[^>]*>([^<]+)<\/value>/, transactionXML) ||
                                  extractValue(/<transactionAcquiredDisposedCode[^>]*>([^<]+)<\/transactionAcquiredDisposedCode>/, transactionXML) || 'A';
          
          // Shares After Transaction
          const sharesAfterStr = extractValue(/<sharesOwnedFollowingTransaction[^>]*>[\s\S]*?<value[^>]*>([^<]+)<\/value>/, transactionXML) ||
                                extractValue(/<sharesOwnedFollowingTransaction[^>]*>([^<]+)<\/sharesOwnedFollowingTransaction>/, transactionXML);
          const sharesAfter = sharesAfterStr ? parseFloat(sharesAfterStr.replace(/,/g, '')) : 0;
          
          // Security Title
          const securityTitle = extractValue(/<securityTitle[^>]*>[\s\S]*?<value[^>]*>([^<]+)<\/value>/, transactionXML) ||
                               extractValue(/<securityTitle[^>]*>([^<]+)<\/securityTitle>/, transactionXML) || 'Common Stock';
          
          // Nur valide Transaktionen hinzufügen
          if (shares > 0 && price >= 0) {
            transactions.push({
              personName,
              title,
              companyName,
              ticker,
              shares: Math.round(shares),
              price: Math.round(price * 100) / 100, // 2 Dezimalstellen
              totalValue: Math.round(shares * price),
              sharesAfter: Math.round(sharesAfter),
              transactionDate,
              filingDate,
              transactionType: acquiredDisposed, // A = Acquired, D = Disposed
              transactionCode, // P = Purchase, S = Sale, etc.
              securityTitle,
              ownershipForm: 'D',
              footnotes: null
            });
          }
        } catch (parseError) {
          console.warn('Error parsing individual transaction:', parseError.message);
          // Fahre mit nächster Transaktion fort
        }
      }
      
      return {
        success: true,
        transactions,
        debug: {
          personName,
          title,
          companyName,
          ticker,
          filingDate,
          transactionCount: transactions.length,
          xmlLength: xmlText.length
        }
      };
      
    } catch (error) {
      console.error('XML parsing error:', error.message);
      return {
        success: false,
        error: error.message,
        transactions: []
      };
    }
  }

  try {
    const { ticker, latest, limit = 10, debug = false } = req.query;
    
    if (latest === 'true') {
      // Lade echte Daten für mehrere Unternehmen
      const activeCompanies = ['BTBT', 'NVDA', 'AMD', 'CRM'];
      const allTrades = [];
      const debugInfo = [];
      
      for (const t of activeCompanies) {
        try {
          const cik = COMPANY_CIKS[t];
          if (!cik) continue;
          
          // Submissions laden
          const submissionsUrl = `https://data.sec.gov/submissions/CIK${cik}.json`;
          const submissionsResponse = await fetchWithRetry(submissionsUrl);
          const submissionsData = await submissionsResponse.json();
          
          // Form 4 Filings finden
          const form4Indices = [];
          submissionsData.filings.recent.form.forEach((form, index) => {
            if (form === '4' || form === '4/A') {
              form4Indices.push(index);
            }
          });
          
          if (form4Indices.length > 0) {
            // Lade die neuesten 2 Form 4 XMLs
            const maxToLoad = Math.min(form4Indices.length, 2);
            
            for (let i = 0; i < maxToLoad; i++) {
              const idx = form4Indices[i];
              const accessionNumber = submissionsData.filings.recent.accessionNumber[idx];
              
              try {
                // XML URL konstruieren
                const cleanAccession = accessionNumber.replace(/-/g, '');
                const xmlUrl = `https://www.sec.gov/Archives/edgar/data/${parseInt(cik)}/${cleanAccession}/ownership.xml`;
                
                // XML laden und parsen
                const xmlResponse = await fetchWithRetry(xmlUrl);
                const xmlText = await xmlResponse.text();
                const parseResult = parseForm4XML(xmlText);
                
                if (parseResult.success && parseResult.transactions.length > 0) {
                  allTrades.push(...parseResult.transactions);
                  debugInfo.push({
                    ticker: t,
                    accessionNumber,
                    transactionCount: parseResult.transactions.length,
                    personName: parseResult.debug.personName
                  });
                }
              } catch (xmlError) {
                console.warn(`XML fetch failed for ${t}:`, xmlError.message);
              }
            }
          }
        } catch (error) {
          console.warn(`Failed to load ${t}:`, error.message);
        }
      }
      
      // Sortiere nach Datum (neueste zuerst)
      allTrades.sort((a, b) => new Date(b.transactionDate) - new Date(a.transactionDate));
      
      return res.json({
        success: true,
        count: allTrades.length,
        trades: allTrades.slice(0, parseInt(limit)),
        source: 'SEC EDGAR API - Real Data',
        debug: debug === 'true' ? debugInfo : undefined
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
    const cik = COMPANY_CIKS[ticker.toUpperCase()];
    if (!cik) {
      return res.status(404).json({ 
        error: `Ticker ${ticker} not found`,
        supportedTickers: Object.keys(COMPANY_CIKS)
      });
    }
    
    // Submissions laden
    const submissionsUrl = `https://data.sec.gov/submissions/CIK${cik}.json`;
    const submissionsResponse = await fetchWithRetry(submissionsUrl);
    const submissionsData = await submissionsResponse.json();
    
    // Form 4 Filings finden
    const form4Indices = [];
    submissionsData.filings.recent.form.forEach((form, index) => {
      if (form === '4' || form === '4/A') {
        form4Indices.push(index);
      }
    });
    
    if (form4Indices.length === 0) {
      return res.json({
        success: true,
        ticker: ticker.toUpperCase(),
        cik,
        count: 0,
        trades: [],
        message: `No Form 4 filings found for ${ticker}`,
        form4Count: 0
      });
    }
    
    // Lade und parse XML für echte Daten
    const allTrades = [];
    const debugInfo = [];
    const maxFilings = Math.min(form4Indices.length, parseInt(limit));
    
    for (let i = 0; i < maxFilings; i++) {
      const idx = form4Indices[i];
      const accessionNumber = submissionsData.filings.recent.accessionNumber[idx];
      const reportDate = submissionsData.filings.recent.reportDate[idx];
      
      try {
        // XML URL konstruieren
        const cleanAccession = accessionNumber.replace(/-/g, '');
        const xmlUrl = `https://www.sec.gov/Archives/edgar/data/${parseInt(cik)}/${cleanAccession}/ownership.xml`;
        
        // XML laden und parsen
        const xmlResponse = await fetchWithRetry(xmlUrl);
        const xmlText = await xmlResponse.text();
        const parseResult = parseForm4XML(xmlText);
        
        if (parseResult.success && parseResult.transactions.length > 0) {
          allTrades.push(...parseResult.transactions);
          debugInfo.push({
            accessionNumber,
            reportDate,
            transactionCount: parseResult.transactions.length,
            personName: parseResult.debug.personName,
            xmlUrl: xmlUrl
          });
        } else if (parseResult.error) {
          debugInfo.push({
            accessionNumber,
            error: parseResult.error
          });
        }
      } catch (error) {
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
      source: 'SEC EDGAR API - Real Data',
      form4Count: form4Indices.length,
      debug: debug === 'true' ? debugInfo : undefined
    });
    
  } catch (error) {
    console.error('API Error:', error);
    
    res.status(500).json({ 
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
