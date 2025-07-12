#!/usr/bin/env python3
"""
Comprehensive Backend API Testing for Charts Demo
Tests all API endpoints and functionality as specified in the review request.
"""

import requests
import json
import time
from datetime import datetime
import uuid

# Backend URL from environment
BACKEND_URL = "https://de83393e-7b9d-4ad3-abb7-6033b158bf20.preview.emergentagent.com"

class ChartsDemoAPITester:
    def __init__(self):
        self.base_url = BACKEND_URL
        self.session_id = None
        self.test_results = {
            "total_tests": 0,
            "passed_tests": 0,
            "failed_tests": 0,
            "test_details": []
        }
    
    def log_test(self, test_name, passed, details=""):
        """Log test results"""
        self.test_results["total_tests"] += 1
        if passed:
            self.test_results["passed_tests"] += 1
            status = "✅ PASS"
        else:
            self.test_results["failed_tests"] += 1
            status = "❌ FAIL"
        
        result = f"{status}: {test_name}"
        if details:
            result += f" - {details}"
        
        self.test_results["test_details"].append(result)
        print(result)
    
    def test_root_endpoint(self):
        """Test the root endpoint"""
        try:
            response = requests.get(f"{self.base_url}/")
            if response.status_code == 200:
                data = response.json()
                if "message" in data:
                    self.log_test("Root endpoint", True, f"Response: {data['message']}")
                    return True
                else:
                    self.log_test("Root endpoint", False, "Missing message in response")
                    return False
            else:
                self.log_test("Root endpoint", False, f"Status code: {response.status_code}")
                return False
        except Exception as e:
            self.log_test("Root endpoint", False, f"Exception: {str(e)}")
            return False
    
    def test_generate_session(self):
        """Test GET /api/generate-session endpoint"""
        try:
            response = requests.get(f"{self.base_url}/api/generate-session")
            if response.status_code == 200:
                data = response.json()
                if "session_id" in data and data["session_id"]:
                    self.session_id = data["session_id"]
                    # Validate UUID format
                    try:
                        uuid.UUID(self.session_id)
                        self.log_test("Generate session", True, f"Session ID: {self.session_id}")
                        return True
                    except ValueError:
                        self.log_test("Generate session", False, "Invalid UUID format")
                        return False
                else:
                    self.log_test("Generate session", False, "Missing session_id in response")
                    return False
            else:
                self.log_test("Generate session", False, f"Status code: {response.status_code}")
                return False
        except Exception as e:
            self.log_test("Generate session", False, f"Exception: {str(e)}")
            return False
    
    def test_trending_charts(self):
        """Test GET /api/trending-charts endpoint with enhanced validation for new implementation"""
        try:
            response = requests.get(f"{self.base_url}/api/trending-charts", timeout=30)
            if response.status_code == 200:
                data = response.json()
                
                # Check response structure
                required_fields = ["success", "charts", "total"]
                missing_fields = [field for field in required_fields if field not in data]
                if missing_fields:
                    self.log_test("Trending charts structure", False, f"Missing fields: {missing_fields}")
                    return False
                
                # Check if we got charts
                charts = data.get("charts", [])
                total = data.get("total", 0)
                
                if not charts:
                    self.log_test("Trending charts data", False, "No charts returned")
                    return False
                
                if total != len(charts):
                    self.log_test("Trending charts count", False, f"Total mismatch: {total} vs {len(charts)}")
                    return False
                
                # Enhanced validation for new implementation
                self.log_test("Trending charts basic", True, f"Retrieved {len(charts)} charts")
                
                # Validate chart data structure and content
                if charts:
                    first_chart = charts[0]
                    expected_chart_fields = ["pairAddress", "baseToken", "quoteToken", "volume"]
                    missing_chart_fields = [field for field in expected_chart_fields if field not in first_chart]
                    if missing_chart_fields:
                        self.log_test("Chart data structure", False, f"Missing chart fields: {missing_chart_fields}")
                        return False
                
                # Test volume filtering (all pairs should have >$10k 24h volume)
                low_volume_pairs = []
                for i, chart in enumerate(charts):
                    volume_24h = chart.get('volume', {}).get('h24', 0)
                    if volume_24h is not None:
                        try:
                            volume_float = float(volume_24h)
                            if volume_float <= 10000:
                                low_volume_pairs.append(f"Chart {i}: ${volume_float:,.2f}")
                        except (ValueError, TypeError):
                            low_volume_pairs.append(f"Chart {i}: Invalid volume data")
                
                if low_volume_pairs:
                    self.log_test("Volume filtering", False, f"Found {len(low_volume_pairs)} pairs with ≤$10k volume: {low_volume_pairs[:3]}")
                else:
                    self.log_test("Volume filtering", True, "All pairs have >$10k 24h volume")
                
                # Check for current/relevant tokens mentioned in the update
                current_tokens = ["ALT", "PUMP", "IPO", "POWELL", "MAGA", "VIRTUAL", "MOODENG", "GOAT", "SPX", "PNUT", "FRED", "CHILLGUY", "ZEREBRO", "TURBO", "ACT", "WIF", "POPCAT", "BONK", "PEPE", "SHIB", "DOGE", "FLOKI", "MEME"]
                found_current_tokens = []
                for chart in charts:
                    base_symbol = chart.get('baseToken', {}).get('symbol', '').upper()
                    if base_symbol in current_tokens:
                        found_current_tokens.append(base_symbol)
                
                if found_current_tokens:
                    self.log_test("Current tokens", True, f"Found {len(set(found_current_tokens))} current trending tokens: {list(set(found_current_tokens))[:5]}")
                else:
                    self.log_test("Current tokens", False, "No current trending tokens found in results")
                
                # Check for USDT/USDC pairs preference
                usdt_usdc_pairs = []
                for chart in charts:
                    quote_symbol = chart.get('quoteToken', {}).get('symbol', '').upper()
                    if quote_symbol in ['USDT', 'USDC']:
                        usdt_usdc_pairs.append(quote_symbol)
                
                usdt_usdc_percentage = (len(usdt_usdc_pairs) / len(charts)) * 100
                self.log_test("USDT/USDC pairs", True, f"{len(usdt_usdc_pairs)}/{len(charts)} pairs ({usdt_usdc_percentage:.1f}%) are USDT/USDC")
                
                # Check for duplicates (should be removed)
                pair_addresses = [chart.get('pairAddress') for chart in charts if chart.get('pairAddress')]
                unique_addresses = set(pair_addresses)
                if len(pair_addresses) == len(unique_addresses):
                    self.log_test("Duplicate removal", True, "No duplicate pair addresses found")
                else:
                    duplicates = len(pair_addresses) - len(unique_addresses)
                    self.log_test("Duplicate removal", False, f"Found {duplicates} duplicate pair addresses")
                
                # Check volume sorting (should be sorted by 24h volume, highest first)
                volumes = []
                for chart in charts:
                    volume_24h = chart.get('volume', {}).get('h24', 0)
                    if volume_24h is not None:
                        try:
                            volumes.append(float(volume_24h))
                        except (ValueError, TypeError):
                            volumes.append(0)
                
                is_sorted = all(volumes[i] >= volumes[i+1] for i in range(len(volumes)-1))
                if is_sorted:
                    self.log_test("Volume sorting", True, f"Charts properly sorted by volume (${volumes[0]:,.0f} to ${volumes[-1]:,.0f})")
                else:
                    self.log_test("Volume sorting", False, "Charts not properly sorted by 24h volume")
                
                # Check total count (should get close to 32 pairs)
                if len(charts) >= 25:  # Allow some flexibility
                    self.log_test("Chart count", True, f"Good chart count: {len(charts)} (target: ~32)")
                else:
                    self.log_test("Chart count", False, f"Low chart count: {len(charts)} (target: ~32)")
                
                # Store first few charts for choice recording tests
                self.test_charts = charts[:5] if len(charts) >= 5 else charts
                return True
            else:
                self.log_test("Trending charts", False, f"Status code: {response.status_code}")
                return False
        except Exception as e:
            self.log_test("Trending charts", False, f"Exception: {str(e)}")
            return False
    
    def test_record_choice(self):
        """Test POST /api/record-choice endpoint"""
        if not self.session_id:
            self.log_test("Record choice", False, "No session ID available")
            return False
        
        if not hasattr(self, 'test_charts') or not self.test_charts:
            self.log_test("Record choice", False, "No chart data available")
            return False
        
        try:
            # Test recording multiple choices
            choices = ["green", "red", "green"]
            for i, choice in enumerate(choices):
                chart_data = self.test_charts[i] if i < len(self.test_charts) else self.test_charts[0]
                
                choice_payload = {
                    "session_id": self.session_id,
                    "chart_index": i,
                    "chart_data": chart_data,
                    "choice": choice,
                    "timestamp": datetime.utcnow().isoformat()
                }
                
                response = requests.post(
                    f"{self.base_url}/api/record-choice",
                    json=choice_payload,
                    headers={"Content-Type": "application/json"}
                )
                
                if response.status_code != 200:
                    self.log_test("Record choice", False, f"Failed to record choice {i}: {response.status_code}")
                    return False
                
                data = response.json()
                if not data.get("success"):
                    self.log_test("Record choice", False, f"Choice {i} not successful: {data}")
                    return False
            
            self.log_test("Record choice", True, f"Recorded {len(choices)} choices")
            return True
            
        except Exception as e:
            self.log_test("Record choice", False, f"Exception: {str(e)}")
            return False
    
    def test_session_results(self):
        """Test GET /api/session-results/{session_id} endpoint"""
        if not self.session_id:
            self.log_test("Session results", False, "No session ID available")
            return False
        
        try:
            response = requests.get(f"{self.base_url}/api/session-results/{self.session_id}")
            if response.status_code == 200:
                data = response.json()
                
                # Check response structure
                required_fields = ["session_id", "total_charts", "green_count", "red_count", "choices"]
                missing_fields = [field for field in required_fields if field not in data]
                if missing_fields:
                    self.log_test("Session results structure", False, f"Missing fields: {missing_fields}")
                    return False
                
                # Validate data consistency
                if data["session_id"] != self.session_id:
                    self.log_test("Session results ID", False, "Session ID mismatch")
                    return False
                
                total_charts = data["total_charts"]
                green_count = data["green_count"]
                red_count = data["red_count"]
                choices = data["choices"]
                
                if len(choices) != total_charts:
                    self.log_test("Session results count", False, f"Choices count mismatch: {len(choices)} vs {total_charts}")
                    return False
                
                if green_count + red_count != total_charts:
                    self.log_test("Session results math", False, f"Count math error: {green_count} + {red_count} != {total_charts}")
                    return False
                
                # Validate choice structure
                if choices:
                    first_choice = choices[0]
                    expected_choice_fields = ["chart_index", "choice", "timestamp"]
                    missing_choice_fields = [field for field in expected_choice_fields if field not in first_choice]
                    if missing_choice_fields:
                        self.log_test("Choice data structure", False, f"Missing choice fields: {missing_choice_fields}")
                        return False
                
                self.log_test("Session results", True, f"Total: {total_charts}, Green: {green_count}, Red: {red_count}")
                return True
            else:
                self.log_test("Session results", False, f"Status code: {response.status_code}")
                return False
        except Exception as e:
            self.log_test("Session results", False, f"Exception: {str(e)}")
            return False
    
    def test_invalid_session_results(self):
        """Test session results with invalid session ID"""
        try:
            fake_session_id = str(uuid.uuid4())
            response = requests.get(f"{self.base_url}/api/session-results/{fake_session_id}")
            if response.status_code == 404:
                self.log_test("Invalid session handling", True, "Correctly returned 404 for invalid session")
                return True
            else:
                self.log_test("Invalid session handling", False, f"Expected 404, got {response.status_code}")
                return False
        except Exception as e:
            self.log_test("Invalid session handling", False, f"Exception: {str(e)}")
            return False
    
    def test_cors_headers(self):
        """Test CORS configuration"""
        try:
            response = requests.options(f"{self.base_url}/api/trending-charts")
            cors_headers = [
                "access-control-allow-origin",
                "access-control-allow-methods",
                "access-control-allow-headers"
            ]
            
            missing_cors = []
            for header in cors_headers:
                if header not in [h.lower() for h in response.headers.keys()]:
                    missing_cors.append(header)
            
            if missing_cors:
                self.log_test("CORS configuration", False, f"Missing CORS headers: {missing_cors}")
                return False
            else:
                self.log_test("CORS configuration", True, "All CORS headers present")
                return True
        except Exception as e:
            self.log_test("CORS configuration", False, f"Exception: {str(e)}")
            return False
    
    def test_data_persistence(self):
        """Test MongoDB data persistence by creating a new session and verifying data"""
        try:
            # Generate new session
            response = requests.get(f"{self.base_url}/api/generate-session")
            if response.status_code != 200:
                self.log_test("Data persistence setup", False, "Failed to generate new session")
                return False
            
            new_session_id = response.json()["session_id"]
            
            # Record a choice
            if hasattr(self, 'test_charts') and self.test_charts:
                choice_payload = {
                    "session_id": new_session_id,
                    "chart_index": 0,
                    "chart_data": self.test_charts[0],
                    "choice": "green",
                    "timestamp": datetime.utcnow().isoformat()
                }
                
                response = requests.post(
                    f"{self.base_url}/api/record-choice",
                    json=choice_payload,
                    headers={"Content-Type": "application/json"}
                )
                
                if response.status_code != 200:
                    self.log_test("Data persistence record", False, "Failed to record choice")
                    return False
                
                # Wait a moment for database write
                time.sleep(1)
                
                # Retrieve and verify
                response = requests.get(f"{self.base_url}/api/session-results/{new_session_id}")
                if response.status_code == 200:
                    data = response.json()
                    if data["total_charts"] == 1 and data["green_count"] == 1:
                        self.log_test("Data persistence", True, "Data correctly persisted and retrieved")
                        return True
                    else:
                        self.log_test("Data persistence", False, f"Data mismatch: {data}")
                        return False
                else:
                    self.log_test("Data persistence retrieve", False, f"Failed to retrieve: {response.status_code}")
                    return False
            else:
                self.log_test("Data persistence", False, "No chart data available for testing")
                return False
        except Exception as e:
            self.log_test("Data persistence", False, f"Exception: {str(e)}")
            return False
    
    def test_store_trending_metadata(self):
        """Test POST /api/store-trending-metadata endpoint"""
        if not self.session_id:
            self.log_test("Store trending metadata", False, "No session ID available")
            return False
        
        if not hasattr(self, 'test_charts') or not self.test_charts:
            self.log_test("Store trending metadata", False, "No chart data available")
            return False
        
        try:
            # Test storing metadata with valid session_id and charts data
            metadata_payload = {
                "session_id": self.session_id,
                "charts": self.test_charts[:3]  # Store first 3 charts
            }
            
            response = requests.post(
                f"{self.base_url}/api/store-trending-metadata",
                json=metadata_payload,
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get("success") and "message" in data:
                    self.log_test("Store trending metadata", True, f"Stored metadata: {data['message']}")
                    return True
                else:
                    self.log_test("Store trending metadata", False, f"Unexpected response: {data}")
                    return False
            else:
                self.log_test("Store trending metadata", False, f"Status code: {response.status_code}")
                return False
        except Exception as e:
            self.log_test("Store trending metadata", False, f"Exception: {str(e)}")
            return False
    
    def test_store_trending_metadata_invalid(self):
        """Test POST /api/store-trending-metadata with invalid data"""
        try:
            # Test with missing session_id
            invalid_payload = {
                "charts": [{"test": "data"}]
            }
            
            response = requests.post(
                f"{self.base_url}/api/store-trending-metadata",
                json=invalid_payload,
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 400:
                self.log_test("Store metadata invalid data", True, "Correctly rejected missing session_id")
                return True
            else:
                self.log_test("Store metadata invalid data", False, f"Expected 400, got {response.status_code}")
                return False
        except Exception as e:
            self.log_test("Store metadata invalid data", False, f"Exception: {str(e)}")
            return False
    
    def test_get_trending_metadata(self):
        """Test GET /api/get-trending-metadata/{session_id} endpoint"""
        if not self.session_id:
            self.log_test("Get trending metadata", False, "No session ID available")
            return False
        
        try:
            response = requests.get(f"{self.base_url}/api/get-trending-metadata/{self.session_id}")
            
            if response.status_code == 200:
                data = response.json()
                
                # Check response structure
                if not data.get("success"):
                    self.log_test("Get trending metadata", False, "Success flag not true")
                    return False
                
                if "charts" not in data:
                    self.log_test("Get trending metadata", False, "Missing charts in response")
                    return False
                
                charts = data["charts"]
                if not isinstance(charts, list):
                    self.log_test("Get trending metadata", False, "Charts is not a list")
                    return False
                
                # Verify data integrity - should match what we stored
                if len(charts) == 3:  # We stored 3 charts
                    self.log_test("Get trending metadata", True, f"Retrieved {len(charts)} charts successfully")
                    
                    # Store retrieved data for comparison test
                    self.retrieved_metadata = charts
                    return True
                else:
                    self.log_test("Get trending metadata", False, f"Expected 3 charts, got {len(charts)}")
                    return False
            else:
                self.log_test("Get trending metadata", False, f"Status code: {response.status_code}")
                return False
        except Exception as e:
            self.log_test("Get trending metadata", False, f"Exception: {str(e)}")
            return False
    
    def test_get_trending_metadata_missing_session(self):
        """Test GET /api/get-trending-metadata/{session_id} with missing session"""
        try:
            fake_session_id = str(uuid.uuid4())
            response = requests.get(f"{self.base_url}/api/get-trending-metadata/{fake_session_id}")
            
            if response.status_code == 404:
                self.log_test("Get metadata missing session", True, "Correctly returned 404 for missing session")
                return True
            else:
                self.log_test("Get metadata missing session", False, f"Expected 404, got {response.status_code}")
                return False
        except Exception as e:
            self.log_test("Get metadata missing session", False, f"Exception: {str(e)}")
            return False
    
    def test_metadata_data_integrity(self):
        """Test data integrity between stored and retrieved metadata"""
        if not hasattr(self, 'test_charts') or not hasattr(self, 'retrieved_metadata'):
            self.log_test("Metadata data integrity", False, "Missing test data for comparison")
            return False
        
        try:
            stored_charts = self.test_charts[:3]  # We stored first 3 charts
            retrieved_charts = self.retrieved_metadata
            
            if len(stored_charts) != len(retrieved_charts):
                self.log_test("Metadata data integrity", False, f"Length mismatch: {len(stored_charts)} vs {len(retrieved_charts)}")
                return False
            
            # Compare key fields of first chart
            if stored_charts and retrieved_charts:
                stored_first = stored_charts[0]
                retrieved_first = retrieved_charts[0]
                
                # Check if pair addresses match (key identifier)
                stored_addr = stored_first.get('pairAddress')
                retrieved_addr = retrieved_first.get('pairAddress')
                
                if stored_addr == retrieved_addr:
                    self.log_test("Metadata data integrity", True, "Stored and retrieved data match")
                    return True
                else:
                    self.log_test("Metadata data integrity", False, f"Pair address mismatch: {stored_addr} vs {retrieved_addr}")
                    return False
            else:
                self.log_test("Metadata data integrity", False, "Empty chart data")
                return False
        except Exception as e:
            self.log_test("Metadata data integrity", False, f"Exception: {str(e)}")
            return False
    
    def run_all_tests(self):
        """Run all backend API tests"""
        print("🚀 Starting Charts Demo Backend API Tests")
        print("=" * 50)
        
        # Test sequence
        tests = [
            ("Backend connectivity", self.test_root_endpoint),
            ("Session generation", self.test_generate_session),
            ("Trending charts API", self.test_trending_charts),
            ("Choice recording", self.test_record_choice),
            ("Session results", self.test_session_results),
            ("Invalid session handling", self.test_invalid_session_results),
            ("CORS configuration", self.test_cors_headers),
            ("Data persistence", self.test_data_persistence)
        ]
        
        for test_name, test_func in tests:
            print(f"\n🔍 Testing: {test_name}")
            test_func()
        
        # Print summary
        print("\n" + "=" * 50)
        print("📊 TEST SUMMARY")
        print("=" * 50)
        print(f"Total Tests: {self.test_results['total_tests']}")
        print(f"Passed: {self.test_results['passed_tests']}")
        print(f"Failed: {self.test_results['failed_tests']}")
        print(f"Success Rate: {(self.test_results['passed_tests']/self.test_results['total_tests']*100):.1f}%")
        
        print("\n📋 DETAILED RESULTS:")
        for detail in self.test_results["test_details"]:
            print(f"  {detail}")
        
        return self.test_results

if __name__ == "__main__":
    tester = ChartsDemoAPITester()
    results = tester.run_all_tests()
    
    # Exit with appropriate code
    if results["failed_tests"] > 0:
        exit(1)
    else:
        exit(0)