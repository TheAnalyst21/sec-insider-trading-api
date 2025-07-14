<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Live Insider Trading Feed</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #000;
            color: #fff;
            padding: 20px;
            min-height: 100vh;
        }

        .container {
            max-width: 800px;
            margin: 0 auto;
        }

        .header {
            text-align: center;
            margin-bottom: 30px;
        }

        .header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
            background: linear-gradient(45deg, #00ff88, #00cc6a);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }

        .controls {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
            flex-wrap: wrap;
        }

        .refresh-btn, .input-group button {
            background: linear-gradient(45deg, #00ff88, #00cc6a);
            color: #000;
            border: none;
            padding: 12px 25px;
            border-radius: 8px;
            font-weight: bold;
            cursor: pointer;
            font-size: 16px;
            transition: transform 0.2s ease;
        }

        .refresh-btn:hover, .input-group button:hover {
            transform: scale(1.05);
        }

        .refresh-btn:disabled, .input-group button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }

        .input-group {
            display: flex;
            gap: 10px;
            align-items: center;
        }

        .input-group input {
            background: #111;
            border: 1px solid #333;
            color: #fff;
            padding: 10px 15px;
            border-radius: 6px;
            font-size: 14px;
            width: 120px;
        }

        .input-group input:focus {
            outline: none;
            border-color: #00ff88;
        }

        .loading {
            text-align: center;
            padding: 40px;
            font-size: 18px;
            color: #888;
        }

        .spinner {
            display: inline-block;
            width: 30px;
            height: 30px;
            border: 3px solid #333;
            border-top: 3px solid #00ff88;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-right: 10px;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .trade-card {
            background: #111;
            border-radius: 15px;
            padding: 25px;
            margin-bottom: 20px;
            border: 1px solid #333;
            transition: all 0.3s ease;
            cursor: pointer;
            position: relative;
            overflow: hidden;
        }

        .trade-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(45deg, rgba(0,255,136,0.1), rgba(0,204,106,0.1));
            opacity: 0;
            transition: opacity 0.3s ease;
        }

        .trade-card:hover::before {
            opacity: 1;
        }

        .trade-card:hover {
            transform: translateY(-2px);
            border-color: #00ff88;
            box-shadow: 0 10px 30px rgba(0,255,136,0.2);
        }

        .metrics-row {
            display: flex;
            gap: 15px;
            margin-bottom: 20px;
            flex-wrap: wrap;
        }

        .metric {
            background: #1a1a1a;
            padding: 12px 18px;
            border-radius: 8px;
            border: 1px solid #333;
            flex: 1;
            min-width: 120px;
            text-align: center;
        }

        .metric.buy {
            border-color: #00ff88;
            background: rgba(0,255,136,0.1);
        }

        .metric.sell {
            border-color: #ff4444;
            background: rgba(255,68,68,0.1);
        }

        .metric-value {
            font-size: 1.8em;
            font-weight: bold;
            margin-bottom: 4px;
        }

        .metric-value.buy {
            color: #00ff88;
        }

        .metric-value.sell {
            color: #ff4444;
        }

        .metric-label {
            font-size: 0.9em;
            color: #888;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .transaction-description {
            font-size: 1.3em;
            margin-bottom: 15px;
            font-weight: 500;
        }

        .transaction-description.buy {
            color: #00ff88;
        }

        .transaction-description.sell {
            color: #ff4444;
        }

        .company-info {
            margin-bottom: 15px;
        }

        .company-name {
            font-size: 1.8em;
            font-weight: bold;
            margin-bottom: 5px;
        }

        .person-info {
            margin-bottom: 10px;
        }

        .person-name {
            font-size: 1.4em;
            font-weight: 600;
            margin-bottom: 3px;
        }

        .person-title {
            color: #888;
            font-size: 1.1em;
        }

        .date-info {
            color: #666;
            font-size: 1em;
            margin-top: 15px;
        }

        .error {
            background: #331;
            border: 1px solid #f44;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
            color: #faa;
        }

        .footnote {
            background: #1a1a1a;
            border-left: 3px solid #00ff88;
            padding: 10px 15px;
            margin-top: 15px;
            font-size: 0.9em;
            color: #ccc;
            border-radius: 0 5px 5px 0;
        }

        .status {
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 20px;
            font-size: 14px;
        }

        .status.success {
            border-color: #00ff88;
            background: rgba(0,255,136,0.1);
        }

        .status.warning {
            border-color: #ffaa00;
            background: rgba(255,170,0,0.1);
            color: #ffaa00;
        }

        @media (max-width: 600px) {
            .metrics-row {
                flex-direction: column;
            }
            
            .metric {
                min-width: auto;
            }
            
            .header h1 {
                font-size: 2em;
            }

            .controls {
                flex-direction: column;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📈 Live Insider Trading Feed</h1>
            <p>Echte SEC Form 4 Filings</p>
        </div>

        <div class="controls">
            <button class="refresh-btn" onclick="loadLatestFilings()" id="refreshBtn">
                🔄 Neueste Filings laden
            </button>
            
            <div class="input-group">
                <input type="text" id="tickerInput" placeholder="Ticker (z.B. TSLA)" maxlength="5">
                <button onclick="loadCompanyFilings()" id="searchBtn">🔍 Suchen</button>
            </div>
        </div>

        <div id="status"></div>
        <div id="content">
            <div class="loading">
                <div class="spinner"></div>
                Verbinde mit SEC EDGAR API...
            </div>
        </div>
    </div>

    <script>
        // Backend API Configuration
        // 🔥 WICHTIG: Ersetze diese URL mit deiner echten Vercel URL
        const BACKEND_API_URL = 'https://DEINE-VERCEL-URL.vercel.app/api/insider-trades';
        // Beispiel: 'https://sec-insider-trading-api-xyz123.vercel.app/api/insider-trades'
        
        let currentFilings = [];

        function showStatus(message, type = 'info') {
            const status = document.getElementById('status');
            const className = type === 'success' ? 'status success' : 
                             type === 'warning' ? 'status warning' : 'status';
            status.innerHTML = `<div class="${className}">${message}</div>`;
        }

        function formatNumber(num) {
            if (num >= 1000000) {
                return (num / 1000000).toFixed(1) + 'M';
            } else if (num >= 1000) {
                return (num / 1000).toFixed(0) + 'K';
            }
            return num.toLocaleString();
        }

        function formatCurrency(amount) {
            if (amount >= 1000000) {
                return '$' + (amount / 1000000).toFixed(1) + 'M';
            } else if (amount >= 1000) {
                return '$' + (amount / 1000).toFixed(0) + 'K';
            }
            return '$' + amount.toLocaleString();
        }

        function formatDate(dateStr) {
            const date = new Date(dateStr);
            const today = new Date();
            const diffTime = Math.abs(today - date);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays === 1) {
                return 'Heute';
            } else if (diffDays === 2) {
                return 'Gestern';
            } else if (diffDays <= 7) {
                return `vor ${diffDays-1} Tagen`;
            }
            
            return date.toLocaleDateString('de-DE');
        }

        async function fetchInsiderTrades(ticker = null, latest = false) {
            const params = new URLSearchParams();
            
            if (latest) {
                params.append('latest', 'true');
                params.append('limit', '20');
                params.append('includeForm144', 'true'); // NEW: Form 144 Support
            } else if (ticker) {
                params.append('ticker', ticker.toUpperCase());
                params.append('limit', '15');
                params.append('includeForm144', 'true'); // NEW: Form 144 Support
                params.append('debug', 'true'); // NEW: Debug für Ticker-Suchen
            } else {
                throw new Error('Either ticker or latest=true must be specified');
            }
            
            const url = `${BACKEND_API_URL}?${params}`;
            
            try {
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    }
                });
                
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
                }
                
                const data = await response.json();
                
                if (!data.success) {
                    throw new Error(data.error || 'API returned unsuccessful response');
                }
                
                return {
                    trades: data.trades || [],
                    debug: data.debug || null,
                    includedTypes: data.includedTypes || ['Form 4'],
                    form4Count: data.form4Count || 0
                };
                
            } catch (error) {
                if (error.name === 'TypeError' && error.message.includes('fetch')) {
                    throw new Error('Backend Service nicht erreichbar. Prüfe deine BACKEND_API_URL: ' + BACKEND_API_URL);
                }
                throw error;
            }
        }

        function getTransactionDescription(trade) {
            const isBuy = trade.transactionType === 'A';
            const action = isBuy ? 'GEKAUFT' : 'VERKAUFT';
            const shares = formatNumber(trade.shares);
            const price = `${trade.price.toFixed(2)}`;
            const emoji = isBuy ? '🟢' : '🔴';
            
            return `${emoji} ${action} ${shares} Aktien @ ${price}`;
        }

        function calculateOwnership(sharesAfter, totalShares = 10000000) {
            return ((sharesAfter / totalShares) * 100).toFixed(1) + '%';
        }

        function renderTradeCard(trade) {
            const isBuy = trade.transactionType === 'A';
            const isForm144 = trade.isForm144 || trade.transactionCode === '144';
            
            let buyClass, actionText, emoji;
            
            if (isForm144) {
                buyClass = 'sell';
                actionText = 'VERKAUFS-ANKÜNDIGUNG';
                emoji = '🔔';
            } else {
                buyClass = isBuy ? 'buy' : 'sell';
                actionText = isBuy ? 'GEKAUFT' : 'VERKAUFT';
                emoji = isBuy ? '🟢' : '🔴';
            }
            
            const isRecent = new Date(trade.transactionDate) >= new Date(Date.now() - 3*24*60*60*1000);
            
            return `
                <div class="trade-card">
                    <div class="metrics-row">
                        <div class="metric ${buyClass}">
                            <div class="metric-value ${buyClass}">${trade.shares > 0 ? formatNumber(trade.shares) : 'N/A'}</div>
                            <div class="metric-label">${isForm144 ? 'Intent' : 'Aktien'}</div>
                        </div>
                        <div class="metric ${buyClass}">
                            <div class="metric-value ${buyClass}">${trade.totalValue > 0 ? formatCurrency(trade.totalValue) : 'N/A'}</div>
                            <div class="metric-label">Wert</div>
                        </div>
                        <div class="metric ${buyClass}">
                            <div class="metric-value ${buyClass}">${trade.sharesAfter > 0 ? calculateOwnership(trade.sharesAfter) : 'N/A'}</div>
                            <div class="metric-label">Geschätzt %</div>
                        </div>
                    </div>
                    
                    <div class="transaction-description ${buyClass}">
                        ${emoji} ${actionText} ${trade.shares > 0 ? formatNumber(trade.shares) + ' Aktien' : ''} ${trade.price > 0 ? '@ 

        async function loadCompanyFilings() {
            const ticker = document.getElementById('tickerInput').value.trim().toUpperCase();
            if (!ticker) {
                showStatus('Bitte geben Sie einen Ticker ein', 'warning');
                return;
            }
            
            const content = document.getElementById('content');
            const searchBtn = document.getElementById('searchBtn');
            
            searchBtn.disabled = true;
            searchBtn.textContent = '🔍 Suche...';
            
            content.innerHTML = `
                <div class="loading">
                    <div class="spinner"></div>
                    Lade Form 4 + Form 144 Filings für ` + ticker + ` über Backend API...
                </div>
            `;
            
            try {
                showStatus('Lade Insider Trading Daten für ' + ticker + ' (Form 4 + Form 144)...');
                
                const result = await fetchInsiderTrades(ticker, false);
                const trades = result.trades;
                
                if (trades.length === 0) {
                    let debugInfo = '';
                    if (result.debug) {
                        const form4Count = result.form4Count || 0;
                        const includedTypes = (result.includedTypes || []).join(', ');
                        const debugDetails = JSON.stringify(result.debug, null, 2);
                        debugInfo = '\\n\\nDebug Info:\\nForm 4 Filings gefunden: ' + form4Count + '\\nIncluded Types: ' + includedTypes + '\\n\\nDetails: ' + debugDetails;
                    }
                    
                    content.innerHTML = 
                        '<div class="error">' +
                            'Keine Form 4 oder Form 144 Filings für ' + ticker + ' gefunden.' +
                            '<br><br>' +
                            '<small><strong>Was das bedeutet:</strong><br>' +
                            '• Keine aktuellen Insider Trading Aktivitäten<br>' +
                            '• Keine Form 4 (Transaktionen) oder Form 144 (Verkaufsankündigungen)<br>' +
                            '• Möglicherweise verwendet ' + ticker + ' andere Filing-Typen<br><br>' +
                            '<strong>Versuche andere Ticker:</strong> BTBT, AMD, CRM haben oft Aktivität' + debugInfo + '</small>' +
                        '</div>';
                    showStatus('Keine Insider Filings für ' + ticker + ' gefunden', 'warning');
                    return;
                }
                
                // Sortiere nach Datum (neueste zuerst)
                trades.sort((a, b) => new Date(b.transactionDate) - new Date(a.transactionDate));
                
                currentFilings = trades;
                content.innerHTML = trades.map(trade => renderTradeCard(trade)).join('');
                
                const form4Count = trades.filter(t => !t.isForm144).length;
                const form144Count = trades.filter(t => t.isForm144).length;
                
                showStatus(trades.length + ' Insider Aktivitäten für ' + ticker + ' geladen (' + form4Count + ' Form 4, ' + form144Count + ' Form 144)', 'success');
                
            } catch (error) {
                content.innerHTML = 
                    '<div class="error">' +
                        '<strong>Fehler beim Laden der Daten:</strong><br>' +
                        error.message +
                        '<br><br>' +
                        '<small><strong>Mögliche Ursachen:</strong><br>' +
                        '• Backend Service nicht erreichbar<br>' +
                        '• Falsche BACKEND_API_URL konfiguriert<br>' +
                        '• Ticker nicht gefunden<br>' +
                        '• SEC API temporär nicht verfügbar<br><br>' +
                        '<strong>Konfiguration prüfen:</strong><br>' +
                        'Aktuelle Backend URL: <code>' + BACKEND_API_URL + '</code></small>' +
                    '</div>';
                showStatus('Fehler: ' + error.message, 'warning');
            } finally {
                searchBtn.disabled = false;
                searchBtn.textContent = '🔍 Suchen';
            }
        }

        async function loadLatestFilings() {
            const content = document.getElementById('content');
            const refreshBtn = document.getElementById('refreshBtn');
            
            refreshBtn.disabled = true;
            refreshBtn.textContent = '🔄 Lädt...';
            
            content.innerHTML = 
                '<div class="loading">' +
                    '<div class="spinner"></div>' +
                    'Lade neueste Form 4 + Form 144 Filings über Backend API...' +
                '</div>';
            
            try {
                showStatus('Lade neueste Insider Trading Aktivitäten (Form 4 + Form 144)...');
                
                const result = await fetchInsiderTrades(null, true);
                const trades = result.trades;
                
                if (trades.length === 0) {
                    content.innerHTML = 
                        '<div class="error">' +
                            'Keine aktuellen Form 4 oder Form 144 Filings gefunden.' +
                            '<br><br>' +
                            '<small><strong>Das ist normal!</strong><br>' +
                            'Insider Trading findet nicht täglich statt. Versuchen Sie es mit einem spezifischen Ticker oder prüfen Sie die Backend Service Konfiguration.<br><br>' +
                            '<strong>Unterstützte Filing-Typen:</strong> ' + (result.includedTypes || ['Form 4']).join(', ') + '</small>' +
                        '</div>';
                    showStatus('Keine aktuellen Filings gefunden', 'warning');
                    return;
                }
                
                // Sortiere nach Datum (neueste zuerst)
                trades.sort((a, b) => new Date(b.transactionDate) - new Date(a.transactionDate));
                
                currentFilings = trades;
                content.innerHTML = trades.map(trade => renderTradeCard(trade)).join('');
                
                const form4Count = trades.filter(t => !t.isForm144).length;
                const form144Count = trades.filter(t => t.isForm144).length;
                
                showStatus(trades.length + ' aktuelle Insider Aktivitäten geladen (' + form4Count + ' Form 4, ' + form144Count + ' Form 144)', 'success');
                
            } catch (error) {
                content.innerHTML = 
                    '<div class="error">' +
                        '<strong>Fehler beim Laden der aktuellen Filings:</strong><br>' +
                        error.message +
                        '<br><br>' +
                        '<small><strong>Backend Service Status:</strong><br>' +
                        'URL: <code>' + BACKEND_API_URL + '</code><br><br>' +
                        '<strong>Nächste Schritte:</strong><br>' +
                        '1. Backend Service auf Vercel deployen<br>' +
                        '2. BACKEND_API_URL im Code aktualisieren<br>' +
                        '3. Netzwerkverbindung prüfen</small>' +
                    '</div>';
                showStatus('Fehler: ' + error.message, 'warning');
            } finally {
                refreshBtn.disabled = false;
                refreshBtn.textContent = '🔄 Neueste Filings laden';
            }
        }

        // Event Listeners
        document.getElementById('tickerInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                loadCompanyFilings();
            }
        });

        // Auto-load beim Start
        window.addEventListener('load', function() {
            const content = document.getElementById('content');
            content.innerHTML = 
                '<div class="status success">' +
                    '<strong>🚀 SEC Insider Trading Feed bereit!</strong><br><br>' +
                    '<strong>Backend Service:</strong> ' + BACKEND_API_URL + '<br><br>' +
                    '<strong>Nächste Schritte:</strong><br>' +
                    '1. Teste mit einem Ticker (z.B. TSLA, AAPL)<br>' +
                    '2. Oder lade aktuelle Filings von mehreren Unternehmen<br><br>' +
                    '<small><strong>⚠️ Wichtig:</strong> Stelle sicher, dass dein Backend Service deployed ist!</small>' +
                '</div>';
            showStatus('Backend API konfiguriert. Bereit für Live-Daten!', 'success');
        });
    </script>
</body>
</html> + trade.price.toFixed(2) : ''}
                        ${isForm144 ? '<br><small style="color: #ffaa00;">⚠️ Form 144 - Intent to Sell Notice</small>' : ''}
                    </div>
                    
                    <div class="company-info">
                        <div class="company-name">${trade.ticker ? trade.ticker + ' - ' : ''}${trade.companyName}</div>
                    </div>
                    
                    <div class="person-info">
                        <div class="person-name">${trade.personName}</div>
                        <div class="person-title">${trade.title}</div>
                    </div>
                    
                    <div class="date-info">
                        ${trade.sharesAfter > 0 ? 'Besitzt jetzt ' + formatNumber(trade.sharesAfter) + ' Aktien direkt' : 'Aktienbestand nach Transaktion'}
                        <br>
                        ${formatDate(trade.transactionDate)} ${isRecent ? '(Kürzlich)' : ''}
                        ${trade.footnotes ? '<br><small style="color: #888;">' + trade.footnotes + '</small>' : ''}
                    </div>
                </div>
            `;
        }

        async function loadCompanyFilings() {
            const ticker = document.getElementById('tickerInput').value.trim().toUpperCase();
            if (!ticker) {
                showStatus('Bitte geben Sie einen Ticker ein', 'warning');
                return;
            }
            
            const content = document.getElementById('content');
            const searchBtn = document.getElementById('searchBtn');
            
            searchBtn.disabled = true;
            searchBtn.textContent = '🔍 Suche...';
            
            content.innerHTML = `
                <div class="loading">
                    <div class="spinner"></div>
                    Lade Form 4 + Form 144 Filings für ${ticker} über Backend API...
                </div>
            `;
            
            try {
                showStatus(`Lade Insider Trading Daten für ${ticker} (Form 4 + Form 144)...`);
                
                const result = await fetchInsiderTrades(ticker, false);
                const trades = result.trades;
                
                if (trades.length === 0) {
                    let debugInfo = '';
                    if (result.debug) {
                        debugInfo = `\n\nDebug Info:\nForm 4 Filings gefunden: ${result.form4Count || 0}\nIncluded Types: ${(result.includedTypes || []).join(', ')}\n\nDetails: ${JSON.stringify(result.debug, null, 2)}`;
                    }
                    
                    content.innerHTML = `
                        <div class="error">
                            Keine Form 4 oder Form 144 Filings für ${ticker} gefunden.
                            <br><br>
                            <small><strong>Was das bedeutet:</strong><br>
                            • Keine aktuellen Insider Trading Aktivitäten<br>
                            • Keine Form 4 (Transaktionen) oder Form 144 (Verkaufsankündigungen)<br>
                            • Möglicherweise verwendet ${ticker} andere Filing-Typen<br><br>
                            <strong>Versuche andere Ticker:</strong> BTBT, AMD, CRM haben oft Aktivität${debugInfo}</small>
                        </div>
                    `;
                    showStatus(`Keine Insider Filings für ${ticker} gefunden`, 'warning');
                    return;
                }
                
                // Sortiere nach Datum (neueste zuerst)
                trades.sort((a, b) => new Date(b.transactionDate) - new Date(a.transactionDate));
                
                currentFilings = trades;
                content.innerHTML = trades.map(trade => renderTradeCard(trade)).join('');
                
                const form4Count = trades.filter(t => !t.isForm144).length;
                const form144Count = trades.filter(t => t.isForm144).length;
                
                showStatus(`${trades.length} Insider Aktivitäten für ${ticker} geladen (${form4Count} Form 4, ${form144Count} Form 144)`, 'success');
                
            } catch (error) {
                content.innerHTML = `
                    <div class="error">
                        <strong>Fehler beim Laden der Daten:</strong><br>
                        ${error.message}
                        <br><br>
                        <small><strong>Mögliche Ursachen:</strong><br>
                        • Backend Service nicht erreichbar<br>
                        • Falsche BACKEND_API_URL konfiguriert<br>
                        • Ticker nicht gefunden<br>
                        • SEC API temporär nicht verfügbar<br><br>
                        <strong>Konfiguration prüfen:</strong><br>
                        Aktuelle Backend URL: <code>${BACKEND_API_URL}</code></small>
                    </div>
                `;
                showStatus(`Fehler: ${error.message}`, 'warning');
            } finally {
                searchBtn.disabled = false;
                searchBtn.textContent = '🔍 Suchen';
            }
        }

        async function loadLatestFilings() {
            const content = document.getElementById('content');
            const refreshBtn = document.getElementById('refreshBtn');
            
            refreshBtn.disabled = true;
            refreshBtn.textContent = '🔄 Lädt...';
            
            content.innerHTML = `
                <div class="loading">
                    <div class="spinner"></div>
                    Lade neueste Form 4 + Form 144 Filings über Backend API...
                </div>
            `;
            
            try {
                showStatus('Lade neueste Insider Trading Aktivitäten (Form 4 + Form 144)...');
                
                const result = await fetchInsiderTrades(null, true);
                const trades = result.trades;
                
                if (trades.length === 0) {
                    content.innerHTML = `
                        <div class="error">
                            Keine aktuellen Form 4 oder Form 144 Filings gefunden.
                            <br><br>
                            <small><strong>Das ist normal!</strong><br>
                            Insider Trading findet nicht täglich statt. Versuchen Sie es mit einem spezifischen Ticker oder prüfen Sie die Backend Service Konfiguration.<br><br>
                            <strong>Unterstützte Filing-Typen:</strong> ${(result.includedTypes || ['Form 4']).join(', ')}</small>
                        </div>
                    `;
                    showStatus('Keine aktuellen Filings gefunden', 'warning');
                    return;
                }
                
                // Sortiere nach Datum (neueste zuerst)
                trades.sort((a, b) => new Date(b.transactionDate) - new Date(a.transactionDate));
                
                currentFilings = trades;
                content.innerHTML = trades.map(trade => renderTradeCard(trade)).join('');
                
                const form4Count = trades.filter(t => !t.isForm144).length;
                const form144Count = trades.filter(t => t.isForm144).length;
                
                showStatus(`${trades.length} aktuelle Insider Aktivitäten geladen (${form4Count} Form 4, ${form144Count} Form 144)`, 'success');
                
            } catch (error) {
                content.innerHTML = `
                    <div class="error">
                        <strong>Fehler beim Laden der aktuellen Filings:</strong><br>
                        ${error.message}
                        <br><br>
                        <small><strong>Backend Service Status:</strong><br>
                        URL: <code>${BACKEND_API_URL}</code><br><br>
                        <strong>Nächste Schritte:</strong><br>
                        1. Backend Service auf Vercel deployen<br>
                        2. BACKEND_API_URL im Code aktualisieren<br>
                        3. Netzwerkverbindung prüfen</small>
                    </div>
                `;
                showStatus(`Fehler: ${error.message}`, 'warning');
            } finally {
                refreshBtn.disabled = false;
                refreshBtn.textContent = '🔄 Neueste Filings laden';
            }
        }

        // Event Listeners
        document.getElementById('tickerInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                loadCompanyFilings();
            }
        });

        // Auto-load beim Start
        window.addEventListener('load', function() {
            const content = document.getElementById('content');
            content.innerHTML = `
                <div class="status success">
                    <strong>🚀 SEC Insider Trading Feed bereit!</strong><br><br>
                    <strong>Backend Service:</strong> ${BACKEND_API_URL}<br><br>
                    <strong>Nächste Schritte:</strong><br>
                    1. Teste mit einem Ticker (z.B. TSLA, AAPL)<br>
                    2. Oder lade aktuelle Filings von mehreren Unternehmen<br><br>
                    <small><strong>⚠️ Wichtig:</strong> Stelle sicher, dass dein Backend Service deployed ist!</small>
                </div>
            `;
            showStatus('Backend API konfiguriert. Bereit für Live-Daten!', 'success');
        });
    </script>
</body>
</html>
