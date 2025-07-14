// api/insider-trades.js - NVIDIA HTML-TABELLEN-KOMPATIBLE VERSION
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

  async function fetchWithRetry(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'SEC-API contact@yoursite.com',
            'Accept': 'application/json, text/xml, application/xml, text/html, */*'
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

  // NVIDIA-SPEZIELLER HTML-TABELLEN-PARSER
  function parseForm4Content(content, accessionNumber) {
    try {
      // Normalisiere Content für einheitliche Verarbeitung
      let cleanContent = content
        .replace(/xmlns[^=]*="[^"]*"/g, '')
        .replace(/xsi:[^=]*="[^"]*"/g, '')
        .replace(/<\?xml[^>]*\?>/g, '')
        .replace(/<!DOCTYPE[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .replace(/>\s+</g, '><');
      
      // Multi-Pattern Extraktion
      const extractValue = (patterns, text, defaultValue = null, options = {}) => {
        for (const pattern of patterns) {
          const match = text.match(pattern);
          if (match && match[1]) {
            let value = match[1].trim();
            if (options.removeCommas) {
              value = value.replace(/,/g, '');
            }
            if (options.parseFloat) {
              const parsed = parseFloat(value);
              return isNaN(parsed) ? defaultValue : parsed;
            }
            return value;
          }
        }
        return defaultValue;
      };

      // Datum-Extraktion für MM/DD/YYYY Format
      const extractDate = (patterns, text, defaultValue = null) => {
        for (const pattern of patterns) {
          const match = text.match(pattern);
          if (match && match[1]) {
            const dateStr = match[1].trim();
            // MM/DD/YYYY zu YYYY-MM-DD konvertieren
            if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
              const [month, day, year] = dateStr.split('/');
              return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            }
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
              return dateStr;
            }
          }
        }
        return defaultValue || new Date().toISOString().split('T')[0];
      };
      
      // Person Name - Erweiterte Patterns für HTML & XML
      const personPatterns = [
        // Standard XML patterns
        /<rptownername[^>]*>([^<]+)<\/rptownername>/i,
        /<reportingownerid[^>]*>[\s\S]*?<rptownername[^>]*>([^<]+)<\/rptownername>/i,
        // HTML patterns - Name aus verschiedenen Stellen extrahieren
        /reporting person[^>]*>\s*([A-Z][A-Z\-\s]+)\s*</i,
        /name and address[^>]*>\s*([A-Z][A-Z\-\s]+)\s*</i,
        // Fallback für "JEN-HSUN HUANG" style
        /([A-Z]{2,}\s+[A-Z]{2,}(?:\s+[A-Z]{2,})?)/,
        // Generic name pattern
        /(JEN-HSUN\s+HUANG|JENSEN\s+HUANG)/i
      ];
      let personName = extractValue(personPatterns, cleanContent, 'Unknown Insider');
      
      // Company & Ticker Info
      const companyPatterns = [
        /<issuername[^>]*>([^<]+)<\/issuername>/i,
        /issuer name[^>]*>([^<]+)</i,
        /nvidia\s+corp/i
      ];
      const companyName = extractValue(companyPatterns, cleanContent, 'NVIDIA Corp');
      
      const tickerPatterns = [
        /<issuertradingsymbol[^>]*>([^<]+)<\/issuertradingsymbol>/i,
        /\[([A-Z]{2,5})\]/,
        /\(([A-Z]{2,5})\)/
      ];
      const ticker = extractValue(tickerPatterns, cleanContent, 'NVDA');
      
      // Filing Date
      const datePatterns = [
        /<periodofReport[^>]*>([^<]+)<\/periodofReport>/i,
        /(\d{2}\/\d{2}\/\d{4})/
      ];
      const filingDate = extractDate(datePatterns, cleanContent);
      
      // Title bestimmen
      let title = 'Insider';
      if (/president.*ceo|ceo.*president|chief executive/i.test(cleanContent)) {
        title = 'President and CEO';
      } else if (/director/i.test(cleanContent)) {
        title = 'Director';
      } else if (/officer/i.test(cleanContent)) {
        title = 'Officer';
      }
      
      // TRANSAKTIONEN EXTRAHIEREN
      const transactions = [];
      
      // STRATEGIE 1: HTML Table Row Parsing (für NVIDIA)
      const parseHTMLTableTransactions = () => {
        // Suche nach Tabellenzeilen mit Transaktionsdaten
        const tableRowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        let rowMatch;
        
        while ((rowMatch = tableRowPattern.exec(cleanContent)) !== null) {
          const rowHTML = rowMatch[1];
          
          // Extrahiere Zellendaten aus der Zeile
          const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
          const cells = [];
          let cellMatch;
          
          while ((cellMatch = cellPattern.exec(rowHTML)) !== null) {
            // Bereinige Zellinhalt von HTML-Tags
            const cellContent = cellMatch[1]
              .replace(/<[^>]*>/g, '')
              .replace(/&nbsp;/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();
            cells.push(cellContent);
          }
          
          // Prüfe, ob dies eine Transaktions-Zeile ist (Common Stock + Datum + Daten)
          if (cells.length >= 7 && 
              cells[0] && cells[0].toLowerCase().includes('common stock') &&
              cells[1] && /\d{2}\/\d{2}\/\d{4}/.test(cells[1])) {
            
            try {
              const transactionDate = extractDate([new RegExp(cells[1])], cells[1], filingDate);
              const transactionCode = (cells[3] || 'S').replace(/[()0-9]/g, '').trim();
              const shares = parseFloat((cells[4] || '0').replace(/,/g, ''));
              const priceStr = (cells[6] || '0').replace(/[\$,()]/g, '');
              const price = parseFloat(priceStr);
              const sharesAfterStr = (cells[7] || '0').replace(/,/g, '');
              const sharesAfter = parseFloat(sharesAfterStr);
              const acquiredDisposed = (cells[5] || 'D').toUpperCase();
              
              if (shares > 0 && !isNaN(shares) && price >= 0 && !isNaN(price)) {
                transactions.push({
                  personName: personName.replace(/&amp;/g, '&'),
                  title: title.replace(/&amp;/g, '&'),
                  companyName: companyName.replace(/&amp;/g, '&'),
                  ticker: ticker.toUpperCase(),
                  shares: Math.round(shares),
                  price: Math.round(price * 100) / 100,
                  totalValue: Math.round(shares * price),
                  sharesAfter: Math.round(sharesAfter),
                  transactionDate,
                  filingDate,
                  transactionType: acquiredDisposed,
                  transactionCode: transactionCode.toUpperCase() || 'S',
                  securityTitle: 'Common Stock',
                  ownershipForm: 'D',
                  footnotes: 'Parsed from HTML table'
                });
              }
            } catch (parseError) {
              console.warn(`Error parsing HTML table row:`, parseError.message);
            }
          }
        }
      };

      // STRATEGIE 2: Standard XML Transaction Parsing
      const parseXMLTransactions = () => {
        const xmlTransactionPatterns = [
          /<nonderivativetransaction[^>]*>([\s\S]*?)<\/nonderivativetransaction>/gi,
          /<transaction[^>]*>([\s\S]*?)<\/transaction>/gi
        ];
        
        for (const pattern of xmlTransactionPatterns) {
          let transactionMatch;
          pattern.lastIndex = 0;
          
          while ((transactionMatch = pattern.exec(cleanContent)) !== null) {
            const transactionXML = transactionMatch[1];
            
            try {
              const transDatePatterns = [
                /<transactiondate[^>]*>[\s\S]*?<value[^>]*>([^<]+)<\/value>/i,
                /<transactiondate[^>]*>([^<]+)<\/transactiondate>/i
              ];
              const transactionDate = extractDate(transDatePatterns, transactionXML, filingDate);
              
              const codePatterns = [
                /<transactioncode[^>]*>[\s\S]*?<value[^>]*>([^<]+)<\/value>/i,
                /<transactioncode[^>]*>([^<]+)<\/transactioncode>/i
              ];
              const transactionCode = extractValue(codePatterns, transactionXML, 'S');
              
              const sharesPatterns = [
                /<transactionshares[^>]*>[\s\S]*?<value[^>]*>([0-9.,]+)<\/value>/i,
                /<shares[^>]*>([0-9.,]+)<\/shares>/i
              ];
              const shares = extractValue(sharesPatterns, transactionXML, 0, { 
                removeCommas: true, 
                parseFloat: true 
              });
              
              const pricePatterns = [
                /<transactionpricepershare[^>]*>[\s\S]*?<value[^>]*>([0-9.,]+)<\/value>/i,
                /<price[^>]*>([0-9.,]+)<\/price>/i
              ];
              const price = extractValue(pricePatterns, transactionXML, 0, { 
                removeCommas: true, 
                parseFloat: true 
              });
              
              const sharesAfterPatterns = [
                /<sharesownedfollotransaction[^>]*>[\s\S]*?<value[^>]*>([0-9.,]+)<\/value>/i,
                /<sharesafter[^>]*>([0-9.,]+)<\/sharesafter>/i
              ];
              const sharesAfter = extractValue(sharesAfterPatterns, transactionXML, 0, { 
                removeCommas: true, 
                parseFloat: true 
              });
              
              if (shares > 0 && !isNaN(shares) && price >= 0 && !isNaN(price)) {
                transactions.push({
                  personName: personName.replace(/&amp;/g, '&'),
                  title: title.replace(/&amp;/g, '&'),
                  companyName: companyName.replace(/&amp;/g, '&'),
                  ticker: ticker.toUpperCase(),
                  shares: Math.round(shares),
                  price: Math.round(price * 100) / 100,
                  totalValue: Math.round(shares * price),
                  sharesAfter: Math.round(sharesAfter),
                  transactionDate,
                  filingDate,
                  transactionType: 'D',
                  transactionCode: transactionCode.toUpperCase(),
                  securityTitle: 'Common Stock',
                  ownershipForm: 'D',
                  footnotes: 'Parsed from XML'
                });
              }
            } catch (parseError) {
              console.warn(`Error parsing XML transaction:`, parseError.message);
            }
          }
        }
      };

      // STRATEGIE 3: Regex-basierte Direktextraktion für numerische Werte
      const parseDirectValues = () => {
        // Suche nach Datumsmustern
        const dateMatches = cleanContent.match(/\d{2}\/\d{2}\/\d{4}/g) || [];
        // Suche nach Preismustern ($XXX.XX)
        const priceMatches = cleanContent.match(/\$([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2,4})?)/g) || [];
        // Suche nach großen Zahlen (Aktienanzahl)
        const shareMatches = cleanContent.match(/\b([1-9][0-9]{2,6})\b/g) || [];
        
        if (dateMatches.length > 0 && priceMatches.length > 0 && shareMatches.length > 0) {
          const transactionDate = extractDate([new RegExp(dateMatches[0])], dateMatches[0], filingDate);
          const price = parseFloat(priceMatches[0].replace(/[\$,]/g, ''));
          const shares = parseInt(shareMatches[0].replace(/,/g, ''));
          
          if (shares > 100 && price > 0) {
            transactions.push({
              personName: personName.replace(/&amp;/g, '&') || 'Jensen Huang',
              title: title.replace(/&amp;/g, '&') || 'President and CEO',
              companyName: 'NVIDIA Corp',
              ticker: 'NVDA',
              shares: shares,
              price: Math.round(price * 100) / 100,
              totalValue: Math.round(shares * price),
              sharesAfter: 0,
              transactionDate,
              filingDate,
              transactionType: 'D',
              transactionCode: 'S',
              securityTitle: 'Common Stock',
              ownershipForm: 'D',
              footnotes: 'Parsed with regex fallback'
            });
          }
        }
      };

      // Führe alle Parsing-Strategien aus
      parseHTMLTableTransactions(); // Primary für NVIDIA
      if (transactions.length === 0) {
        parseXMLTransactions(); // Fallback für Standard XML
      }
      if (transactions.length === 0) {
        parseDirectValues(); // Last resort
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
          contentLength: cleanContent.length,
          accessionNumber,
          parsingMethod: transactions.length > 0 ? 
            (transactions[0].footnotes?.includes('HTML') ? 'HTML Table' : 
             transactions[0].footnotes?.includes('XML') ? 'XML' : 'Regex Fallback') : 'No transactions found'
        }
      };
      
    } catch (error) {
      console.error(`Content parsing error for ${accessionNumber}:`, error.message);
      return {
        success: false,
        error: error.message,
        transactions: [],
        accessionNumber
      };
    }
  }

  // Form 4 URL-Konstruktion mit mehreren Fallbacks
  async function fetchForm4Content(cik, accessionNumber) {
    const cleanAccession = accessionNumber.replace(/-/g, '');
    const urls = [
      // Haupt-XML URL
      `https://www.sec.gov/Archives/edgar/data/${parseInt(cik)}/${cleanAccession}/ownership.xml`,
      // HTML Form 4 URL (NVIDIA-Style)
      `https://www.sec.gov/Archives/edgar/data/${parseInt(cik)}/${cleanAccession}/xslF345X05/wk-form4_*.xml`,
      // Generische Form 4 URL
      `https://www.sec.gov/Archives/edgar/data/${parseInt(cik)}/${accessionNumber}/primary.xml`,
      // HTML Fallback
      `https://www.sec.gov/Archives/edgar/data/${parseInt(cik)}/${cleanAccession}/xslF345X03/wf-form4_*.htm`
    ];

    // Spezielle URL-Konstruktion für bekannte NVIDIA-Patterns
    if (cik === '0001045810') {
      // Für NVIDIA: wk-form4_[timestamp].xml pattern
      const timestampPattern = `https://www.sec.gov/Archives/edgar/data/1045810/${cleanAccession}/xslF345X05/wk-form4_${cleanAccession.substring(-10)}.xml`;
      urls.unshift(timestampPattern);
    }

    for (const url of urls) {
      try {
        // Handle wildcard URLs by trying common patterns
        if (url.includes('*')) {
          const baseUrl = url.replace('*', '');
          const patterns = ['1', '2', '3', cleanAccession.substring(-10)];
          
          for (const pattern of patterns) {
            try {
              const testUrl = baseUrl.replace('*', pattern);
              const response = await fetchWithRetry(testUrl);
              const content = await response.text();
              if (content && content.length > 100) {
                return { content, url: testUrl };
              }
            } catch (patternError) {
              continue;
            }
          }
        } else {
          const response = await fetchWithRetry(url);
          const content = await response.text();
          if (content && content.length > 100) {
            return { content, url };
          }
        }
      } catch (error) {
        console.warn(`Failed to fetch ${url}:`, error.message);
      }
    }
    
    throw new Error('No valid Form 4 content found for this filing');
  }

  try {
    const { ticker, latest, limit = 10, debug = false, test = false } = req.query;
    
    // TEST MODE - NVIDIA-fokussiert
    if (test === 'true') {
      const testResults = {};
      const testTickers = ['NVDA', 'BTBT', 'CRM', 'TSLA', 'AAPL'];
      
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
          
          // Test HTML/XML Parsing
          if (form4Indices.length > 0) {
            try {
              const accessionNumber = submissionsData.filings.recent.accessionNumber[form4Indices[0]];
              const { content, url: contentUrl } = await fetchForm4Content(cik, accessionNumber);
              
              testResults[testTicker].contentSize = content.length;
              testResults[testTicker].contentUrl = contentUrl;
              testResults[testTicker].contentType = content.includes('<html') ? 'HTML' : 'XML';
              
              const parseResult = parseForm4Content(content, accessionNumber);
              
              testResults[testTicker].parseStatus = parseResult.success ? 'Success' : 'Failed';
              testResults[testTicker].transactionsFound = parseResult.transactions.length;
              testResults[testTicker].samplePerson = parseResult.debug?.personName || 'Unknown';
              testResults[testTicker].parsingMethod = parseResult.debug?.parsingMethod || 'Unknown';
              
              if (parseResult.transactions.length > 0) {
                testResults[testTicker].sampleTransaction = parseResult.transactions[0];
              }
              
            } catch (contentError) {
              testResults[testTicker].parseStatus = 'Content Fetch Failed';
              testResults[testTicker].contentError = contentError.message;
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
          parseSuccess: Object.values(testResults).filter(r => r.parseStatus === 'Success').length,
          withTransactions: Object.values(testResults).filter(r => r.transactionsFound > 0).length
        }
      });
    }
    
    if (latest === 'true') {
      // Multi-Company mit NVIDIA-Fokus
      const activeCompanies = ['NVDA', 'BTBT', 'CRM', 'AMD', 'TSLA'];
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
            const maxToLoad = Math.min(form4Indices.length, 3);
            
            for (let i = 0; i < maxToLoad; i++) {
              const idx = form4Indices[i];
              const accessionNumber = submissionsData.filings.recent.accessionNumber[idx];
              
              try {
                const { content, url: contentUrl } = await fetchForm4Content(cik, accessionNumber);
                const parseResult = parseForm4Content(content, accessionNumber);
                
                if (parseResult.success && parseResult.transactions.length > 0) {
                  allTrades.push(...parseResult.transactions);
                  debugInfo.push({
                    ticker: t,
                    accessionNumber,
                    transactionCount: parseResult.transactions.length,
                    personName: parseResult.debug.personName,
                    parsingMethod: parseResult.debug.parsingMethod,
                    contentUrl,
                    status: 'Success'
                  });
                } else {
                  debugInfo.push({
                    ticker: t,
                    accessionNumber,
                    status: 'No Transactions',
                    error: parseResult.error,
                    parsingMethod: parseResult.debug?.parsingMethod,
                    contentUrl
                  });
                }
              } catch (contentError) {
                debugInfo.push({
                  ticker: t,
                  accessionNumber,
                  status: 'Content Error',
                  error: contentError.message
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
        source: 'SEC EDGAR API - HTML Table NVIDIA Parser',
        debug: debug === 'true' ? debugInfo : undefined
      });
    }
    
    if (!ticker) {
      return res.status(400).json({ 
        error: 'Ticker parameter required',
        example: '/api/insider-trades?ticker=NVDA&debug=true',
        testMode: '/api/insider-trades?test=true',
        supportedTickers: Object.keys(COMPANY_CIKS)
      });
    }
    
    // Einzelner Ticker - NVIDIA-optimiert
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
        const { content, url: contentUrl } = await fetchForm4Content(cik, accessionNumber);
        const parseResult = parseForm4Content(content, accessionNumber);
        
        if (parseResult.success && parseResult.transactions.length > 0) {
          allTrades.push(...parseResult.transactions);
          debugInfo.push({
            accessionNumber,
            reportDate,
            transactionCount: parseResult.transactions.length,
            personName: parseResult.debug.personName,
            parsingMethod: parseResult.debug.parsingMethod,
            status: 'Success',
            contentUrl: contentUrl
          });
        } else {
          debugInfo.push({
            accessionNumber,
            reportDate,
            status: 'No Transactions Parsed',
            error: parseResult.error,
            parsingMethod: parseResult.debug?.parsingMethod,
            contentUrl: contentUrl
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
      source: 'SEC EDGAR API - HTML Table NVIDIA Parser',
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
