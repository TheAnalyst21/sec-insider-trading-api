// api/insider-trades.js - UNIVERSELLE VERSION FÜR ALLE UNTERNEHMEN
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

  // Erweiterte CIK Liste
  const COMPANY_CIKS = {
    'TSLA': '0001318605',
    'AAPL': '0000320193', 
    'MSFT': '0000789019',
    'NVDA': '0001045810',
    'BTBT': '0001710350',
    'AMD': '0000002488',
    'META': '0001326801',
    'GOOGL': '0001652044',
    'AMZN': '0001018724',
    'NFLX': '0001065280',
    'CRM': '0001108524',
    'ADBE': '0000796343',
    'INTC': '0000050863',
    'ORCL': '0001341439'
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

  // UNIVERSELLER XML PARSER - Funktioniert mit allen Varianten
  function parseForm4XML(xmlText, accessionNumber) {
    try {
      // Entferne Namespaces und normalisiere XML
      const cleanXML = xmlText
        .replace(/xmlns[^=]*="[^"]*"/g, '')
        .replace(/\s+/g, ' ')
        .replace(/>\s+</g, '><');
      
      // Multi-Pattern Extraktion für maximale Kompatibilität
      const extractValue = (patterns, text, defaultValue = null) => {
        for (const pattern of patterns) {
          const match = text.match(pattern);
          if (match && match[1]) {
            return match[1].trim();
          }
        }
        return defaultValue;
      };
      
      // Person Name - Multiple Patterns
      const personPatterns = [
        /<rptOwnerName[^>]*>([^<]+)<\/rptOwnerName>/i,
        /<reportingOwnerId[^>]*>[\s\S]*?<rptOwnerName[^>]*>([^<]+)<\/rptOwnerName>/i,
        /<rptOwnername[^>]*>([^<]+)<\/rptOwnername>/i,
        /<name[^>]*>([^<]+)<\/name>/i
      ];
      const personName = extractValue(personPatterns, cleanXML, 'Unknown Insider');
      
      // Title Determination - Robust Logic
      let title = 'Insider';
      const isDirector = cleanXML.includes('<isDirector>1</isDirector>') || cleanXML.includes('<isdirector>1</isdirector>');
      const isOfficer = cleanXML.includes('<isOfficer>1</isOfficer>') || cleanXML.includes('<isofficer>1</isofficer>');
      const isTenPercent = cleanXML.includes('<isTenPercentOwner>1</isTenPercentOwner>') || cleanXML.includes('<istenpercentowner>1</istenpercentowner>');
      
      if (isDirector) title = 'Director';
      if (isOfficer) {
        const titlePatterns = [
          /<officerTitle[^>]*>([^<]+)<\/officerTitle>/i,
          /<officertitle[^>]*>([^<]+)<\/officertitle>/i,
          /<title[^>]*>([^<]+)<\/title>/i
        ];
        const officerTitle = extractValue(titlePatterns, cleanXML);
        if (officerTitle) title = officerTitle;
      }
      if (isTenPercent) {
        title = title === 'Insider' ? '10% Owner' : title + ', 10% Owner';
      }
      
      // Company Info - Multiple Patterns
      const companyPatterns = [
        /<issuerName[^>]*>([^<]+)<\/issuerName>/i,
        /<issuername[^>]*>([^<]+)<\/issuername>/i,
        /<companyName[^>]*>([^<]+)<\/companyName>/i
      ];
      const companyName = extractValue(companyPatterns, cleanXML, 'Unknown Company');
      
      const tickerPatterns = [
        /<issuerTradingSymbol[^>]*>([^<]+)<\/issuerTradingSymbol>/i,
        /<issuertradingsymbol[^>]*>([^<]+)<\/issuertradingsymbol>/i,
        /<tradingSymbol[^>]*>([^<]+)<\/tradingSymbol>/i,
        /<symbol[^>]*>([^<]+)<\/symbol>/i
      ];
      const ticker = extractValue(tickerPatterns, cleanXML, '');
      
      // Filing Date - Multiple Patterns
      const datePatterns = [
        /<documentDate[^>]*>([^<]+)<\/documentDate>/i,
        /<periodOfReport[^>]*>([^<]+)<\/periodOfReport>/i,
        /<filingDate[^>]*>([^<]+)<\/filingDate>/i,
        /<reportDate[^>]*>([^<]+)<\/reportDate>/i
      ];
      const filingDate = extractValue(datePatterns, cleanXML, new Date().toISOString().split('T')[0]);
      
      // Transaktionen extrahieren - Ultra-robuste Methode
      const transactions = [];
      
      // Multiple Transaction Block Patterns
      const transactionBlockPatterns = [
        /<nonDerivativeTransaction[^>]*>([\s\S]*?)<\/nonDerivativeTransaction>/gi,
        /<nonderivativetransaction[^>]*>([\s\S]*?)<\/nonderivativetransaction>/gi,
        /<transaction[^>]*>([\s\S]*?)<\/transaction>/gi
      ];
      
      for (const pattern of transactionBlockPatterns) {
        let transactionMatch;
        pattern.lastIndex = 0; // Reset regex
        
        while ((transactionMatch = pattern.exec(cleanXML)) !== null) {
          const transactionXML = transactionMatch[1];
          
          try {
            // Transaction Date
            const transDatePatterns = [
              /<transactionDate[^>]*>[\s\S]*?<value[^>]*>([^<]+)<\/value>/i,
              /<transactiondate[^>]*>[\s\S]*?<value[^>]*>([^<]+)<\/value>/i,
              /<transactionDate[^>]*>([^<]+)<\/transactionDate>/i,
              /<date[^>]*>([^<]+)<\/date>/i
            ];
            const transactionDate = extractValue(transDatePatterns, transactionXML, filingDate);
            
            // Transaction Code
            const codePatterns = [
              /<transactionCode[^>]*>([^<]+)<\/transactionCode>/i,
              /<code[^>]*>([^<]+)<\/code>/i,
              /<transactioncoding[^>]*>[\s\S]*?<transactioncode[^>]*>([^<]+)<\/transactioncode>/i
            ];
            const transactionCode = extractValue(codePatterns, transactionXML, 'P');
            
            // Shares - Multiple Patterns
            const sharesPatterns = [
              /<transactionShares[^>]*>[\s\S]*?<value[^>]*>([0-9.,]+)<\/value>/i,
              /<transactionshares[^>]*>[\s\S]*?<value[^>]*>([0-9.,]+)<\/value>/i,
              /<shares[^>]*>[\s\S]*?<value[^>]*>([0-9.,]+)<\/value>/i,
              /<transactionShares[^>]*>([0-9.,]+)<\/transactionShares>/i,
              /<shares[^>]*>([0-9.,]+)<\/shares>/i,
              /<amount[^>]*>([0-9.,]+)<\/amount>/i
            ];
            const sharesStr = extractValue(sharesPatterns, transactionXML);
            const shares = sharesStr ? parseFloat(sharesStr.replace(/,/g, '')) : 0;
            
            // Price - Multiple Patterns
            const pricePatterns = [
              /<transactionPricePerShare[^>]*>[\s\S]*?<value[^>]*>([0-9.,]+)<\/value>/i,
              /<transactionpricepershare[^>]*>[\s\S]*?<value[^>]*>([0-9.,]+)<\/value>/i,
              /<price[^>]*>[\s\S]*?<value[^>]*>([0-9.,]+)<\/value>/i,
              /<transactionPricePerShare[^>]*>([0-9.,]+)<\/transactionPricePerShare>/i,
              /<price[^>]*>([0-9.,]+)<\/price>/i,
              /<pricePerShare[^>]*>([0-9.,]+)<\/pricePerShare>/i
            ];
            const priceStr = extractValue(pricePatterns, transactionXML);
            const price = priceStr ? parseFloat(priceStr.replace(/,/g, '')) : 0;
            
            // Acquired/Disposed Code
            const acquiredPatterns = [
              /<transactionAcquiredDisposedCode[^>]*>[\s\S]*?<value[^>]*>([AD])<\/value>/i,
              /<transactionacquireddisposedcode[^>]*>[\s\S]*?<value[^>]*>([AD])<\/value>/i,
              /<acquiredDisposed[^>]*>([AD])<\/acquiredDisposed>/i,
              /<transactionAcquiredDisposedCode[^>]*>([AD])<\/transactionAcquiredDisposedCode>/i
            ];
            const acquiredDisposed = extractValue(acquiredPatterns, transactionXML, 'A');
            
            // Shares After Transaction
            const sharesAfterPatterns = [
              /<sharesOwnedFollowingTransaction[^>]*>[\s\S]*?<value[^>]*>([0-9.,]+)<\/value>/i,
              /<sharesownedfollotransaction[^>]*>[\s\S]*?<value[^>]*>([0-9.,]+)<\/value>/i,
              /<sharesAfter[^>]*>([0-9.,]+)<\/sharesAfter>/i,
              /<sharesOwnedFollowingTransaction[^>]*>([0-9.,]+)<\/sharesOwnedFollowingTransaction>/i,
              /<sharesOwned[^>]*>([0-9.,]+)<\/sharesOwned>/i
            ];
            const sharesAfterStr = extractValue(sharesAfterPatterns, transactionXML);
            const sharesAfter = sharesAfterStr ? parseFloat(sharesAfterStr.replace(/,/g, '')) : 0;
            
            // Security Title
            const securityPatterns = [
              /<securityTitle[^>]*>[\s\S]*?<value[^>]*>([^<]+)<\/value>/i,
              /<securitytitle[^>]*>[\s\S]*?<value[^>]*>([^<]+)<\/value>/i,
              /<securityTitle[^>]*>([^<]+)<\/securityTitle>/i,
              /<security[^>]*>([^<]+)<\/security>/i
            ];
            const securityTitle = extractValue(securityPatterns, transactionXML, 'Common Stock');
            
            // Validation und Transaction hinzufügen
            if (shares > 0 && !isNaN(shares) && price >= 0 && !isNaN(price)) {
              transactions.push({
                personName,
                title,
                companyName,
                ticker,
                shares: Math.round(shares),
                price: Math.round(price * 100) / 100,
                totalValue: Math.round(shares * price),
                sharesAfter: Math.round(sharesAfter),
                transactionDate,
                filingDate,
                transactionType: acquiredDisposed,
                transactionCode,
                securityTitle,
                ownershipForm: 'D',
                footnotes: null
              });
            }
          } catch (parseError) {
            console.warn(`Error parsing transaction in ${accessionNumber}:`, parseError.message);
          }
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
          xmlLength: cleanXML.length,
          accessionNumber
        }
      };
      
    } catch (error) {
      console.error(`XML parsing error for ${accessionNumber}:`, error.message);
      return {
        success: false,
        error: error.message,
        transactions: [],
        accessionNumber
      };
    }
  }

  try {
    const { ticker, latest, limit = 10, debug = false, test = false } = req.query;
    
    // TEST MODE - Teste alle Unternehmen
    if (test === 'true') {
      const testResults = {};
      const testTickers = ['BTBT', 'NVDA', 'AMD', 'TSLA', 'AAPL'];
      
      for (const testTicker of testTickers) {
        try {
          const cik = COMPANY_CIKS[testTicker];
          if (!cik) continue;
          
          const submissionsUrl = `https://data.sec.gov/submissions/CIK${cik}.json`;
          const submissionsResponse = await fetchWithRetry(submissionsUrl);
          const submissionsData = await submissionsResponse.json();
          
          const form4Indices = [];
          submissionsData.filings.recent.form.forEach((form, index) => {
            if (form === '4' || form === '4/A') {
              form4Indices.push(index);
            }
          });
          
          testResults[testTicker] = {
            cik,
            form4FilingsFound: form4Indices.length,
            companyName: submissionsData.name,
            status: form4Indices.length > 0 ? 'Has Form 4s' : 'No Form 4s',
            latestForm4Date: form4Indices.length > 0 ? submissionsData.filings.recent.reportDate[form4Indices[0]] : null
          };
          
          // Teste XML Parsing für ersten Form 4
          if (form4Indices.length > 0) {
            try {
              const accessionNumber = submissionsData.filings.recent.accessionNumber[form4Indices[0]];
              const cleanAccession = accessionNumber.replace(/-/g, '');
              const xmlUrl = `https://www.sec.gov/Archives/edgar/data/${parseInt(cik)}/${cleanAccession}/ownership.xml`;
              
              const xmlResponse = await fetchWithRetry(xmlUrl);
              const xmlText = await xmlResponse.text();
              const parseResult = parseForm4XML(xmlText, accessionNumber);
              
              testResults[testTicker].xmlParseStatus = parseResult.success ? 'Success' : 'Failed';
              testResults[testTicker].transactionsFound = parseResult.transactions.length;
              testResults[testTicker].samplePerson = parseResult.debug?.personName || 'Unknown';
            } catch (xmlError) {
              testResults[testTicker].xmlParseStatus = 'XML Fetch Failed';
              testResults[testTicker].xmlError = xmlError.message;
            }
          }
        } catch (error) {
          testResults[testTicker] = {
            status: 'Error',
            error: error.message
          };
        }
      }
      
      return res.json({
        success: true,
        testMode: true,
        results: testResults,
        summary: {
          totalTested: testTickers.length,
          withForm4s: Object.values(testResults).filter(r => r.form4FilingsFound > 0).length,
          xmlParseSuccess: Object.values(testResults).filter(r => r.xmlParseStatus === 'Success').length
        }
      });
    }
    
    if (latest === 'true') {
      // Robuste Multi-Company Suche
      const activeCompanies = ['BTBT', 'NVDA', 'AMD', 'CRM', 'TSLA'];
      const allTrades = [];
      const debugInfo = [];
      
      for (const t of activeCompanies) {
        try {
          const cik = COMPANY_CIKS[t];
          if (!cik) continue;
          
          const submissionsUrl = `https://data.sec.gov/submissions/CIK${cik}.json`;
          const submissionsResponse = await fetchWithRetry(submissionsUrl);
          const submissionsData = await submissionsResponse.json();
          
          const form4Indices = [];
          submissionsData.filings.recent.form.forEach((form, index) => {
            if (form === '4' || form === '4/A') {
              form4Indices.push(index);
            }
          });
          
          if (form4Indices.length > 0) {
            const maxToLoad = Math.min(form4Indices.length, 2);
            
            for (let i = 0; i < maxToLoad; i++) {
              const idx = form4Indices[i];
              const accessionNumber = submissionsData.filings.recent.accessionNumber[idx];
              
              try {
                const cleanAccession = accessionNumber.replace(/-/g, '');
                const xmlUrl = `https://www.sec.gov/Archives/edgar/data/${parseInt(cik)}/${cleanAccession}/ownership.xml`;
                
                const xmlResponse = await fetchWithRetry(xmlUrl);
                const xmlText = await xmlResponse.text();
                const parseResult = parseForm4XML(xmlText, accessionNumber);
                
                if (parseResult.success && parseResult.transactions.length > 0) {
                  allTrades.push(...parseResult.transactions);
                  debugInfo.push({
                    ticker: t,
                    accessionNumber,
                    transactionCount: parseResult.transactions.length,
                    personName: parseResult.debug.personName,
                    status: 'Success'
                  });
                } else {
                  debugInfo.push({
                    ticker: t,
                    accessionNumber,
                    status: 'No Transactions',
                    error: parseResult.error
                  });
                }
              } catch (xmlError) {
                debugInfo.push({
                  ticker: t,
                  accessionNumber,
                  status: 'XML Error',
                  error: xmlError.message
                });
              }
            }
          } else {
            debugInfo.push({
              ticker: t,
              status: 'No Form 4s Found',
              form4Count: 0
            });
          }
        } catch (error) {
          debugInfo.push({
            ticker: t,
            status: 'API Error',
            error: error.message
          });
        }
      }
      
      allTrades.sort((a, b) => new Date(b.transactionDate) - new Date(a.transactionDate));
      
      return res.json({
        success: true,
        count: allTrades.length,
        trades: allTrades.slice(0, parseInt(limit)),
        source: 'SEC EDGAR API - Universal Parser',
        debug: debug === 'true' ? debugInfo : undefined
      });
    }
    
    if (!ticker) {
      return res.status(400).json({ 
        error: 'Ticker parameter required',
        example: '/api/insider-trades?ticker=BTBT&debug=true',
        testMode: '/api/insider-trades?test=true',
        supportedTickers: Object.keys(COMPANY_CIKS)
      });
    }
    
    // Einzelner Ticker - Universelle Behandlung
    const cik = COMPANY_CIKS[ticker.toUpperCase()];
    if (!cik) {
      return res.status(404).json({ 
        error: `Ticker ${ticker} not found`,
        supportedTickers: Object.keys(COMPANY_CIKS)
      });
    }
    
    const submissionsUrl = `https://data.sec.gov/submissions/CIK${cik}.json`;
    const submissionsResponse = await fetchWithRetry(submissionsUrl);
    const submissionsData = await submissionsResponse.json();
    
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
        form4Count: 0,
        companyName: submissionsData.name
      });
    }
    
    const allTrades = [];
    const debugInfo = [];
    const maxFilings = Math.min(form4Indices.length, parseInt(limit));
    
    for (let i = 0; i < maxFilings; i++) {
      const idx = form4Indices[i];
      const accessionNumber = submissionsData.filings.recent.accessionNumber[idx];
      const reportDate = submissionsData.filings.recent.reportDate[idx];
      
      try {
        const cleanAccession = accessionNumber.replace(/-/g, '');
        const xmlUrl = `https://www.sec.gov/Archives/edgar/data/${parseInt(cik)}/${cleanAccession}/ownership.xml`;
        
        const xmlResponse = await fetchWithRetry(xmlUrl);
        const xmlText = await xmlResponse.text();
        const parseResult = parseForm4XML(xmlText, accessionNumber);
        
        if (parseResult.success && parseResult.transactions.length > 0) {
          allTrades.push(...parseResult.transactions);
          debugInfo.push({
            accessionNumber,
            reportDate,
            transactionCount: parseResult.transactions.length,
            personName: parseResult.debug.personName,
            status: 'Success',
            xmlUrl: xmlUrl
          });
        } else {
          debugInfo.push({
            accessionNumber,
            reportDate,
            status: 'No Transactions Parsed',
            error: parseResult.error,
            xmlUrl: xmlUrl
          });
        }
      } catch (error) {
        debugInfo.push({
          accessionNumber,
          reportDate,
          status: 'Error',
          error: error.message
        });
      }
    }
    
    allTrades.sort((a, b) => new Date(b.transactionDate) - new Date(a.transactionDate));
    
    res.json({
      success: true,
      ticker: ticker.toUpperCase(),
      cik,
      count: allTrades.length,
      trades: allTrades,
      source: 'SEC EDGAR API - Universal Parser',
      form4Count: form4Indices.length,
      companyName: submissionsData.name,
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
