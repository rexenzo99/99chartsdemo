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
        """Test GET /api/trending-charts endpoint"""
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
                
                # Validate chart data structure
                if charts:
                    first_chart = charts[0]
                    expected_chart_fields = ["pairAddress"]
                    missing_chart_fields = [field for field in expected_chart_fields if field not in first_chart]
                    if missing_chart_fields:
                        self.log_test("Chart data structure", False, f"Missing chart fields: {missing_chart_fields}")
                        return False
                
                self.log_test("Trending charts", True, f"Retrieved {len(charts)} charts")
                
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