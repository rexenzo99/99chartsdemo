import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

function App() {
  const [charts, setCharts] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionId, setSessionId] = useState(null);
  const [choices, setChoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showResults, setShowResults] = useState(false);
  const [sessionResults, setSessionResults] = useState(null);
  const [currentScreen, setCurrentScreen] = useState('ticker-selection'); // New state for screen management
  const [tickers, setTickers] = useState(Array(32).fill('')); // 32 empty ticker slots
  const [usingCustomTickers, setUsingCustomTickers] = useState(false); // Track if we're using custom tickers

  useEffect(() => {
    if (currentScreen === 'hot-or-not' && !usingCustomTickers) {
      initializeSession();
    } else {
      setLoading(false);
    }
  }, [currentScreen, usingCustomTickers]);

  const initializeSession = async () => {
    try {
      // Generate session ID
      const sessionResponse = await axios.get(`${BACKEND_URL}/api/generate-session`);
      const newSessionId = sessionResponse.data.session_id;
      setSessionId(newSessionId);

      // Fetch trending charts
      const chartsResponse = await axios.get(`${BACKEND_URL}/api/trending-charts`);
      if (chartsResponse.data.success) {
        setCharts(chartsResponse.data.charts);
      }
      setLoading(false);
    } catch (error) {
      console.error('Failed to initialize session:', error);
      setLoading(false);
    }
  };

  const recordChoice = async (choice) => {
    if (!charts[currentIndex] || !sessionId) return;

    const choiceData = {
      session_id: sessionId,
      chart_index: currentIndex,
      chart_data: {
        symbol: charts[currentIndex].baseToken?.symbol || 'Unknown',
        name: charts[currentIndex].baseToken?.name || 'Unknown',
        price: charts[currentIndex].priceUsd || '0',
        change24h: charts[currentIndex].priceChange?.h24 || 0
      },
      choice: choice,
      timestamp: new Date().toISOString()
    };

    try {
      await axios.post(`${BACKEND_URL}/api/record-choice`, choiceData);
      
      // Update local choices state
      setChoices(prev => [...prev, choiceData]);

      // Move to next chart or show results
      if (currentIndex < charts.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        // All charts completed, show results
        showSessionResults();
      }
    } catch (error) {
      console.error('Failed to record choice:', error);
    }
  };

  const showSessionResults = async () => {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/session-results/${sessionId}`);
      setSessionResults(response.data);
      setShowResults(true);
    } catch (error) {
      console.error('Failed to get session results:', error);
    }
  };

  const getCurrentChartUrl = () => {
    if (!charts[currentIndex]) return '';
    const pair = charts[currentIndex];
    
    // Check if this is a custom ticker (from ticker selection)
    if (pair.chainId === 'custom' && pair.originalTicker) {
      // For custom tickers, search for the token on dexscreener using the original ticker
      const ticker = pair.originalTicker;
      const baseSymbol = ticker.replace('USDT', '');
      
      console.log(`Loading chart for custom ticker: ${ticker} (${baseSymbol})`); // Debug log
      
      // Search for this specific token pair on dexscreener
      return `https://dexscreener.com/search?q=${baseSymbol}?embed=1&theme=dark&trades=0&info=0&hidegrid=1&hidevolume=1&hidestatus=1&hidelegend=1&hide_top_toolbar=1&hide_side_toolbar=1&intervals_disabled=1&withdateranges=0&details=0&hotlist=0&calendar=0&tab=chart`;
    } else {
      // Real dexscreener data with actual chainId and pairAddress  
      const chainId = pair.chainId;
      const pairAddress = pair.pairAddress;
      return `https://dexscreener.com/${chainId}/${pairAddress}?embed=1&theme=dark&trades=0&info=0&hidegrid=1&hidevolume=1&hidestatus=1&hidelegend=1&hide_top_toolbar=1&hide_side_toolbar=1&intervals_disabled=1&withdateranges=0&details=0&hotlist=0&calendar=0&tab=chart`;
    }
  };

  const resetSession = () => {
    setCurrentIndex(0);
    setChoices([]);
    setShowResults(false);
    setSessionResults(null);
    setCurrentScreen('ticker-selection');
  };

  const handleTickerChange = (index, value) => {
    const newTickers = [...tickers];
    newTickers[index] = value.toUpperCase();
    setTickers(newTickers);
  };

  const loadTopMarketCap = async () => {
    try {
      setLoading(true);
      // Fetch more tokens initially to account for filtering
      const response = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false');
      const data = await response.json();
      
      if (data && data.length > 0) {
        // Excluded tickers (stablecoins, wrapped tokens, etc.)
        const excludedTickers = [
          'USDTUSDT',
          'USDCUSDT', 
          'STETHUSDT',
          'WBTCUSDT',
          'WSTETHUSDT',
          'LEOUSDT',
          'WEETHUSDT',
          'WETHUSDT',
          'USDSUSDT',
          'WBTUSDT',
          'BSC-USDUSDT',
          'CBBTCUSDT',
          'USDEUSDT',
          'BGBUSDT',
          'SUSDEUSDT'
        ];
        
        const newTickers = [];
        
        // Filter and convert coins to ticker format
        for (const coin of data) {
          if (newTickers.length >= 32) break;
          
          const ticker = `${coin.symbol.toUpperCase()}USDT`;
          
          // Skip if ticker is in excluded list
          if (!excludedTickers.includes(ticker)) {
            newTickers.push(ticker);
          }
        }
        
        // Fill remaining slots if we don't have 32
        const finalTickers = [...newTickers];
        while (finalTickers.length < 32) {
          finalTickers.push('');
        }
        
        setTickers(finalTickers);
      }
      setLoading(false);
    } catch (error) {
      console.error('Failed to load top market cap tokens:', error);
      setLoading(false);
    }
  };

  const loadTrendingSearch = async () => {
    try {
      setLoading(true);
      // Use existing backend API for trending tokens
      const response = await axios.get(`${BACKEND_URL}/api/trending-charts`);
      if (response.data.success && response.data.charts) {
        const newTickers = [...tickers];
        response.data.charts.forEach((chart, index) => {
          if (index < 32 && chart.baseToken?.symbol) {
            // Use the symbol from dexscreener data
            newTickers[index] = `${chart.baseToken.symbol.toUpperCase()}USDT`;
          }
        });
        setTickers(newTickers);
      }
      setLoading(false);
    } catch (error) {
      console.error('Failed to load trending search tokens:', error);
      setLoading(false);
    }
  };

  const clearAllTickers = () => {
    setTickers(Array(32).fill(''));
  };

  const startHotOrNot = () => {
    // Filter out empty tickers and randomize
    const filledTickers = tickers.filter(ticker => ticker.trim() !== '');
    
    if (filledTickers.length === 0) {
      alert('Please add some tickers before starting analysis!');
      return;
    }
    
    // Randomize the tickers
    const randomizedTickers = [...filledTickers].sort(() => Math.random() - 0.5);
    
    console.log('Custom tickers being used:', randomizedTickers); // Debug log
    
    // Convert tickers to chart format expected by hot_or_not screen
    const customCharts = randomizedTickers.map((ticker, index) => {
      // Extract base symbol (remove USDT suffix)
      const baseSymbol = ticker.replace('USDT', '');
      
      return {
        chainId: 'custom', // Mark as custom to distinguish from API data
        pairAddress: `custom_${ticker}_${index}_${Date.now()}`, // Unique identifier
        baseToken: {
          symbol: baseSymbol,
          name: `${baseSymbol} Token`
        },
        priceUsd: (Math.random() * 100).toFixed(6), // Mock price
        priceChange: {
          h24: ((Math.random() - 0.5) * 20).toFixed(2) // Mock 24h change
        },
        volume: {
          h24: (Math.random() * 1000000).toFixed(0) // Mock volume
        },
        originalTicker: ticker // Keep original ticker for URL generation
      };
    });
    
    // Set flags and data for custom ticker analysis
    setUsingCustomTickers(true);
    setCharts(customCharts);
    setCurrentScreen('hot-or-not');
    setCurrentIndex(0);
    setLoading(false);
    
    // Generate session ID for this custom analysis
    generateCustomSession();
  };

  const generateCustomSession = async () => {
    try {
      const sessionResponse = await axios.get(`${BACKEND_URL}/api/generate-session`);
      const newSessionId = sessionResponse.data.session_id;
      setSessionId(newSessionId);
    } catch (error) {
      console.error('Failed to generate session:', error);
      // Fallback to local session ID
      setSessionId(`custom_${Date.now()}`);
    }
  };

  // Ticker Selection Screen
  if (currentScreen === 'ticker-selection') {
    return (
      <div className="min-h-screen bg-gray-900 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-4">Select Your Tickers</h1>
            <p className="text-gray-300 text-lg">
              Enter up to 32 ticker symbols to analyze
            </p>
          </div>

          {/* Auto-populate buttons */}
          <div className="flex justify-center space-x-4 mb-6">
            <button
              onClick={loadTopMarketCap}
              disabled={loading}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white rounded-lg font-medium transition-colors border border-red-500 flex items-center space-x-2"
            >
              <span>📊</span>
              <span>Top Market Cap</span>
            </button>
            <button
              onClick={loadTrendingSearch}
              disabled={loading}
              className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-lg font-medium transition-colors border border-green-500 flex items-center space-x-2"
            >
              <span>🔥</span>
              <span>Trending Search</span>
            </button>
            <button
              onClick={clearAllTickers}
              disabled={loading}
              className="px-6 py-3 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-500 text-white rounded-lg font-medium transition-colors border border-gray-500 flex items-center space-x-2"
            >
              <span>🗑️</span>
              <span>Clear</span>
            </button>
          </div>

          {/* Loading indicator */}
          {loading && (
            <div className="text-center mb-4">
              <div className="inline-flex items-center space-x-2 text-blue-400">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
                <span>Loading tickers...</span>
              </div>
            </div>
          )}

          {/* 4x8 Grid of ticker inputs */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            {tickers.map((ticker, index) => (
              <input
                key={index}
                type="text"
                value={ticker}
                onChange={(e) => handleTickerChange(index, e.target.value)}
                placeholder={`TICKER${index + 1}`}
                className="bg-gray-700 border border-gray-600 text-white text-center py-4 px-2 rounded-lg text-lg font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
                maxLength={15}
                disabled={loading}
              />
            ))}
          </div>

          {/* Start Analysis button */}
          <div className="flex justify-center">
            <button
              onClick={startHotOrNot}
              disabled={loading}
              className="px-12 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg font-bold text-xl transition-colors border border-blue-500"
            >
              🚀 Start Analysis
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Loading Screen
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-lg text-gray-300">Loading trending charts...</p>
        </div>
      </div>
    );
  }

  // Results Screen
  if (showResults && sessionResults) {
    return (
      <div className="min-h-screen bg-gray-900 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gray-800 rounded-lg shadow-lg p-8 border border-gray-700">
            <h1 className="text-3xl font-bold text-center mb-8 text-white">
              Session Results
            </h1>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-blue-900 p-6 rounded-lg text-center border border-blue-700">
                <div className="text-3xl font-bold text-blue-400">{sessionResults.total_charts}</div>
                <div className="text-gray-300">Total Charts</div>
              </div>
              <div className="bg-green-900 p-6 rounded-lg text-center border border-green-700">
                <div className="text-3xl font-bold text-green-400">{sessionResults.green_count}</div>
                <div className="text-gray-300">Green Choices</div>
              </div>
              <div className="bg-red-900 p-6 rounded-lg text-center border border-red-700">
                <div className="text-3xl font-bold text-red-400">{sessionResults.red_count}</div>
                <div className="text-gray-300">Red Choices</div>
              </div>
            </div>

            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4 text-white">Choice Summary</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
                {sessionResults.choices.map((choice, index) => (
                  <div key={index} className="border border-gray-600 rounded-lg p-4 bg-gray-700">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium text-white">{choice.chart_data.symbol}</span>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                        choice.choice === 'green' 
                          ? 'bg-green-800 text-green-200 border border-green-600' 
                          : 'bg-red-800 text-red-200 border border-red-600'
                      }`}>
                        {choice.choice.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-sm text-gray-300">
                      <div>{choice.chart_data.name}</div>
                      <div>Price: ${parseFloat(choice.chart_data.price).toFixed(6)}</div>
                      <div>24h Change: {parseFloat(choice.chart_data.change24h).toFixed(2)}%</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-center">
              <button
                onClick={resetSession}
                className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium border border-blue-500"
              >
                Start New Session
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // No charts available
  if (!charts.length) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-gray-300">No charts available. Please try again later.</p>
          <button
            onClick={initializeSession}
            className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors border border-blue-500"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Hot or Not Screen (Chart Analysis)
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        {/* Chart iframe - Square aspect ratio */}
        <div className="mb-8">
          <div className="w-full aspect-square border rounded-lg overflow-hidden bg-gray-800 border-gray-700">
            <iframe
              src={getCurrentChartUrl()}
              className="w-full h-full"
              title={`Chart for ${charts[currentIndex]?.baseToken?.symbol || 'Unknown'}`}
              frameBorder="0"
            />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex justify-center space-x-8">
          <button
            onClick={() => recordChoice('red')}
            className="w-20 h-20 bg-red-500 hover:bg-red-600 text-white rounded-full font-bold text-2xl transition-colors shadow-lg border-2 border-red-400"
          >
            ❌
          </button>
          <button
            onClick={() => recordChoice('green')}
            className="w-20 h-20 bg-green-500 hover:bg-green-600 text-white rounded-full font-bold text-2xl transition-colors shadow-lg border-2 border-green-400"
          >
            ✅
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;