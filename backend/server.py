from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from pydantic import BaseModel
import requests
import os
from typing import List, Optional
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio
from datetime import datetime
import uuid

app = FastAPI(title="Charts Demo API")

# Add security middleware
app.add_middleware(HTTPSRedirectMiddleware)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["*"])

# Security headers middleware
@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage for trending metadata (in production, use Redis/database)
trending_metadata_cache = {}

# MongoDB connection
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017/chartsdemo')
client = AsyncIOMotorClient(MONGO_URL)
db = client.chartsdemo

# Pydantic models
class ChartChoice(BaseModel):
    session_id: str
    chart_index: int
    chart_data: dict
    choice: str  # "green" or "red"
    timestamp: datetime

class SessionResult(BaseModel):
    session_id: str
    total_charts: int
    green_count: int
    red_count: int
    choices: List[dict]

@app.get("/")
async def root():
    return {"message": "Charts Demo API is running"}

@app.post("/api/store-trending-metadata")
async def store_trending_metadata(metadata: dict):
    """Store trending charts metadata temporarily"""
    session_id = metadata.get('session_id')
    charts_data = metadata.get('charts', [])
    
    if not session_id or not charts_data:
        raise HTTPException(status_code=400, detail="Missing session_id or charts data")
    
    try:
        trending_metadata_cache[session_id] = charts_data
        return {"success": True, "message": f"Stored metadata for {len(charts_data)} charts"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to store metadata: {str(e)}")

@app.get("/api/get-trending-metadata/{session_id}")
async def get_trending_metadata(session_id: str):
    """Retrieve stored trending charts metadata"""
    if session_id not in trending_metadata_cache:
        raise HTTPException(status_code=404, detail="No trending metadata found for this session")
    
    try:
        return {
            "success": True,
            "charts": trending_metadata_cache[session_id]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get metadata: {str(e)}")

@app.get("/api/trending-charts")
async def get_trending_charts():
    """Fetch top 32 trending charts from multiple sources"""
    try:
        all_pairs = []
        
        # Method 1: Get boosted tokens (these are currently trending/promoted)
        try:
            url = "https://api.dexscreener.com/token-boosts/latest/v1"
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            
            boosted_data = response.json()
            if boosted_data and len(boosted_data) > 0:
                # Convert boosted tokens to pairs by searching for each
                for boost in boosted_data[:20]:  # Take top 20 boosted
                    try:
                        token_addr = boost.get('tokenAddress')
                        chain_id = boost.get('chainId')
                        if token_addr and chain_id:
                            # Search for pairs using token address
                            search_url = f"https://api.dexscreener.com/latest/dex/search?q={token_addr}"
                            search_response = requests.get(search_url, timeout=5)
                            search_response.raise_for_status()
                            
                            search_data = search_response.json()
                            pairs = search_data.get('pairs', [])
                            
                            if pairs:
                                # Take the highest volume pair for this token
                                best_pair = max(pairs, key=lambda x: float(x.get('volume', {}).get('h24', 0) or 0))
                                all_pairs.append(best_pair)
                                
                    except Exception as token_error:
                        print(f"Failed to fetch pair for boosted token {boost.get('tokenAddress', 'unknown')}: {token_error}")
                        continue
                        
        except Exception as boost_error:
            print(f"Failed to get boosted tokens: {boost_error}")
        
        # Method 2: Search for currently popular tokens 
        # These are tokens that are actually trending based on recent market activity
        trending_searches = [
            "ALT", "PUMP", "IPO", "POWELL", "MAGA", "MOODENG", "GOAT", "SPX", 
            "PNUT", "FRED", "CHILLGUY", "ZEREBRO", "VIRTUAL", "TURBO", "ACT",
            "WIF", "POPCAT", "BONK", "PEPE", "SHIB", "DOGE", "FLOKI", "MEME"
        ]
        
        for token in trending_searches:
            try:
                search_url = f"https://api.dexscreener.com/latest/dex/search?q={token}"
                response = requests.get(search_url, timeout=5)
                response.raise_for_status()
                
                data = response.json()
                pairs = data.get('pairs', [])
                
                if pairs:
                    # Filter for USDT/USDC pairs with good volume
                    usdt_pairs = [p for p in pairs if p.get('quoteToken', {}).get('symbol', '').upper() in ['USDT', 'USDC']]
                    target_pairs = usdt_pairs if usdt_pairs else pairs
                    
                    # Take the best pair (highest 24h volume)
                    best_pair = max(target_pairs, key=lambda x: float(x.get('volume', {}).get('h24', 0) or 0))
                    
                    # Only add if it has significant volume (>$10k)
                    volume_24h = float(best_pair.get('volume', {}).get('h24', 0) or 0)
                    if volume_24h > 10000:
                        all_pairs.append(best_pair)
                        
            except Exception as search_error:
                print(f"Failed to search for {token}: {search_error}")
                continue
        
        # Remove duplicates based on pair address
        seen_addresses = set()
        unique_pairs = []
        for pair in all_pairs:
            pair_addr = pair.get('pairAddress')
            if pair_addr and pair_addr not in seen_addresses:
                seen_addresses.add(pair_addr)
                unique_pairs.append(pair)
        
        # Sort by 24h volume (highest first) and take top 32
        unique_pairs.sort(key=lambda x: float(x.get('volume', {}).get('h24', 0) or 0), reverse=True)
        top_trending = unique_pairs[:32]
        
        if top_trending:
            return {
                "success": True,
                "charts": top_trending,
                "total": len(top_trending)
            }
        
        # Final fallback: Return empty if nothing works
        raise HTTPException(status_code=500, detail="Could not fetch trending charts")
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch trending charts: {str(e)}")

@app.post("/api/record-choice")
async def record_choice(choice_data: ChartChoice):
    """Record user's choice for a chart"""
    try:
        choice_dict = choice_data.dict()
        choice_dict['timestamp'] = datetime.utcnow()
        
        await db.choices.insert_one(choice_dict)
        return {"success": True, "message": "Choice recorded"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to record choice: {str(e)}")

@app.get("/api/session-results/{session_id}")
async def get_session_results(session_id: str):
    """Get results for a specific session"""
    try:
        choices = await db.choices.find({"session_id": session_id}).to_list(length=None)
        
        if not choices:
            raise HTTPException(status_code=404, detail="Session not found")
        
        green_count = sum(1 for choice in choices if choice['choice'] == 'green')
        red_count = sum(1 for choice in choices if choice['choice'] == 'red')
        
        # Clean up choices for response
        clean_choices = []
        for choice in choices:
            clean_choice = {
                "chart_index": choice["chart_index"],
                "choice": choice["choice"],
                "timestamp": choice["timestamp"],
                "chart_data": choice.get("chart_data", {})
            }
            clean_choices.append(clean_choice)
        
        return {
            "session_id": session_id,
            "total_charts": len(choices),
            "green_count": green_count,
            "red_count": red_count,
            "choices": clean_choices
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get session results: {str(e)}")

@app.get("/api/generate-session")
async def generate_session():
    """Generate a new session ID"""
    session_id = str(uuid.uuid4())
    return {"session_id": session_id}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)