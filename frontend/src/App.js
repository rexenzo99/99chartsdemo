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
    // Back to working Dexscreener with your custom settings
    return `https://dexscreener.com/${chainId}/${pairAddress}?embed=1&theme=dark&trades=0&info=0&hidegrid=1&hidevolume=1&hidestatus=1&hidelegend=1&hide_top_toolbar=1&hide_side_toolbar=1&intervals_disabled=1&withdateranges=0&details=0&hotlist=0&calendar=0&tab=chart`;
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
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-lg text-gray-300">Loading trending charts...</p>
        </div>
      </div>
    );
  }

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