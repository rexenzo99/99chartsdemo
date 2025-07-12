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

  useEffect(() => {
    initializeSession();
  }, []);

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
    const chainId = pair.chainId;
    const pairAddress = pair.pairAddress;
    return `https://dexscreener.com/${chainId}/${pairAddress}`;
  };

  const resetSession = () => {
    setCurrentIndex(0);
    setChoices([]);
    setShowResults(false);
    setSessionResults(null);
    initializeSession();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-lg text-gray-600">Loading trending charts...</p>
        </div>
      </div>
    );
  }

  if (showResults && sessionResults) {
    return (
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h1 className="text-3xl font-bold text-center mb-8 text-gray-800">
              Session Results
            </h1>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-blue-50 p-6 rounded-lg text-center">
                <div className="text-3xl font-bold text-blue-600">{sessionResults.total_charts}</div>
                <div className="text-gray-600">Total Charts</div>
              </div>
              <div className="bg-green-50 p-6 rounded-lg text-center">
                <div className="text-3xl font-bold text-green-600">{sessionResults.green_count}</div>
                <div className="text-gray-600">Green Choices</div>
              </div>
              <div className="bg-red-50 p-6 rounded-lg text-center">
                <div className="text-3xl font-bold text-red-600">{sessionResults.red_count}</div>
                <div className="text-gray-600">Red Choices</div>
              </div>
            </div>

            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4 text-gray-800">Choice Summary</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
                {sessionResults.choices.map((choice, index) => (
                  <div key={index} className="border rounded-lg p-4 bg-gray-50">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium">{choice.chart_data.symbol}</span>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                        choice.choice === 'green' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {choice.choice.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">
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
                className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Start New Session
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!charts.length) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-gray-600">No charts available. Please try again later.</p>
          <button
            onClick={initializeSession}
            className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const currentChart = charts[currentIndex];

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-800">Chart Analysis Demo</h1>
            <div className="text-right">
              <div className="text-sm text-gray-600">Progress</div>
              <div className="text-lg font-semibold text-blue-600">
                {currentIndex + 1} / {charts.length}
              </div>
            </div>
          </div>
          
          {/* Progress bar */}
          <div className="mt-4 w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / charts.length) * 100}%` }}
            ></div>
          </div>
        </div>

        {/* Chart Info */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-gray-600">Token</div>
              <div className="font-semibold">{currentChart.baseToken?.symbol || 'Unknown'}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Name</div>
              <div className="font-semibold">{currentChart.baseToken?.name || 'Unknown'}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Price</div>
              <div className="font-semibold">${parseFloat(currentChart.priceUsd || 0).toFixed(6)}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">24h Change</div>
              <div className={`font-semibold ${
                parseFloat(currentChart.priceChange?.h24 || 0) >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {parseFloat(currentChart.priceChange?.h24 || 0).toFixed(2)}%
              </div>
            </div>
          </div>
        </div>

        {/* Chart iframe */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="w-full h-96 border rounded-lg overflow-hidden">
            <iframe
              src={getCurrentChartUrl()}
              className="w-full h-full"
              title={`Chart for ${currentChart.baseToken?.symbol || 'Unknown'}`}
              frameBorder="0"
            />
          </div>
        </div>

        {/* Action buttons */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="text-center mb-4">
            <p className="text-lg text-gray-700">
              What's your sentiment for this chart?
            </p>
          </div>
          
          <div className="flex justify-center space-x-8">
            <button
              onClick={() => recordChoice('red')}
              className="px-12 py-4 bg-red-500 hover:bg-red-600 text-white rounded-lg font-semibold text-lg transition-colors shadow-lg"
            >
              🔴 Bearish
            </button>
            <button
              onClick={() => recordChoice('green')}
              className="px-12 py-4 bg-green-500 hover:bg-green-600 text-white rounded-lg font-semibold text-lg transition-colors shadow-lg"
            >
              🟢 Bullish
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;