#!/usr/bin/env python3
"""
Simple backend test for ROUJAUNE newly added features
"""
import sys
import os
import requests

sys.path.insert(0, '/app/backend')

BACKEND_URL = os.getenv('REACT_APP_BACKEND_URL', 'https://scenic-trainer.preview.emergentagent.com')
API_BASE = f"{BACKEND_URL}/api"

# Test credentials
DEMO_EMAIL = "demo@roujaune.app"
DEMO_PASSWORD = "demo9900"

# Test ride ID (created earlier)
TEST_RIDE_ID = "test-ride-d4b42006"

def test_all():
    print("=" * 80)
    print("ROUJAUNE Backend Test - New Features (Simple)")
    print("=" * 80)
    
    # Login
    print("\n1. Logging in...")
    resp = requests.post(f"{API_BASE}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=10)
    assert resp.status_code == 200, f"Login failed: {resp.status_code}"
    token = resp.json().get("token")
    assert token, "No token received"
    print("✅ Login successful")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Test 1: Power Metrics Module
    print("\n2. Testing Power Metrics Module...")
    from services.power_metrics import compute_all, normalized_power, pad_gaps
    
    power = [200 + (i % 10) for i in range(60)]
    result = compute_all(power, 60, 250)
    assert result['normalized_power'] is not None, "NP not computed"
    assert result['intensity_factor'] is not None, "IF not computed"
    assert result['tss'] is not None, "TSS not computed"
    assert result['normalized_power'] >= result['avg_power'], "NP should be >= avg for variable power"
    print(f"✅ Power Metrics: NP={result['normalized_power']}, IF={result['intensity_factor']}, TSS={result['tss']}")
    
    # Test with short array
    short_result = compute_all([200] * 20, 20, 250)
    assert short_result['normalized_power'] is not None, "NP should handle short arrays"
    print("✅ Power Metrics handles short arrays")
    
    # Test with zeros
    zero_result = compute_all([200, 0, 0, 200, 0] * 12, 60, 250)
    assert zero_result['normalized_power'] is not None, "NP should handle zeros"
    print("✅ Power Metrics handles zeros (coasting)")
    
    # Test 2: FIT Builder Module
    print("\n3. Testing FIT Builder Module...")
    from services.fit_builder import build_fit_activity
    from datetime import datetime, timezone
    
    samples = [{'power': 200, 'hr': 150, 'cadence': 90, 'speed': 30} for _ in range(60)]
    data = build_fit_activity(samples=samples, start_time=datetime.now(timezone.utc), elapsed_sec=60, ftp=250)
    assert len(data) > 100, f"FIT file too small: {len(data)} bytes"
    assert b'.FIT' in data[:20], "FIT file missing .FIT marker"
    print(f"✅ FIT Builder: {len(data)} bytes, valid format")
    
    # Test 3: Ride Metrics Endpoint
    print("\n4. Testing Ride Metrics Endpoint...")
    resp = requests.get(f"{API_BASE}/rides/nonexistent/metrics", headers=headers, timeout=10)
    assert resp.status_code == 404, "Should return 404 for non-existent ride"
    print("✅ Returns 404 for non-existent ride")
    
    resp = requests.get(f"{API_BASE}/rides/{TEST_RIDE_ID}/metrics", headers=headers, timeout=10)
    assert resp.status_code == 200, f"Metrics endpoint failed: {resp.status_code}"
    data = resp.json()
    assert data['id'] == TEST_RIDE_ID, "Wrong ride ID in response"
    assert 'normalized_power' in data, "Missing NP in response"
    assert 'intensity_factor' in data, "Missing IF in response"
    assert 'tss' in data, "Missing TSS in response"
    print(f"✅ Ride Metrics: NP={data['normalized_power']}, IF={data['intensity_factor']}, TSS={data['tss']}")
    
    # Test 4: FIT Export Endpoint
    print("\n5. Testing FIT Export Endpoint...")
    resp = requests.get(f"{API_BASE}/rides/nonexistent/export/fit", headers=headers, timeout=10)
    assert resp.status_code == 404, "Should return 404 for non-existent ride"
    print("✅ Returns 404 for non-existent ride")
    
    resp = requests.get(f"{API_BASE}/rides/{TEST_RIDE_ID}/export/fit", headers=headers, timeout=30)
    assert resp.status_code == 200, f"FIT export failed: {resp.status_code} - {resp.text}"
    assert resp.headers.get('content-type') == 'application/octet-stream', "Wrong content-type"
    assert 'Content-Disposition' in resp.headers, "Missing Content-Disposition"
    assert len(resp.content) > 100, f"FIT file too small: {len(resp.content)} bytes"
    assert b'.FIT' in resp.content[:20], "FIT file missing .FIT marker"
    print(f"✅ FIT Export: {len(resp.content)} bytes, valid format")
    
    # Test 5: Share Video Module
    print("\n6. Testing Share Video Module...")
    from services.share_video import generate_share_video
    
    samples = [{'power': 200, 'hr': 150, 'cadence': 90} for _ in range(30)]
    metrics = {'avg_power': 200, 'normalized_power': 205, 'tss': 5, 'avg_hr': 150, 'intensity_factor': 0.82, 'duration_label': '0:30'}
    mp4 = generate_share_video(samples=samples, metrics=metrics, workout_name='Test', duration_sec=3, fps=10)
    assert len(mp4) > 1000, f"MP4 too small: {len(mp4)} bytes"
    assert b'ftyp' in mp4[:20], "MP4 missing ftyp marker"
    print(f"✅ Share Video: {len(mp4)} bytes, valid MP4")
    
    # Test 6: Share Video Endpoint
    print("\n7. Testing Share Video Endpoint...")
    resp = requests.get(f"{API_BASE}/rides/nonexistent/share-video", headers=headers, timeout=10)
    assert resp.status_code == 404, "Should return 404 for non-existent ride"
    print("✅ Returns 404 for non-existent ride")
    
    resp = requests.get(f"{API_BASE}/rides/{TEST_RIDE_ID}/share-video", headers=headers, timeout=60)
    assert resp.status_code == 200, f"Share video failed: {resp.status_code} - {resp.text}"
    assert resp.headers.get('content-type') == 'video/mp4', "Wrong content-type"
    assert 'Content-Disposition' in resp.headers, "Missing Content-Disposition"
    assert len(resp.content) > 1000, f"MP4 too small: {len(resp.content)} bytes"
    assert b'ftyp' in resp.content[:20], "MP4 missing ftyp marker"
    print(f"✅ Share Video Endpoint: {len(resp.content)} bytes, valid MP4")
    
    print("\n" + "=" * 80)
    print("✅ ALL TESTS PASSED!")
    print("=" * 80)

if __name__ == "__main__":
    try:
        test_all()
        sys.exit(0)
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
