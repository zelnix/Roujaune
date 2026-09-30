#!/usr/bin/env python3
"""
Backend test suite for ERG mode data export and video generation endpoints.

Tests the newly fixed endpoints after the user_id mismatch bug fix:
1. Login with demo credentials
2. GET /api/rides/flythrough-test-001/metrics
3. GET /api/rides/flythrough-test-001/export/fit
4. GET /api/rides/flythrough-test-001/share-video
5. GET /api/rides/flythrough-test-001/flythrough
6. GET /api/routes/alpine-sunset-pass/geojson
7. Negative tests (404, 401)
"""
import sys
import requests
import time

# Backend URL - use the public URL from frontend/.env
BACKEND_URL = "https://scenic-trainer.preview.emergentagent.com"
API_BASE = f"{BACKEND_URL}/api"

# Test credentials
DEMO_EMAIL = "demo@roujaune.app"
DEMO_PASSWORD = "demo9900"

# Test data
TEST_RIDE_ID = "flythrough-test-001"
TEST_ROUTE_ID = "alpine-sunset-pass"

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    END = '\033[0m'

class TestRunner:
    def __init__(self):
        self.token = None
        self.passed = 0
        self.failed = 0
        self.errors = []
        
    def log(self, msg, level="INFO"):
        color = Colors.BLUE
        if level == "PASS":
            color = Colors.GREEN
        elif level == "FAIL":
            color = Colors.RED
        elif level == "WARN":
            color = Colors.YELLOW
        print(f"{color}[{level}]{Colors.END} {msg}")
        
    def assert_true(self, condition, msg):
        if condition:
            self.passed += 1
            self.log(f"✅ {msg}", "PASS")
        else:
            self.failed += 1
            self.errors.append(msg)
            self.log(f"❌ {msg}", "FAIL")
            
    def assert_equal(self, actual, expected, msg):
        if actual == expected:
            self.passed += 1
            self.log(f"✅ {msg}", "PASS")
        else:
            self.failed += 1
            error = f"{msg} (expected: {expected}, got: {actual})"
            self.errors.append(error)
            self.log(f"❌ {error}", "FAIL")
            
    def test_1_login(self):
        """Test 1: Login with demo credentials"""
        self.log("\n" + "="*80)
        self.log("TEST 1: Login - POST /api/auth/login")
        self.log("="*80)
        
        try:
            resp = requests.post(
                f"{API_BASE}/auth/login",
                json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
                timeout=10
            )
            
            self.assert_equal(resp.status_code, 200, "Login returns 200 OK")
            
            if resp.status_code == 200:
                data = resp.json()
                self.token = data.get("token")
                self.assert_true(self.token is not None, "Token received in response")
                self.log(f"Token: {self.token[:20]}...", "INFO")
            else:
                self.log(f"Login failed: {resp.status_code} - {resp.text}", "FAIL")
                
        except Exception as e:
            self.log(f"Login error: {e}", "FAIL")
            self.assert_true(False, f"Login request failed: {e}")
            
    def test_2_ride_metrics(self):
        """Test 2: GET /api/rides/flythrough-test-001/metrics"""
        self.log("\n" + "="*80)
        self.log("TEST 2: Ride Metrics - GET /api/rides/flythrough-test-001/metrics")
        self.log("="*80)
        
        if not self.token:
            self.log("Skipping - no auth token", "WARN")
            return
            
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            resp = requests.get(
                f"{API_BASE}/rides/{TEST_RIDE_ID}/metrics",
                headers=headers,
                timeout=10
            )
            
            self.assert_equal(resp.status_code, 200, "Metrics endpoint returns 200")
            
            if resp.status_code == 200:
                data = resp.json()
                self.log(f"Response: {data}", "INFO")
                
                # Check required fields
                self.assert_equal(data.get("id"), TEST_RIDE_ID, "Response contains correct ride ID")
                self.assert_true("avg_power" in data, "Response contains avg_power field")
                self.assert_true("max_power" in data, "Response contains max_power field")
                self.assert_true("normalized_power" in data, "Response contains normalized_power field")
                self.assert_true("intensity_factor" in data, "Response contains intensity_factor field")
                self.assert_true("tss" in data, "Response contains tss field")
                self.assert_true("ftp_used" in data, "Response contains ftp_used field")
                self.assert_true("duration_sec" in data, "Response contains duration_sec field")
                self.assert_true("calories" in data, "Response contains calories field")
                
                # Log values
                self.log(f"Avg Power: {data.get('avg_power')} W", "INFO")
                self.log(f"Max Power: {data.get('max_power')} W", "INFO")
                self.log(f"Normalized Power: {data.get('normalized_power')} W", "INFO")
                self.log(f"Intensity Factor: {data.get('intensity_factor')}", "INFO")
                self.log(f"TSS: {data.get('tss')}", "INFO")
                self.log(f"Duration: {data.get('duration_sec')} sec", "INFO")
            else:
                self.log(f"Metrics request failed: {resp.status_code} - {resp.text}", "FAIL")
                
        except Exception as e:
            self.log(f"Metrics test error: {e}", "FAIL")
            self.assert_true(False, f"Metrics request failed: {e}")
            
    def test_3_fit_export(self):
        """Test 3: GET /api/rides/flythrough-test-001/export/fit"""
        self.log("\n" + "="*80)
        self.log("TEST 3: FIT Export - GET /api/rides/flythrough-test-001/export/fit")
        self.log("="*80)
        
        if not self.token:
            self.log("Skipping - no auth token", "WARN")
            return
            
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            resp = requests.get(
                f"{API_BASE}/rides/{TEST_RIDE_ID}/export/fit",
                headers=headers,
                timeout=30
            )
            
            self.assert_equal(resp.status_code, 200, "FIT export returns 200")
            
            if resp.status_code == 200:
                self.assert_equal(
                    resp.headers.get("content-type"),
                    "application/octet-stream",
                    "Content-Type is application/octet-stream"
                )
                
                content_length = len(resp.content)
                self.assert_true(
                    content_length > 1000,
                    f"FIT file size > 1000 bytes (actual: {content_length} bytes)"
                )
                
                # Check for FIT file signature
                has_fit_marker = b'.FIT' in resp.content[:50]
                self.assert_true(has_fit_marker, "FIT file contains .FIT marker")
                
                self.log(f"FIT file size: {content_length} bytes", "INFO")
            else:
                self.log(f"FIT export failed: {resp.status_code} - {resp.text}", "FAIL")
                
        except Exception as e:
            self.log(f"FIT export test error: {e}", "FAIL")
            self.assert_true(False, f"FIT export request failed: {e}")
            
    def test_4_share_video(self):
        """Test 4: GET /api/rides/flythrough-test-001/share-video"""
        self.log("\n" + "="*80)
        self.log("TEST 4: Share Video - GET /api/rides/flythrough-test-001/share-video")
        self.log("="*80)
        self.log("NOTE: This endpoint takes ~30 seconds to generate the video", "INFO")
        
        if not self.token:
            self.log("Skipping - no auth token", "WARN")
            return
            
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            start_time = time.time()
            
            resp = requests.get(
                f"{API_BASE}/rides/{TEST_RIDE_ID}/share-video",
                headers=headers,
                timeout=120  # 2 minutes timeout
            )
            
            elapsed = time.time() - start_time
            self.log(f"Request took {elapsed:.1f} seconds", "INFO")
            
            self.assert_equal(resp.status_code, 200, "Share video returns 200")
            
            if resp.status_code == 200:
                self.assert_equal(
                    resp.headers.get("content-type"),
                    "video/mp4",
                    "Content-Type is video/mp4"
                )
                
                content_length = len(resp.content)
                self.assert_true(
                    content_length > 10000,
                    f"Video file size > 10000 bytes (actual: {content_length} bytes)"
                )
                
                # Check for MP4 file signature (ftyp box)
                has_mp4_marker = b'ftyp' in resp.content[:50]
                self.assert_true(has_mp4_marker, "MP4 file contains ftyp marker")
                
                self.log(f"Video file size: {content_length} bytes", "INFO")
            else:
                self.log(f"Share video failed: {resp.status_code} - {resp.text}", "FAIL")
                
        except Exception as e:
            self.log(f"Share video test error: {e}", "FAIL")
            self.assert_true(False, f"Share video request failed: {e}")
            
    def test_5_flythrough_video(self):
        """Test 5: GET /api/rides/flythrough-test-001/flythrough"""
        self.log("\n" + "="*80)
        self.log("TEST 5: Flythrough Video - GET /api/rides/flythrough-test-001/flythrough")
        self.log("="*80)
        self.log("NOTE: This endpoint takes ~2 minutes to generate the video", "INFO")
        
        if not self.token:
            self.log("Skipping - no auth token", "WARN")
            return
            
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            start_time = time.time()
            
            resp = requests.get(
                f"{API_BASE}/rides/{TEST_RIDE_ID}/flythrough",
                headers=headers,
                timeout=300  # 5 minutes timeout
            )
            
            elapsed = time.time() - start_time
            self.log(f"Request took {elapsed:.1f} seconds", "INFO")
            
            self.assert_equal(resp.status_code, 200, "Flythrough video returns 200")
            
            if resp.status_code == 200:
                self.assert_equal(
                    resp.headers.get("content-type"),
                    "video/mp4",
                    "Content-Type is video/mp4"
                )
                
                content_length = len(resp.content)
                self.assert_true(
                    content_length > 100000,
                    f"Video file size > 100000 bytes (actual: {content_length} bytes)"
                )
                
                # Check for MP4 file signature (ftyp box)
                has_mp4_marker = b'ftyp' in resp.content[:50]
                self.assert_true(has_mp4_marker, "MP4 file contains ftyp marker")
                
                self.log(f"Video file size: {content_length} bytes", "INFO")
            else:
                self.log(f"Flythrough video failed: {resp.status_code} - {resp.text}", "FAIL")
                
        except Exception as e:
            self.log(f"Flythrough video test error: {e}", "FAIL")
            self.assert_true(False, f"Flythrough video request failed: {e}")
            
    def test_6_route_geojson(self):
        """Test 6: GET /api/routes/alpine-sunset-pass/geojson"""
        self.log("\n" + "="*80)
        self.log("TEST 6: Route GeoJSON - GET /api/routes/alpine-sunset-pass/geojson")
        self.log("="*80)
        
        if not self.token:
            self.log("Skipping - no auth token", "WARN")
            return
            
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            resp = requests.get(
                f"{API_BASE}/routes/{TEST_ROUTE_ID}/geojson",
                headers=headers,
                timeout=10
            )
            
            self.assert_equal(resp.status_code, 200, "Route GeoJSON returns 200")
            
            if resp.status_code == 200:
                data = resp.json()
                self.log(f"Response keys: {list(data.keys())}", "INFO")
                
                # Check GeoJSON structure
                self.assert_equal(data.get("type"), "Feature", "GeoJSON type is Feature")
                self.assert_true("geometry" in data, "GeoJSON contains geometry")
                
                if "geometry" in data:
                    geometry = data["geometry"]
                    self.assert_equal(geometry.get("type"), "LineString", "Geometry type is LineString")
                    self.assert_true("coordinates" in geometry, "Geometry contains coordinates")
                    
                    if "coordinates" in geometry:
                        coords = geometry["coordinates"]
                        self.assert_true(
                            len(coords) >= 10,
                            f"Coordinates array has >= 10 points (actual: {len(coords)})"
                        )
                        self.log(f"Number of coordinates: {len(coords)}", "INFO")
                        self.log(f"First coordinate: {coords[0]}", "INFO")
                        self.log(f"Last coordinate: {coords[-1]}", "INFO")
            else:
                self.log(f"Route GeoJSON failed: {resp.status_code} - {resp.text}", "FAIL")
                
        except Exception as e:
            self.log(f"Route GeoJSON test error: {e}", "FAIL")
            self.assert_true(False, f"Route GeoJSON request failed: {e}")
            
    def test_7_negative_invalid_ride(self):
        """Test 7: Negative test - invalid ride ID should return 404"""
        self.log("\n" + "="*80)
        self.log("TEST 7: Negative Test - GET /api/rides/nonexistent-ride-999/metrics")
        self.log("="*80)
        
        if not self.token:
            self.log("Skipping - no auth token", "WARN")
            return
            
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            resp = requests.get(
                f"{API_BASE}/rides/nonexistent-ride-999/metrics",
                headers=headers,
                timeout=10
            )
            
            self.assert_equal(resp.status_code, 404, "Invalid ride ID returns 404")
            
        except Exception as e:
            self.log(f"Negative test error: {e}", "FAIL")
            self.assert_true(False, f"Negative test request failed: {e}")
            
    def test_8_negative_no_auth(self):
        """Test 8: Negative test - no auth token should return 401"""
        self.log("\n" + "="*80)
        self.log("TEST 8: Negative Test - GET /api/rides/flythrough-test-001/metrics (no auth)")
        self.log("="*80)
        
        try:
            # Request without Authorization header
            resp = requests.get(
                f"{API_BASE}/rides/{TEST_RIDE_ID}/metrics",
                timeout=10
            )
            
            self.assert_equal(resp.status_code, 401, "No auth token returns 401")
            
        except Exception as e:
            self.log(f"Negative test error: {e}", "FAIL")
            self.assert_true(False, f"Negative test request failed: {e}")
            
    def run_all_tests(self):
        """Run all tests"""
        self.log("\n" + "="*80)
        self.log("ROUJAUNE ERG Mode Data Export & Video Generation Test Suite")
        self.log("="*80)
        self.log(f"Backend URL: {BACKEND_URL}", "INFO")
        self.log(f"Test Ride ID: {TEST_RIDE_ID}", "INFO")
        self.log(f"Test Route ID: {TEST_ROUTE_ID}", "INFO")
        
        # Run all tests in order
        self.test_1_login()
        
        if not self.token:
            self.log("\n❌ Cannot proceed without authentication", "FAIL")
            return False
            
        self.test_2_ride_metrics()
        self.test_3_fit_export()
        self.test_4_share_video()
        self.test_5_flythrough_video()
        self.test_6_route_geojson()
        self.test_7_negative_invalid_ride()
        self.test_8_negative_no_auth()
        
        # Summary
        self.log("\n" + "="*80)
        self.log("TEST SUMMARY")
        self.log("="*80)
        self.log(f"✅ Passed: {self.passed}", "PASS" if self.failed == 0 else "INFO")
        self.log(f"❌ Failed: {self.failed}", "FAIL" if self.failed > 0 else "INFO")
        
        if self.errors:
            self.log("\nFailed Tests:", "FAIL")
            for error in self.errors:
                self.log(f"  - {error}", "FAIL")
        else:
            self.log("\n🎉 All tests passed!", "PASS")
                
        return self.failed == 0

if __name__ == "__main__":
    runner = TestRunner()
    success = runner.run_all_tests()
    sys.exit(0 if success else 1)
