from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
import os
from typing import List, Optional
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio
from datetime import datetime
import uuid

app = FastAPI(title="Charts Demo API")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

@app.get("/api/trending-charts")
async def get_trending_charts():
    """Fetch your 3 specific trading pairs from Dexscreener"""
    try:
        all_pairs = []
        
        # Your specific tokens
        search_tokens = ["BTC", "ETH", "SOL"]
        
        for token in search_tokens:
            try:
                url = f"https://api.dexscreener.com/latest/dex/search?q={token}"
                response = requests.get(url, timeout=10)
                response.raise_for_status()
                
                data = response.json()
                pairs = data.get('pairs', [])
                
                if pairs:
                    # Take just the first best pair for each token
                    all_pairs.append(pairs[0])
                    
            except Exception as search_error:
                print(f"Failed to search for {token}: {search_error}")
                continue
        
        return {
            "success": True,
            "charts": all_pairs,
            "total": len(all_pairs)
        }
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