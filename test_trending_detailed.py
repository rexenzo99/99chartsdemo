#!/usr/bin/env python3
"""
Detailed test for the updated /api/trending-charts endpoint
"""

import requests
import json

BACKEND_URL = 'https://de83393e-7b9d-4ad3-abb7-6033b158bf20.preview.emergentagent.com'

print('🔍 Testing Updated /api/trending-charts Endpoint')
print('=' * 60)

try:
    response = requests.get(f'{BACKEND_URL}/api/trending-charts', timeout=30)
    print(f'Status Code: {response.status_code}')
    
    if response.status_code == 200:
        data = response.json()
        charts = data.get('charts', [])
        
        print(f'Total Charts: {len(charts)}')
        print(f'Response Structure: {list(data.keys())}')
        
        if charts:
            print('\n📊 Sample Chart Data:')
            sample = charts[0]
            print(f'  Pair Address: {sample.get("pairAddress", "N/A")}')
            print(f'  Base Token: {sample.get("baseToken", {}).get("symbol", "N/A")}')
            print(f'  Quote Token: {sample.get("quoteToken", {}).get("symbol", "N/A")}')
            print(f'  24h Volume: ${float(sample.get("volume", {}).get("h24", 0)):,.2f}')
            print(f'  Price USD: ${float(sample.get("priceUsd", 0)):,.6f}')
            
            print('\n💰 Volume Analysis:')
            volumes = []
            for chart in charts:
                vol = chart.get('volume', {}).get('h24', 0)
                if vol:
                    volumes.append(float(vol))
            
            if volumes:
                print(f'  Highest Volume: ${max(volumes):,.2f}')
                print(f'  Lowest Volume: ${min(volumes):,.2f}')
                print(f'  Average Volume: ${sum(volumes)/len(volumes):,.2f}')
                print(f'  Pairs >$10k: {sum(1 for v in volumes if v > 10000)}/{len(volumes)}')
            
            print('\n🪙 Token Analysis:')
            base_tokens = [chart.get('baseToken', {}).get('symbol', '') for chart in charts]
            quote_tokens = [chart.get('quoteToken', {}).get('symbol', '') for chart in charts]
            
            current_trending = ['ALT', 'PUMP', 'IPO', 'POWELL', 'MAGA', 'VIRTUAL', 'MOODENG', 'GOAT', 'SPX', 'PNUT', 'FRED', 'CHILLGUY', 'ZEREBRO', 'TURBO', 'ACT', 'WIF', 'POPCAT', 'BONK', 'PEPE', 'SHIB', 'DOGE', 'FLOKI', 'MEME']
            found_trending = [token for token in base_tokens if token.upper() in current_trending]
            
            print(f'  Unique Base Tokens: {len(set(base_tokens))}')
            print(f'  Current Trending Found: {list(set(found_trending))}')
            print(f'  USDT Pairs: {quote_tokens.count("USDT")}')
            print(f'  USDC Pairs: {quote_tokens.count("USDC")}')
            
            print('\n🔗 Chain Analysis:')
            chains = [chart.get('chainId', 'unknown') for chart in charts]
            chain_counts = {}
            for chain in chains:
                chain_counts[chain] = chain_counts.get(chain, 0) + 1
            print(f'  Chain Distribution: {dict(sorted(chain_counts.items(), key=lambda x: x[1], reverse=True))}')
            
        print('\n✅ ENDPOINT VALIDATION COMPLETE')
        
    else:
        print(f'❌ Failed with status code: {response.status_code}')
        print(f'Response: {response.text}')
        
except Exception as e:
    print(f'❌ Exception: {str(e)}')