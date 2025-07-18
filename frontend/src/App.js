import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Simple Confetti Component
const Confetti = ({ isActive }) => {
  const [particles, setParticles] = useState([]);

  useEffect(() => {
    if (isActive) {
      const newParticles = Array.from({ length: 50 }, (_, i) => ({
        id: i,
        x: Math.random() * window.innerWidth,
        y: -10,
        color: ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'][Math.floor(Math.random() * 6)],
        size: Math.random() * 8 + 4,
        speedX: (Math.random() - 0.5) * 4,
        speedY: Math.random() * 3 + 2,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 8
      }));
      setParticles(newParticles);

      const animateParticles = () => {
        setParticles(prevParticles => 
          prevParticles
            .map(particle => ({
              ...particle,
              x: particle.x + particle.speedX,
              y: particle.y + particle.speedY,
              rotation: particle.rotation + particle.rotationSpeed,
              speedY: particle.speedY + 0.1 // gravity
            }))
            .filter(particle => particle.y < window.innerHeight + 20)
        );
      };

      const interval = setInterval(animateParticles, 16);
      const timeout = setTimeout(() => {
        clearInterval(interval);
        setParticles([]);
      }, 5000);

      return () => {
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }
  }, [isActive]);

  if (!isActive || particles.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      {particles.map(particle => (
        <div
          key={particle.id}
          className="absolute rounded-full"
          style={{
            left: particle.x,
            top: particle.y,
            width: particle.size,
            height: particle.size,
            backgroundColor: particle.color,
            transform: `rotate(${particle.rotation}deg)`,
            transition: 'none'
          }}
        />
      ))}
    </div>
  );
};

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
  const [selectedInterval, setSelectedInterval] = useState('1h'); // Default to 1 hour
  const [tournamentCharts, setTournamentCharts] = useState([]); // Charts for tournament
  const [currentMatchup, setCurrentMatchup] = useState({ left: null, right: null }); // Current head-to-head
  const [winnersbracket, setWinnersbracket] = useState([]); // Winners bracket
  const [losersbracket, setLosersbracket] = useState([]); // Losers bracket  
  const [eliminatedCharts, setEliminatedCharts] = useState([]); // Double-eliminated charts
  const [tournamentPhase, setTournamentPhase] = useState('winners'); // 'winners', 'losers', 'grandfinals'
  const [finalRankings, setFinalRankings] = useState([]); // Top 3 results
  const [showConfetti, setShowConfetti] = useState(false); // Confetti animation state
  const [trendingMetadataSessionId, setTrendingMetadataSessionId] = useState(null); // For cached trending data
  const [tournamentProcessing, setTournamentProcessing] = useState(false); // Prevent double-clicks

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
    if (!charts[currentIndex] || !sessionId) {
      console.error('Missing required data:', { 
        hasChart: !!charts[currentIndex], 
        hasSessionId: !!sessionId,
        currentIndex,
        chartsLength: charts.length 
      });
      return;
    }

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

    console.log('Recording choice:', { choice, currentIndex, sessionId, backendUrl: BACKEND_URL });

    try {
      const response = await axios.post(`${BACKEND_URL}/api/record-choice`, choiceData);
      console.log('Choice recorded successfully:', response.data);
      
      // Update local choices state
      setChoices(prev => [...prev, choiceData]);

      // Move to next chart or show results
      if (currentIndex < charts.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        // All charts completed, start tournament
        console.log('Starting tournament with choices:', choices.length + 1);
        startTournament();
      }
    } catch (error) {
      console.error('Failed to record choice:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        url: `${BACKEND_URL}/api/record-choice`
      });
      
      // Still proceed locally even if API fails
      setChoices(prev => [...prev, choiceData]);
      if (currentIndex < charts.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        startTournament();
      }
    }
  };

  const startTournament = () => {
    // Get all the green (positive) choices for tournament
    const greenChoices = choices.filter(choice => choice.choice === 'green');
    const tournamentPool = greenChoices.map(choice => {
      const originalChart = charts[choice.chart_index];
      return {
        ...originalChart,
        choiceIndex: choice.chart_index,
        losses: 0, // Track losses for double elimination
        tournamentId: `${originalChart.pairAddress || originalChart.baseToken?.symbol}_${choice.chart_index}` // Unique ID
      };
    });

    if (tournamentPool.length < 2) {
      // Not enough green choices, show results directly
      showSessionResults();
      return;
    }

    // Remove any potential duplicates by pairAddress
    const uniqueTournamentPool = tournamentPool.filter((chart, index, arr) => 
      arr.findIndex(c => c.pairAddress === chart.pairAddress) === index
    );

    if (uniqueTournamentPool.length < 2) {
      // Still not enough unique charts, show results directly
      showSessionResults();
      return;
    }

    // Set up double elimination tournament
    setTournamentCharts(uniqueTournamentPool);
    setWinnersbracket([...uniqueTournamentPool]);
    setLosersbracket([]);
    setEliminatedCharts([]);
    setTournamentPhase('winners');
    
    // Start first matchup - ensure different charts
    setCurrentMatchup({
      left: uniqueTournamentPool[0],
      right: uniqueTournamentPool[1]
    });
    setCurrentScreen('tournament');
  };

  const selectTournamentWinner = (winner) => {
    // Prevent double-clicks
    if (tournamentProcessing) {
      console.log('Tournament processing, ignoring click');
      return;
    }
    
    setTournamentProcessing(true);
    console.log('Tournament winner selected:', winner.tournamentId); // Debug log
    
    const loser = winner === currentMatchup.left ? currentMatchup.right : currentMatchup.left;
    
    if (tournamentPhase === 'winners') {
      // Winners bracket - loser goes to losers bracket
      const updatedLoser = { ...loser, losses: loser.losses + 1 };
      
      // Remove both from winners bracket using unique identifiers
      const remainingWinners = winnersbracket.filter(chart => 
        chart.tournamentId !== currentMatchup.left.tournamentId && 
        chart.tournamentId !== currentMatchup.right.tournamentId
      );
      
      // Add winner back to winners bracket
      const updatedWinners = [...remainingWinners, winner];
      
      console.log('Winners bracket updated:', updatedWinners.length, 'remaining');
      
      // Update state
      setLosersbracket(prev => [...prev, updatedLoser]);
      setWinnersbracket(updatedWinners);
      
      // Determine next action
      if (updatedWinners.length === 1) {
        // Winners bracket complete, move to losers bracket
        console.log('Winners bracket complete, moving to losers bracket');
        setTournamentPhase('losers');
        
        // Check if we have enough for losers bracket
        setTimeout(() => {
          const currentLosers = [...losersbracket, updatedLoser];
          if (currentLosers.length >= 2) {
            setCurrentMatchup({
              left: currentLosers[0],
              right: currentLosers[1]
            });
          } else {
            // Not enough for losers bracket, go to grand finals
            setTournamentPhase('grandfinals');
            setCurrentMatchup({
              left: updatedWinners[0],
              right: currentLosers[0]
            });
          }
          setTournamentProcessing(false);
        }, 200);
        
      } else if (updatedWinners.length >= 2) {
        // Continue winners bracket
        console.log('Continuing winners bracket');
        setTimeout(() => {
          setCurrentMatchup({
            left: updatedWinners[0],
            right: updatedWinners[1]
          });
          setTournamentProcessing(false);
        }, 200);
      } else {
        // Something went wrong, reset processing
        setTournamentProcessing(false);
      }
      
    } else if (tournamentPhase === 'losers') {
      // Losers bracket - loser is eliminated
      const updatedLoser = { ...loser, losses: loser.losses + 1 };
      
      // Continue in losers bracket using unique identifiers
      const remainingLosers = losersbracket.filter(chart =>
        chart.tournamentId !== currentMatchup.left.tournamentId && 
        chart.tournamentId !== currentMatchup.right.tournamentId
      );
      
      const updatedLosers = [...remainingLosers, winner];
      
      console.log('Losers bracket updated:', updatedLosers.length, 'remaining');
      
      // Update state
      setEliminatedCharts(prev => [...prev, updatedLoser]);
      setLosersbracket(updatedLosers);
      
      // Determine next action
      setTimeout(() => {
        if (updatedLosers.length === 1 && winnersbracket.length === 1) {
          // Ready for grand finals
          console.log('Setting up grand finals');
          setTournamentPhase('grandfinals');
          setCurrentMatchup({
            left: winnersbracket[0],
            right: updatedLosers[0]
          });
        } else if (updatedLosers.length >= 2) {
          // Continue losers bracket
          console.log('Continuing losers bracket');
          setCurrentMatchup({
            left: updatedLosers[0],
            right: updatedLosers[1]
          });
        }
        setTournamentProcessing(false);
      }, 200);
      
    } else if (tournamentPhase === 'grandfinals') {
      console.log('Grand finals decision');
      
      // Grand finals logic
      if (winner.tournamentId === winnersbracket[0].tournamentId) {
        // Winners bracket champion wins - tournament over
        setFinalRankings([
          winner, // 1st place
          loser,  // 2nd place  
          eliminatedCharts[eliminatedCharts.length - 1] // 3rd place (last eliminated)
        ]);
        setShowConfetti(true); // Trigger confetti animation
        setCurrentScreen('results'); // Switch to results screen
        setTournamentProcessing(false); // Re-enable for next session
      } else {
        // Losers bracket champion wins
        const winnersChamp = winnersbracket[0];
        
        // Check if this is the first loss for winners bracket champion
        if (winnersChamp.losses === 0) {
          // Winners bracket champion loses for first time, play one more match
          const resetWinner = { ...winnersChamp, losses: 1 };
          setCurrentMatchup({
            left: winner, // Losers bracket champion
            right: resetWinner // Winners bracket champion with 1 loss
          });
          setTournamentProcessing(false); // Re-enable clicks
        } else {
          // Winners bracket champion has already lost once, losers bracket champion wins tournament
          setFinalRankings([
            winner, // 1st place (losers bracket champion)
            winnersChamp,  // 2nd place (winners bracket champion)
            eliminatedCharts[eliminatedCharts.length - 1] // 3rd place (last eliminated)
          ]);
          setShowConfetti(true); // Trigger confetti animation
          setCurrentScreen('results'); // Switch to results screen
          setTournamentProcessing(false); // Re-enable for next session
        }
      }
    }
  };

  const setupNextMatchup = () => {
    if (tournamentPhase === 'winners' && winnersbracket.length >= 2) {
      // Ensure we don't match the same chart against itself
      const availableCharts = [...winnersbracket];
      const leftChart = availableCharts[0];
      const rightChart = availableCharts[1];
      
      // Double check they're different charts using unique identifiers
      if (leftChart.tournamentId !== rightChart.tournamentId) {
        setCurrentMatchup({
          left: leftChart,
          right: rightChart
        });
      } else {
        console.error('Same chart matchup prevented:', leftChart.tournamentId, rightChart.tournamentId);
        // If somehow same chart, try with different indices
        if (availableCharts.length > 2) {
          setCurrentMatchup({
            left: availableCharts[0],
            right: availableCharts[2]
          });
        }
      }
    } else if (tournamentPhase === 'losers' && losersbracket.length >= 2) {
      // Ensure we don't match the same chart against itself  
      const availableCharts = [...losersbracket];
      const leftChart = availableCharts[0];
      const rightChart = availableCharts[1];
      
      // Double check they're different charts using unique identifiers
      if (leftChart.tournamentId !== rightChart.tournamentId) {
        setCurrentMatchup({
          left: leftChart,
          right: rightChart
        });
      } else {
        console.error('Same chart matchup prevented:', leftChart.tournamentId, rightChart.tournamentId);
        // If somehow same chart, try with different indices
        if (availableCharts.length > 2) {
          setCurrentMatchup({
            left: availableCharts[0],
            right: availableCharts[2]
          });
        }
      }
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
    
    console.log('Current chart data:', pair); // Debug log
    console.log('Selected interval:', selectedInterval); // Debug log
    
    // Convert interval format for Dexscreener (if needed)
    const intervalMap = {
      '15m': '15',
      '30m': '30', 
      '1h': '60',
      '4h': '240',
      '1d': 'D',
      '1w': 'W'
    };
    
    const dexInterval = intervalMap[selectedInterval] || '60'; // Default to 1h
    
    // Check if this is cached trending data
    if (pair.isCached || (pair.isCustom && !pair.isMock && pair.pairAddress && pair.chainId)) {
      // Use real Dexscreener pair data with selected interval
      const chainId = pair.chainId;
      const pairAddress = pair.pairAddress;
      console.log(`Loading cached/real chart: ${chainId}/${pairAddress} with interval ${selectedInterval}`);
      return `https://dexscreener.com/${chainId}/${pairAddress}?embed=1&theme=dark&trades=0&info=0&hidegrid=1&hidevolume=1&hidestatus=1&hidelegend=1&hide_top_toolbar=1&hide_side_toolbar=1&intervals_disabled=1&withdateranges=0&details=0&hotlist=0&calendar=0&tab=chart&interval=${dexInterval}`;
    } else if (pair.isCustom && pair.isMock) {
      // Fallback for tokens with no pairs found
      const baseSymbol = pair.baseToken?.symbol || 'BTC';
      console.log(`Loading fallback search for: ${baseSymbol} with interval ${selectedInterval}`);
      return `https://dexscreener.com/?q=${baseSymbol}&embed=1&theme=dark&interval=${dexInterval}`;
    } else {
      // Original trending charts data with selected interval
      const chainId = pair.chainId;
      const pairAddress = pair.pairAddress;
      return `https://dexscreener.com/${chainId}/${pairAddress}?embed=1&theme=dark&trades=0&info=0&hidegrid=1&hidevolume=1&hidestatus=1&hidelegend=1&hide_top_toolbar=1&hide_side_toolbar=1&intervals_disabled=1&withdateranges=0&details=0&hotlist=0&calendar=0&tab=chart&interval=${dexInterval}`;
    }
  };

  const resetSession = () => {
    setCurrentIndex(0);
    setChoices([]);
    setShowResults(false);
    setSessionResults(null);
    setUsingCustomTickers(false); // Reset custom ticker flag
    setWinnersbracket([]);
    setLosersbracket([]);
    setEliminatedCharts([]);
    setTournamentPhase('winners');
    setFinalRankings([]);
    setShowConfetti(false); // Reset confetti
    setTrendingMetadataSessionId(null); // Reset trending metadata
    setTournamentProcessing(false); // Reset processing state
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
      console.log('Loading trending search...'); // Debug log
      
      // Use existing backend API for trending tokens
      const response = await axios.get(`${BACKEND_URL}/api/trending-charts`);
      console.log('Trending response:', response.data); // Debug log
      
      if (response.data.success && response.data.charts) {
        const charts = response.data.charts;
        console.log(`Got ${charts.length} trending charts`); // Debug log
        
        // Generate a temporary session ID for metadata storage
        const metadataSessionId = `trending_${Date.now()}`;
        
        // Store the full charts metadata in backend
        try {
          await axios.post(`${BACKEND_URL}/api/store-trending-metadata`, {
            session_id: metadataSessionId,
            charts: charts
          });
          
          console.log('Metadata stored successfully'); // Debug log
          
          // Store the session ID in frontend state for later use
          setTrendingMetadataSessionId(metadataSessionId);
        } catch (metadataError) {
          console.error('Failed to store trending metadata:', metadataError);
        }
        
        // Populate UI with ticker symbols
        const newTickers = Array(32).fill(''); // Start with empty array
        charts.forEach((chart, index) => {
          if (index < 32 && chart.baseToken?.symbol && chart.quoteToken?.symbol) {
            // Use actual pair from dexscreener data
            const baseSymbol = chart.baseToken.symbol.toUpperCase();
            const quoteSymbol = chart.quoteToken.symbol.toUpperCase();
            newTickers[index] = `${baseSymbol}${quoteSymbol}`;
          }
        });
        
        console.log('Setting tickers:', newTickers.slice(0, 5)); // Debug log
        setTickers(newTickers);
      }
    } catch (error) {
      console.error('Failed to load trending search tokens:', error);
    } finally {
      setLoading(false); // Always reset loading state
    }
  };

  const clearAllTickers = () => {
    setTickers(Array(32).fill(''));
  };

  const startHotOrNot = async () => {
    // Filter out empty tickers and randomize
    const filledTickers = tickers.filter(ticker => ticker.trim() !== '');
    
    if (filledTickers.length === 0) {
      alert('Please add some tickers before starting analysis!');
      return;
    }
    
    setLoading(true);
    
    // Check if we have cached trending metadata
    if (trendingMetadataSessionId) {
      try {
        console.log('Using cached trending metadata...'); // Debug log
        
        // Get cached metadata from backend
        const metadataResponse = await axios.get(`${BACKEND_URL}/api/get-trending-metadata/${trendingMetadataSessionId}`);
        
        if (metadataResponse.data.success && metadataResponse.data.charts) {
          const cachedCharts = metadataResponse.data.charts;
          
          // Match filled tickers with cached chart data
          const matchedCharts = [];
          
          for (const ticker of filledTickers) {
            // Find matching chart in cached data
            const matchingChart = cachedCharts.find(chart => {
              if (chart.baseToken?.symbol && chart.quoteToken?.symbol) {
                const cachedTicker = `${chart.baseToken.symbol.toUpperCase()}${chart.quoteToken.symbol.toUpperCase()}`;
                return cachedTicker === ticker;
              }
              return false;
            });
            
            if (matchingChart) {
              matchedCharts.push({
                ...matchingChart,
                originalTicker: ticker,
                isCustom: true,
                isCached: true // Flag to indicate this is cached data
              });
            }
          }
          
          if (matchedCharts.length > 0) {
            console.log(`Found ${matchedCharts.length} cached charts for trending tickers`);
            
            // Randomize the matched charts
            const randomizedCharts = [...matchedCharts].sort(() => Math.random() - 0.5);
            
            // Set up for analysis with cached data
            setUsingCustomTickers(true);
            setCharts(randomizedCharts);
            setCurrentScreen('hot-or-not');
            setCurrentIndex(0);
            setLoading(false);
            
            // Generate session ID for this analysis
            generateCustomSession();
            return;
          }
        }
      } catch (metadataError) {
        console.error('Failed to get cached metadata, falling back to search:', metadataError);
      }
    }
    
    // Fallback: Original search logic for non-cached tickers
    console.log('Using search fallback for custom tickers...'); // Debug log
    
    // Randomize the tickers
    const randomizedTickers = [...filledTickers].sort(() => Math.random() - 0.5);
    
    console.log('Custom tickers being used:', randomizedTickers); // Debug log
    
    // Fetch actual pair data for each ticker from Dexscreener
    const customCharts = [];
    
    for (const ticker of randomizedTickers) {
      try {
        const baseSymbol = ticker.replace(/USDT$|USDC$|SOL$|ETH$/i, '');
        console.log(`Searching for pairs for ${baseSymbol}...`);
        
        // Use Dexscreener search API to find actual pairs
        const response = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${baseSymbol}`);
        const data = await response.json();
        
        if (data.pairs && data.pairs.length > 0) {
          // Filter for USDT and USDC pairs first
          const usdtPairs = data.pairs.filter(pair => {
            const quoteSymbol = pair.quoteToken?.symbol?.toLowerCase();
            return quoteSymbol === 'usdt' || quoteSymbol === 'usdc';
          });
          
          // If we have USDT/USDC pairs, use them; otherwise fall back to all pairs
          const relevantPairs = usdtPairs.length > 0 ? usdtPairs : data.pairs;
          
          // Find the best pair (highest volume) from relevant pairs
          const bestPair = relevantPairs.sort((a, b) => {
            const volumeA = parseFloat(a.volume?.h24 || 0);
            const volumeB = parseFloat(b.volume?.h24 || 0);
            return volumeB - volumeA;
          })[0];
          
          console.log(`Found pair for ${baseSymbol}: ${bestPair.baseToken?.symbol}/${bestPair.quoteToken?.symbol} on ${bestPair.chainId}`);
          
          customCharts.push({
            ...bestPair,
            originalTicker: ticker,
            isCustom: true
          });
        } else {
          // Fallback: create mock data if no pairs found
          customCharts.push({
            chainId: 'ethereum',
            pairAddress: `mock_${ticker}_${Date.now()}`,
            baseToken: {
              symbol: baseSymbol,
              name: `${baseSymbol} Token`
            },
            priceUsd: (Math.random() * 100).toFixed(6),
            priceChange: {
              h24: ((Math.random() - 0.5) * 20).toFixed(2)
            },
            volume: {
              h24: (Math.random() * 1000000).toFixed(0)
            },
            originalTicker: ticker,
            isCustom: true,
            isMock: true
          });
        }
      } catch (error) {
        console.error(`Failed to fetch data for ${ticker}:`, error);
        // Add mock data as fallback
        const baseSymbol = ticker.replace(/USDT$|USDC$|SOL$|ETH$/i, '');
        customCharts.push({
          chainId: 'ethereum',
          pairAddress: `mock_${ticker}_${Date.now()}`,
          baseToken: {
            symbol: baseSymbol,
            name: `${baseSymbol} Token`
          },
          priceUsd: (Math.random() * 100).toFixed(6),
          priceChange: {
            h24: ((Math.random() - 0.5) * 20).toFixed(2)
          },
          volume: {
            h24: (Math.random() * 1000000).toFixed(0)
          },
          originalTicker: ticker,
          isCustom: true,
          isMock: true
        });
      }
    }
    
    console.log('Final charts data:', customCharts);
    
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
    const intervals = ['15m', '30m', '1h', '4h', '1d', '1w'];
    
    return (
      <div className="min-h-screen bg-gray-900 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-4">Select Your Tickers</h1>
            <p className="text-gray-300 text-lg">
              Enter up to 32 ticker symbols to analyze
            </p>
          </div>

          {/* Header with buttons and interval selector */}
          <div className="flex justify-between items-center mb-6">
            {/* Auto-populate buttons */}
            <div className="flex space-x-4">
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

            {/* Interval selector */}
            <div className="flex items-center space-x-3">
              <span className="text-white font-medium">Select Interval:</span>
              <div className="flex space-x-1 bg-gray-800 p-1 rounded-lg border border-gray-600">
                {intervals.map((interval) => (
                  <button
                    key={interval}
                    onClick={() => setSelectedInterval(interval)}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      selectedInterval === interval
                        ? 'bg-blue-600 text-white border border-blue-500'
                        : 'text-gray-300 hover:text-white hover:bg-gray-700'
                    }`}
                  >
                    {interval}
                  </button>
                ))}
              </div>
            </div>
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

  // Tournament Screen (Step 3)
  if (currentScreen === 'tournament') {
    const getChartUrl = (chart) => {
      // Add null safety check
      if (!chart) return '';
      
      const intervalMap = {
        '15m': '15',
        '30m': '30', 
        '1h': '60',
        '4h': '240',
        '1d': 'D',
        '1w': 'W'
      };
      
      const dexInterval = intervalMap[selectedInterval] || '60';
      
      if (chart.isCustom && !chart.isMock) {
        return `https://dexscreener.com/${chart.chainId}/${chart.pairAddress}?embed=1&theme=dark&trades=0&info=0&hidegrid=1&hidevolume=1&hidestatus=1&hidelegend=1&hide_top_toolbar=1&hide_side_toolbar=1&intervals_disabled=1&withdateranges=0&details=0&hotlist=0&calendar=0&tab=chart&interval=${dexInterval}`;
      } else {
        return `https://dexscreener.com/${chart.chainId}/${chart.pairAddress}?embed=1&theme=dark&trades=0&info=0&hidegrid=1&hidevolume=1&hidestatus=1&hidelegend=1&hide_top_toolbar=1&hide_side_toolbar=1&intervals_disabled=1&withdateranges=0&details=0&hotlist=0&calendar=0&tab=chart&interval=${dexInterval}`;
      }
    };

    const getTournamentStatus = () => {
      const totalCharts = winnersbracket.length + losersbracket.length + eliminatedCharts.length;
      return {
        phase: tournamentPhase === 'winners' ? 'Winners Bracket' : 
               tournamentPhase === 'losers' ? 'Losers Bracket' : 'Grand Finals',
        remaining: winnersbracket.length + losersbracket.length,
        eliminated: eliminatedCharts.length,
        total: totalCharts
      };
    };

    const status = getTournamentStatus();

    // Safety check for current matchup
    if (!currentMatchup.left || !currentMatchup.right) {
      return (
        <div className="min-h-screen bg-gray-900 p-6">
          <div className="max-w-7xl mx-auto">
            <div className="text-center">
              <h1 className="text-3xl font-bold text-white mb-4">🏆 Tournament Mode</h1>
              <p className="text-gray-300 text-lg">
                Setting up next matchup...
              </p>
              <div className="mt-4 text-sm text-gray-400">
                {status.phase} | Remaining: {status.remaining} | Eliminated: {status.eliminated}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gray-900 p-6">
        <div className="max-w-7xl mx-auto">
          {/* Tournament Header */}
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-white mb-2">🏆 Tournament Mode</h1>
            <p className="text-gray-300 text-lg mb-2">
              Choose the better chart - Head to Head
            </p>
            <div className="text-sm text-gray-400">
              {status.phase} | Remaining: {status.remaining} | Eliminated: {status.eliminated}
            </div>
          </div>

          {/* Side by Side Charts */}
          <div className="relative">
            <div className="grid grid-cols-2 gap-8 mb-8">
              {/* Left Chart */}
              <div className="space-y-4">
                <div className="text-center">
                  <h3 className="text-xl font-bold text-white mb-3">Chart A</h3>
                </div>
                <div 
                  className="w-full aspect-square border-4 rounded-lg overflow-hidden bg-gray-800 transition-all duration-300 hover:border-blue-500 border-gray-600"
                >
                  <iframe
                    key={`tournament-left-${currentMatchup.left?.pairAddress}-${selectedInterval}`}
                    src={getChartUrl(currentMatchup.left)}
                    className="w-full h-full"
                    title="Anonymous Chart A"
                    frameBorder="0"
                  />
                </div>
                <div className="text-center">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      selectTournamentWinner(currentMatchup.left);
                    }}
                    disabled={tournamentProcessing}
                    className={`px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-lg transition-colors border-2 border-blue-500 shadow-lg ${
                      tournamentProcessing ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {tournamentProcessing ? 'Processing...' : 'Choose Chart A'}
                  </button>
                </div>
              </div>

              {/* Right Chart */}
              <div className="space-y-4">
                <div className="text-center">
                  <h3 className="text-xl font-bold text-white mb-3">Chart B</h3>
                </div>
                <div 
                  className="w-full aspect-square border-4 rounded-lg overflow-hidden bg-gray-800 transition-all duration-300 hover:border-blue-500 border-gray-600"
                >
                  <iframe
                    key={`tournament-right-${currentMatchup.right?.pairAddress}-${selectedInterval}`}
                    src={getChartUrl(currentMatchup.right)}
                    className="w-full h-full"
                    title="Anonymous Chart B"
                    frameBorder="0"
                  />
                </div>
                <div className="text-center">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      selectTournamentWinner(currentMatchup.right);
                    }}
                    disabled={tournamentProcessing}
                    className={`px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-lg transition-colors border-2 border-blue-500 shadow-lg ${
                      tournamentProcessing ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {tournamentProcessing ? 'Processing...' : 'Choose Chart B'}
                  </button>
                </div>
              </div>
            </div>

            {/* VS Divider - Centered between charts */}
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-16 z-10">
              <div className="bg-gray-800 border-4 border-gray-600 rounded-full w-16 h-16 flex items-center justify-center shadow-lg">
                <span className="text-white font-bold text-lg">VS</span>
              </div>
            </div>
          </div>

          {/* Tournament Progress */}
          <div className="text-center">
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-600 inline-block">
              <span className="text-gray-300">Tournament Status: </span>
              <span className="text-blue-400 font-bold">{status.phase}</span>
            </div>
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

  // Results Screen (Step 4)
  if (currentScreen === 'results' && (sessionResults || finalRankings.length > 0)) {
    const getChartUrl = (chart) => {
      const intervalMap = {
        '15m': '15',
        '30m': '30', 
        '1h': '60',
        '4h': '240',
        '1d': 'D',
        '1w': 'W'
      };
      
      const dexInterval = intervalMap[selectedInterval] || '60';
      
      if (chart.isCustom && !chart.isMock) {
        return `https://dexscreener.com/${chart.chainId}/${chart.pairAddress}?embed=1&theme=dark&trades=0&info=0&hidegrid=1&hidevolume=1&hidestatus=1&hidelegend=1&hide_top_toolbar=1&hide_side_toolbar=1&intervals_disabled=1&withdateranges=0&details=0&hotlist=0&calendar=0&tab=chart&interval=${dexInterval}`;
      } else {
        return `https://dexscreener.com/${chart.chainId}/${chart.pairAddress}?embed=1&theme=dark&trades=0&info=0&hidegrid=1&hidevolume=1&hidestatus=1&hidelegend=1&hide_top_toolbar=1&hide_side_toolbar=1&intervals_disabled=1&withdateranges=0&details=0&hotlist=0&calendar=0&tab=chart&interval=${dexInterval}`;
      }
    };

    // If we have tournament results, show tournament-style results
    if (finalRankings.length > 0) {
      const winnerChart = finalRankings[0];
      
      return (
        <div className="min-h-screen bg-gray-900 p-6">
          <Confetti isActive={showConfetti} />
          <div className="max-w-7xl mx-auto">
            {/* Wide-screen results header */}
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold text-white mb-4">🏆 Your Favorite Chart!</h1>
            </div>

            {/* Winner chart display - vertical format */}
            <div className="mb-8 flex justify-center">
              <div className="w-2/3 h-[600px] border-4 border-yellow-500 rounded-lg overflow-hidden bg-gray-800 shadow-2xl">
                <iframe
                  key={`winner-${winnerChart?.pairAddress}-${selectedInterval}`}
                  src={getChartUrl(winnerChart)}
                  className="w-full h-full"
                  title="Tournament Winner Chart"
                  frameBorder="0"
                />
              </div>
            </div>

            {/* Tournament results table */}
            <div className="bg-gray-800 rounded-lg border border-gray-600 overflow-hidden mb-8">
              <table className="w-full">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-6 py-4 text-left text-white font-bold">Rank</th>
                    <th className="px-6 py-4 text-left text-white font-bold">Symbol</th>
                    <th className="px-6 py-4 text-center text-white font-bold">Win</th>
                    <th className="px-6 py-4 text-center text-white font-bold">Lose</th>
                  </tr>
                </thead>
                <tbody>
                  {finalRankings.map((chart, index) => {
                    const symbol = chart.baseToken?.symbol || 'UNKNOWN';
                    const wins = Math.floor(Math.random() * 5) + index === 0 ? 4 : index === 1 ? 3 : 2; // Mock wins for now
                    const losses = chart.losses || 0;
                    
                    return (
                      <tr key={index} className={`border-t border-gray-600 ${index === 0 ? 'bg-yellow-900/20' : index === 1 ? 'bg-gray-700/30' : 'bg-orange-900/20'}`}>
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-2">
                            <span className="text-2xl">
                              {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                            </span>
                            <span className="text-white font-bold">
                              {index === 0 ? '1st' : index === 1 ? '2nd' : '3rd'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-white font-bold text-lg">
                          {symbol}USDT
                        </td>
                        <td className="px-6 py-4 text-center text-green-400 font-bold text-lg">
                          {wins}
                        </td>
                        <td className="px-6 py-4 text-center text-red-400 font-bold text-lg">
                          {losses}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Start Over button */}
            <div className="text-center">
              <button
                onClick={resetSession}
                className="px-12 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xl transition-colors border-2 border-blue-500 shadow-lg"
              >
                Start Over
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Original hot_or_not results (fallback)
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
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4 relative">
      {/* Progress bar - top right */}
      <div className="absolute top-6 right-6 z-10">
        <div className="bg-gray-800 rounded-lg p-3 border border-gray-600 shadow-lg">
          <div className="flex items-center space-x-3">
            <span className="text-gray-300 text-sm font-medium">
              {currentIndex + 1} / {charts.length}
            </span>
            <div className="w-24 h-2 bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${((currentIndex + 1) / charts.length) * 100}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full max-w-4xl">
        {/* Chart iframe - Responsive height to ensure buttons are visible */}
        <div className="mb-6">
          <div className="w-full h-[60vh] max-h-[600px] border rounded-lg overflow-hidden bg-gray-800 border-gray-700">
            <iframe
              key={`chart-${currentIndex}-${selectedInterval}`}
              src={getCurrentChartUrl()}
              className="w-full h-full"
              title={`Chart for ${charts[currentIndex]?.baseToken?.symbol || 'Unknown'}`}
              frameBorder="0"
            />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex justify-center space-x-8 pb-8">
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