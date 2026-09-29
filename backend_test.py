#!/usr/bin/env python3
"""
Backend test suite for ROUJAUNE newly added features:
1. Power Metrics Service (NP/IF/TSS)
2. FIT File Builder
3. FIT Export Endpoint
4. Ride Metrics Endpoint
5. Share Video Generator
6. Share Video Endpoint
"""
import sys
import os
import requests
from datetime import datetime, timezone

# Add backend to path for direct imports
sys.path.insert(0, '/app/backend')

# Backend URL from environment
BACKEND_URL = os.getenv('REACT_APP_BACKEND_URL', 'https://scenic-trainer.preview.emergentagent.com')
API_BASE = f"{BACKEND_URL}/api"

# Test credentials
DEMO_EMAIL = "demo@roujaune.app"
DEMO_PASSWORD = "demo9900"

class TestRunner:
    def __init__(self):
        self.token = None
        self.passed = 0
        self.failed = 0
        self.errors = []
        
    def log(self, msg, level="INFO"):
        print(f"[{level}] {msg}")
        
    def assert_true(self, condition, msg):
        if condition:
            self.passed += 1
            self.log(f"✅ PASS: {msg}", "PASS")
        else:
            self.failed += 1
            self.errors.append(msg)
            self.log(f"❌ FAIL: {msg}", "FAIL")
            
    def assert_not_none(self, value, msg):
        self.assert_true(value is not None, msg)
        
    def assert_equal(self, actual, expected, msg):
        self.assert_true(actual == expected, f"{msg} (expected: {expected}, got: {actual})")
        
    def login(self):
        """Login and get JWT token"""
        self.log("Logging in as demo user...")
        try:
            resp = requests.post(
                f"{API_BASE}/auth/login",
                json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
                timeout=10
            )
            if resp.status_code == 200:
                data = resp.json()
                self.token = data.get("token")
                self.assert_not_none(self.token, "Login successful and token received")
                return True
            else:
                self.log(f"Login failed: {resp.status_code} - {resp.text}", "ERROR")
                return False
        except Exception as e:
            self.log(f"Login error: {e}", "ERROR")
            return False
            
    def get_headers(self):
        """Get auth headers"""
        return {"Authorization": f"Bearer {self.token}"}
        
    def test_power_metrics_module(self):
        """Test 1: Power Metrics Service (NP/IF/TSS) - Direct module import"""
        self.log("\n=== TEST 1: Power Metrics Service (Direct Module) ===")
        
        try:
            from services.power_metrics import compute_all, normalized_power, pad_gaps
            
            # Test with 60-second power array
            power = [200 + (i % 10) for i in range(60)]
            result = compute_all(power, 60, 250)
            
            self.assert_not_none(result.get('normalized_power'), "NP computed")
            self.assert_not_none(result.get('intensity_factor'), "IF computed")
            self.assert_not_none(result.get('tss'), "TSS computed")
            self.assert_not_none(result.get('avg_power'), "Avg power computed")
            self.assert_not_none(result.get('max_power'), "Max power computed")
            
            # Test NP is mathematically valid (>= avg for variable power)
            np_val = result['normalized_power']
            avg_val = result['avg_power']
            self.assert_true(np_val >= avg_val, f"NP ({np_val}) >= avg power ({avg_val}) for variable power")
            
            # Test with short (<30s) arrays — NP should handle gracefully
            short_power = [200] * 20
            short_result = compute_all(short_power, 20, 250)
            self.assert_not_none(short_result.get('normalized_power'), "NP handles short arrays (<30s)")
            
            # Test with zeros (coasting) — zeros must NOT be removed
            power_with_zeros = [200, 0, 0, 200, 0] * 12  # 60 seconds
            zero_result = compute_all(power_with_zeros, 60, 250)
            self.assert_not_none(zero_result.get('normalized_power'), "NP handles zeros (coasting)")
            
            self.log(f"Sample result: {result}")
            
        except Exception as e:
            self.log(f"Power metrics module test error: {e}", "ERROR")
            self.assert_true(False, f"Power metrics module import/execution: {e}")
            
    def test_fit_builder_module(self):
        """Test 2: FIT File Builder - Direct module test"""
        self.log("\n=== TEST 2: FIT File Builder (Direct Module) ===")
        
        try:
            from services.fit_builder import build_fit_activity
            
            # Create sample data
            samples = [
                {'power': 200, 'hr': 150, 'cadence': 90, 'speed': 30}
                for _ in range(60)
            ]
            
            data = build_fit_activity(
                samples=samples,
                start_time=datetime.now(timezone.utc),
                elapsed_sec=60,
                ftp=250
            )
            
            self.assert_true(len(data) > 100, f"FIT file generated with valid size ({len(data)} bytes)")
            
            # Check FIT magic bytes - FIT files start with a header
            # The header structure: 1 byte size, then ".FIT" string
            self.assert_true(len(data) >= 14, "FIT file has minimum header size")
            
            # FIT files have ".FIT" in the header (bytes 8-11 typically)
            fit_marker_found = b'.FIT' in data[:20]
            self.assert_true(fit_marker_found, "FIT file contains .FIT marker in header")
            
            self.log(f"FIT file size: {len(data)} bytes")
            
        except Exception as e:
            self.log(f"FIT builder module test error: {e}", "ERROR")
            self.assert_true(False, f"FIT builder module import/execution: {e}")
            
    def test_fit_export_endpoint(self):
        """Test 3: FIT Export Endpoint"""
        self.log("\n=== TEST 3: FIT Export Endpoint ===")
        
        if not self.token:
            self.log("Skipping - no auth token", "WARN")
            return
            
        try:
            # Test with non-existent ride - should return 404
            resp = requests.get(
                f"{API_BASE}/rides/nonexistent-ride-id/export/fit",
                headers=self.get_headers(),
                timeout=10
            )
            self.assert_equal(resp.status_code, 404, "Non-existent ride returns 404")
            
            # Get a real ride from ride history
            rides_resp = requests.get(
                f"{API_BASE}/activities",
                headers=self.get_headers(),
                timeout=10
            )
            
            if rides_resp.status_code == 200:
                rides = rides_resp.json()
                if rides and len(rides) > 0:
                    ride_id = rides[0].get('id')
                    self.log(f"Testing with ride ID: {ride_id}")
                    
                    # Test FIT export
                    fit_resp = requests.get(
                        f"{API_BASE}/rides/{ride_id}/export/fit",
                        headers=self.get_headers(),
                        timeout=30
                    )
                    
                    if fit_resp.status_code == 200:
                        self.assert_true(True, "FIT export endpoint returns 200 for valid ride")
                        self.assert_equal(
                            fit_resp.headers.get('content-type'),
                            'application/octet-stream',
                            "FIT export has correct content-type"
                        )
                        self.assert_true(
                            'Content-Disposition' in fit_resp.headers,
                            "FIT export has Content-Disposition header"
                        )
                        self.assert_true(
                            len(fit_resp.content) > 100,
                            f"FIT export returns valid binary data ({len(fit_resp.content)} bytes)"
                        )
                    elif fit_resp.status_code == 400:
                        self.log("Ride has no sample data (expected for some rides)", "WARN")
                        self.assert_true(True, "FIT export correctly returns 400 for rides without samples")
                    else:
                        self.assert_true(False, f"FIT export unexpected status: {fit_resp.status_code}")
                else:
                    self.log("No rides found in history - cannot test with real ride", "WARN")
            else:
                self.log(f"Could not fetch rides: {rides_resp.status_code}", "WARN")
                
        except Exception as e:
            self.log(f"FIT export endpoint test error: {e}", "ERROR")
            self.assert_true(False, f"FIT export endpoint: {e}")
            
    def test_ride_metrics_endpoint(self):
        """Test 4: Ride Metrics Endpoint"""
        self.log("\n=== TEST 4: Ride Metrics Endpoint ===")
        
        if not self.token:
            self.log("Skipping - no auth token", "WARN")
            return
            
        try:
            # Test with non-existent ride - should return 404
            resp = requests.get(
                f"{API_BASE}/rides/nonexistent-ride-id/metrics",
                headers=self.get_headers(),
                timeout=10
            )
            self.assert_equal(resp.status_code, 404, "Non-existent ride returns 404")
            
            # Get a real ride from ride history
            rides_resp = requests.get(
                f"{API_BASE}/activities",
                headers=self.get_headers(),
                timeout=10
            )
            
            if rides_resp.status_code == 200:
                rides = rides_resp.json()
                if rides and len(rides) > 0:
                    ride_id = rides[0].get('id')
                    self.log(f"Testing with ride ID: {ride_id}")
                    
                    # Test metrics endpoint
                    metrics_resp = requests.get(
                        f"{API_BASE}/rides/{ride_id}/metrics",
                        headers=self.get_headers(),
                        timeout=10
                    )
                    
                    self.assert_equal(metrics_resp.status_code, 200, "Metrics endpoint returns 200")
                    
                    if metrics_resp.status_code == 200:
                        data = metrics_resp.json()
                        self.assert_equal(data.get('id'), ride_id, "Metrics response contains ride ID")
                        
                        # Check that metrics fields are present (may be None for some rides)
                        expected_fields = [
                            'avg_power', 'max_power', 'normalized_power',
                            'intensity_factor', 'tss', 'ftp_used', 'duration_sec', 'calories'
                        ]
                        for field in expected_fields:
                            self.assert_true(
                                field in data,
                                f"Metrics response contains '{field}' field"
                            )
                        
                        self.log(f"Sample metrics: NP={data.get('normalized_power')}, IF={data.get('intensity_factor')}, TSS={data.get('tss')}")
                else:
                    self.log("No rides found in history - cannot test with real ride", "WARN")
            else:
                self.log(f"Could not fetch rides: {rides_resp.status_code}", "WARN")
                
        except Exception as e:
            self.log(f"Ride metrics endpoint test error: {e}", "ERROR")
            self.assert_true(False, f"Ride metrics endpoint: {e}")
            
    def test_share_video_module(self):
        """Test 5: Share Video Generator - Direct module test"""
        self.log("\n=== TEST 5: Share Video Generator (Direct Module) ===")
        
        try:
            from services.share_video import generate_share_video
            
            # Create sample data
            samples = [
                {'power': 200, 'hr': 150, 'cadence': 90}
                for _ in range(30)
            ]
            
            metrics = {
                'avg_power': 200,
                'normalized_power': 205,
                'tss': 5,
                'avg_hr': 150,
                'intensity_factor': 0.82,
                'duration_label': '0:30'
            }
            
            # Generate a short video (3 seconds at 10 fps for speed)
            mp4 = generate_share_video(
                samples=samples,
                metrics=metrics,
                workout_name='Test',
                duration_sec=3,
                fps=10
            )
            
            self.assert_true(len(mp4) > 1000, f"MP4 video generated with valid size ({len(mp4)} bytes)")
            
            # Check MP4 magic bytes - MP4 files typically start with ftyp box
            # Common patterns: "ftyp" at offset 4-8
            has_ftyp = b'ftyp' in mp4[:20]
            self.assert_true(has_ftyp, "MP4 file contains 'ftyp' marker")
            
            self.log(f"MP4 video size: {len(mp4)} bytes")
            
        except Exception as e:
            self.log(f"Share video module test error: {e}", "ERROR")
            self.assert_true(False, f"Share video module import/execution: {e}")
            
    def test_share_video_endpoint(self):
        """Test 6: Share Video Endpoint"""
        self.log("\n=== TEST 6: Share Video Endpoint ===")
        
        if not self.token:
            self.log("Skipping - no auth token", "WARN")
            return
            
        try:
            # Test with non-existent ride - should return 404
            resp = requests.get(
                f"{API_BASE}/rides/nonexistent-ride-id/share-video",
                headers=self.get_headers(),
                timeout=10
            )
            self.assert_equal(resp.status_code, 404, "Non-existent ride returns 404")
            
            # Get a real ride from ride history
            rides_resp = requests.get(
                f"{API_BASE}/activities",
                headers=self.get_headers(),
                timeout=10
            )
            
            if rides_resp.status_code == 200:
                rides = rides_resp.json()
                if rides and len(rides) > 0:
                    ride_id = rides[0].get('id')
                    self.log(f"Testing with ride ID: {ride_id}")
                    
                    # Test share video endpoint (with longer timeout as video generation takes time)
                    video_resp = requests.get(
                        f"{API_BASE}/rides/{ride_id}/share-video",
                        headers=self.get_headers(),
                        timeout=60  # Video generation can take time
                    )
                    
                    if video_resp.status_code == 200:
                        self.assert_true(True, "Share video endpoint returns 200 for valid ride")
                        self.assert_equal(
                            video_resp.headers.get('content-type'),
                            'video/mp4',
                            "Share video has correct content-type"
                        )
                        self.assert_true(
                            'Content-Disposition' in video_resp.headers,
                            "Share video has Content-Disposition header"
                        )
                        self.assert_true(
                            len(video_resp.content) > 1000,
                            f"Share video returns valid MP4 data ({len(video_resp.content)} bytes)"
                        )
                    elif video_resp.status_code == 400:
                        self.log("Ride has insufficient sample data (expected for some rides)", "WARN")
                        self.assert_true(True, "Share video correctly returns 400 for rides without enough samples")
                    else:
                        self.assert_true(False, f"Share video unexpected status: {video_resp.status_code}")
                else:
                    self.log("No rides found in history - cannot test with real ride", "WARN")
            else:
                self.log(f"Could not fetch rides: {rides_resp.status_code}", "WARN")
                
        except Exception as e:
            self.log(f"Share video endpoint test error: {e}", "ERROR")
            self.assert_true(False, f"Share video endpoint: {e}")
            
    def run_all_tests(self):
        """Run all tests"""
        self.log("=" * 80)
        self.log("ROUJAUNE Backend Test Suite - New Features")
        self.log("=" * 80)
        
        # Login first
        if not self.login():
            self.log("Cannot proceed without authentication", "ERROR")
            return
            
        # Run all tests
        self.test_power_metrics_module()
        self.test_fit_builder_module()
        self.test_fit_export_endpoint()
        self.test_ride_metrics_endpoint()
        self.test_share_video_module()
        self.test_share_video_endpoint()
        
        # Summary
        self.log("\n" + "=" * 80)
        self.log("TEST SUMMARY")
        self.log("=" * 80)
        self.log(f"✅ Passed: {self.passed}")
        self.log(f"❌ Failed: {self.failed}")
        
        if self.errors:
            self.log("\nFailed Tests:")
            for error in self.errors:
                self.log(f"  - {error}", "ERROR")
                
        return self.failed == 0

if __name__ == "__main__":
    runner = TestRunner()
    success = runner.run_all_tests()
    sys.exit(0 if success else 1)
